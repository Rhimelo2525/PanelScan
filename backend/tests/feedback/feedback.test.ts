import { NotificationType, OrderStatus } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import {
  createCustomer,
  createModerator,
  createOwner,
  createTestFeedback,
  createTestOrder,
  createTestProduct,
} from '../helpers/factories';
import app from '../helpers/testApp';

const expectApiSuccess = (response: request.Response, status: number, message?: string): void => {
  expect(response.status).toBe(status);
  expect(response.body.success).toBe(true);
  if (message) {
    expect(response.body.message).toBe(message);
  } else {
    expect(typeof response.body.message).toBe('string');
  }
};

const expectApiError = (response: request.Response, status: number, messageMatch?: string | RegExp): void => {
  expect(response.status).toBe(status);
  expect(response.body.success).toBe(false);
  expect(typeof response.body.message).toBe('string');
  if (messageMatch) {
    expect(response.body.message).toMatch(messageMatch);
  }
};

/** Seeds a customer with a DELIVERED order, ready for feedback. */
const setupDeliveredOrder = async (productId?: string) => {
  const customer = await createCustomer();
  const product = productId ? undefined : await createTestProduct({ price: 150 });
  const order = await createTestOrder({
    customerId: customer.user.id,
    status: OrderStatus.DELIVERED,
    items: [{ productId: productId ?? (product as NonNullable<typeof product>).id, quantity: 1, unitPrice: 150 }],
  });
  return { customer, order, product };
};

describe('Feedback module', () => {
  // ================================================================
  // AUTHENTICATION
  // ================================================================
  describe('Authentication', () => {
    it('returns 401 for a request without a JWT', async () => {
      const response = await request(app).get('/api/feedback');
      expectApiError(response, 401);
    });

    it('returns 401 for a malformed JWT', async () => {
      const response = await request(app).get('/api/feedback').set('Authorization', 'Bearer not-a-real-token');
      expectApiError(response, 401);
    });
  });

  // ================================================================
  // POST /api/feedback (create)
  // ================================================================
  describe('POST /api/feedback', () => {
    it('lets a CUSTOMER submit feedback for their own completed order, verified in the database', async () => {
      const { customer, order } = await setupDeliveredOrder();

      const response = await request(app)
        .post('/api/feedback')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ orderId: order.id, rating: 5, comment: 'Excellent installation work.' });

      expectApiSuccess(response, 201, 'Feedback submitted successfully.');
      expect(response.body.data.feedback.rating).toBe(5);

      const dbFeedback = await prisma.feedback.findUnique({ where: { id: response.body.data.feedback.id } });
      expect(dbFeedback).not.toBeNull();
      expect(dbFeedback?.customerId).toBe(customer.user.id);
      expect(dbFeedback?.orderId).toBe(order.id);
      expect(dbFeedback?.comment).toBe('Excellent installation work.');
      expect(dbFeedback?.createdAt).toBeInstanceOf(Date);
    });

    it('rejects feedback for a non-completed order with 400, no row created', async () => {
      const customer = await createCustomer();
      const product = await createTestProduct({ price: 150 });
      const order = await createTestOrder({
        customerId: customer.user.id,
        status: OrderStatus.PROCESSING,
        items: [{ productId: product.id, quantity: 1, unitPrice: 150 }],
      });

      const response = await request(app)
        .post('/api/feedback')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ orderId: order.id, rating: 4 });

      expectApiError(response, 400);

      const count = await prisma.feedback.count({ where: { orderId: order.id } });
      expect(count).toBe(0);
    });

    it("returns 404 for another customer's order (no data leakage), no row created", async () => {
      const outsider = await createCustomer();
      const { order } = await setupDeliveredOrder();

      const response = await request(app)
        .post('/api/feedback')
        .set('Authorization', `Bearer ${outsider.token}`)
        .send({ orderId: order.id, rating: 3 });

      expectApiError(response, 404);

      const count = await prisma.feedback.count({ where: { orderId: order.id } });
      expect(count).toBe(0);
    });

    it('rejects a second feedback for the same order with 400 - duplicate prevention, only one row exists', async () => {
      const { customer, order } = await setupDeliveredOrder();

      const first = await request(app)
        .post('/api/feedback')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ orderId: order.id, rating: 5 });
      expectApiSuccess(first, 201);

      const second = await request(app)
        .post('/api/feedback')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ orderId: order.id, rating: 2 });
      expectApiError(second, 400);

      const count = await prisma.feedback.count({ where: { orderId: order.id, customerId: customer.user.id } });
      expect(count).toBe(1);
    });

    it('rejects an out-of-range rating with 400', async () => {
      const { customer, order } = await setupDeliveredOrder();

      const response = await request(app)
        .post('/api/feedback')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ orderId: order.id, rating: 6 });

      expectApiError(response, 400, 'Validation failed.');
    });

    it('rejects a comment below the minimum length with 400', async () => {
      const { customer, order } = await setupDeliveredOrder();

      const response = await request(app)
        .post('/api/feedback')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ orderId: order.id, rating: 4, comment: 'ok' });

      expectApiError(response, 400, 'Validation failed.');
    });

    it('rejects a comment over the maximum length with 400', async () => {
      const { customer, order } = await setupDeliveredOrder();

      const response = await request(app)
        .post('/api/feedback')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ orderId: order.id, rating: 4, comment: 'a'.repeat(1001) });

      expectApiError(response, 400, 'Validation failed.');
    });

    it('rejects an invalid (non-UUID) orderId with 400', async () => {
      const { customer } = await setupDeliveredOrder();

      const response = await request(app)
        .post('/api/feedback')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ orderId: 'not-a-uuid', rating: 4 });

      expectApiError(response, 400, 'Validation failed.');
    });

    it('rejects a MODERATOR submitting feedback with 403, no row created', async () => {
      const moderator = await createModerator();
      const { order } = await setupDeliveredOrder();

      const response = await request(app)
        .post('/api/feedback')
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ orderId: order.id, rating: 5 });

      expectApiError(response, 403);

      const count = await prisma.feedback.count({ where: { orderId: order.id } });
      expect(count).toBe(0);
    });
  });

  // ================================================================
  // AUTOMATIC NOTIFICATION ON FEEDBACK SUBMITTED
  // ================================================================
  describe('Automatic notifications - Feedback', () => {
    it('notifies every active MODERATOR and OWNER when feedback is submitted, but not other customers', async () => {
      const moderator = await createModerator();
      const owner = await createOwner();
      const otherCustomer = await createCustomer();
      const { customer, order } = await setupDeliveredOrder();

      const response = await request(app)
        .post('/api/feedback')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ orderId: order.id, rating: 5, comment: 'Fantastic work overall.' });

      expectApiSuccess(response, 201);
      const feedbackId = response.body.data.feedback.id as string;

      const moderatorNotification = await prisma.notification.findFirst({
        where: { userId: moderator.user.id, type: NotificationType.SYSTEM, title: 'New feedback submitted' },
      });
      expect(moderatorNotification).not.toBeNull();
      expect((moderatorNotification?.metadata as { feedbackId?: string } | null)?.feedbackId).toBe(feedbackId);

      const ownerNotification = await prisma.notification.findFirst({
        where: { userId: owner.user.id, type: NotificationType.SYSTEM, title: 'New feedback submitted' },
      });
      expect(ownerNotification).not.toBeNull();

      const otherCustomerNotification = await prisma.notification.findFirst({ where: { userId: otherCustomer.user.id } });
      expect(otherCustomerNotification).toBeNull();
    });
  });

  // ================================================================
  // GET /api/feedback (list, filter, search, pagination)
  // ================================================================
  describe('GET /api/feedback', () => {
    it("scopes a CUSTOMER to only their own feedback, confirmed against the database", async () => {
      const { customer: customerA, order: orderA } = await setupDeliveredOrder();
      const { customer: customerB, order: orderB } = await setupDeliveredOrder();
      const feedbackA = await createTestFeedback({ customerId: customerA.user.id, orderId: orderA.id });
      const feedbackB = await createTestFeedback({ customerId: customerB.user.id, orderId: orderB.id });

      const response = await request(app).get('/api/feedback').set('Authorization', `Bearer ${customerA.token}`);

      expectApiSuccess(response, 200, 'Feedback retrieved successfully.');
      const ids = (response.body.data.feedbacks as Array<{ id: string }>).map((f) => f.id);
      expect(ids).toContain(feedbackA.id);
      expect(ids).not.toContain(feedbackB.id);

      const dbFeedbackB = await prisma.feedback.findUnique({ where: { id: feedbackB.id } });
      expect(dbFeedbackB).not.toBeNull();
    });

    it('lets a MODERATOR view every feedback entry across customers', async () => {
      const moderator = await createModerator();
      const { customer: customerA, order: orderA } = await setupDeliveredOrder();
      const { customer: customerB, order: orderB } = await setupDeliveredOrder();
      await createTestFeedback({ customerId: customerA.user.id, orderId: orderA.id });
      await createTestFeedback({ customerId: customerB.user.id, orderId: orderB.id });

      const response = await request(app).get('/api/feedback').set('Authorization', `Bearer ${moderator.token}`);

      expectApiSuccess(response, 200);
      expect(response.body.data.feedbacks.length).toBeGreaterThanOrEqual(2);
    });

    it('lets an OWNER view every feedback entry (analytics access)', async () => {
      const owner = await createOwner();
      const { customer, order } = await setupDeliveredOrder();
      await createTestFeedback({ customerId: customer.user.id, orderId: order.id });

      const response = await request(app).get('/api/feedback').set('Authorization', `Bearer ${owner.token}`);

      expectApiSuccess(response, 200);
      expect(response.body.data.feedbacks.length).toBeGreaterThanOrEqual(1);
    });

    it('filters by rating', async () => {
      const moderator = await createModerator();
      const { customer: customerA, order: orderA } = await setupDeliveredOrder();
      const { customer: customerB, order: orderB } = await setupDeliveredOrder();
      const fiveStar = await createTestFeedback({ customerId: customerA.user.id, orderId: orderA.id, rating: 5 });
      await createTestFeedback({ customerId: customerB.user.id, orderId: orderB.id, rating: 2 });

      const response = await request(app).get('/api/feedback').set('Authorization', `Bearer ${moderator.token}`).query({ rating: '5' });

      expectApiSuccess(response, 200);
      const ids = (response.body.data.feedbacks as Array<{ id: string }>).map((f) => f.id);
      expect(ids).toContain(fiveStar.id);
      expect((response.body.data.feedbacks as Array<{ rating: number }>).every((f) => f.rating === 5)).toBe(true);
    });

    it('filters by customerId (MODERATOR/OWNER only)', async () => {
      const moderator = await createModerator();
      const { customer: customerA, order: orderA } = await setupDeliveredOrder();
      const { customer: customerB, order: orderB } = await setupDeliveredOrder();
      const feedbackA = await createTestFeedback({ customerId: customerA.user.id, orderId: orderA.id });
      await createTestFeedback({ customerId: customerB.user.id, orderId: orderB.id });

      const response = await request(app)
        .get('/api/feedback')
        .set('Authorization', `Bearer ${moderator.token}`)
        .query({ customerId: customerA.user.id });

      expectApiSuccess(response, 200);
      const ids = (response.body.data.feedbacks as Array<{ id: string }>).map((f) => f.id);
      expect(ids).toEqual([feedbackA.id]);
    });

    it('finds feedback by comment search', async () => {
      const moderator = await createModerator();
      const { customer, order } = await setupDeliveredOrder();
      const match = await createTestFeedback({ customerId: customer.user.id, orderId: order.id, comment: 'Leaking roof panel issue' });

      const response = await request(app).get('/api/feedback').set('Authorization', `Bearer ${moderator.token}`).query({ search: 'roof' });

      expectApiSuccess(response, 200);
      const ids = (response.body.data.feedbacks as Array<{ id: string }>).map((f) => f.id);
      expect(ids).toContain(match.id);
    });

    it('sorts newest-first by default and oldest-first with sort=asc', async () => {
      const moderator = await createModerator();
      const { customer: customerA, order: orderA } = await setupDeliveredOrder();
      const { customer: customerB, order: orderB } = await setupDeliveredOrder();
      const first = await createTestFeedback({ customerId: customerA.user.id, orderId: orderA.id });
      await new Promise((resolve) => setTimeout(resolve, 5));
      const second = await createTestFeedback({ customerId: customerB.user.id, orderId: orderB.id });

      const desc = await request(app).get('/api/feedback').set('Authorization', `Bearer ${moderator.token}`);
      expectApiSuccess(desc, 200);
      expect(desc.body.data.feedbacks[0].id).toBe(second.id);

      const asc = await request(app).get('/api/feedback').set('Authorization', `Bearer ${moderator.token}`).query({ sort: 'asc' });
      expectApiSuccess(asc, 200);
      expect(asc.body.data.feedbacks[0].id).toBe(first.id);
    });

    it('paginates feedback', async () => {
      const moderator = await createModerator();
      for (let i = 0; i < 3; i += 1) {
        const { customer, order } = await setupDeliveredOrder();
        await createTestFeedback({ customerId: customer.user.id, orderId: order.id });
      }

      const response = await request(app).get('/api/feedback').set('Authorization', `Bearer ${moderator.token}`).query({ limit: '2', page: '1' });

      expectApiSuccess(response, 200);
      expect(response.body.data.feedbacks.length).toBeLessThanOrEqual(2);
      expect(response.body.data.pagination.limit).toBe(2);
      expect(response.body.data.pagination.total).toBeGreaterThanOrEqual(3);
    });
  });

  // ================================================================
  // GET /api/feedback/:id
  // ================================================================
  describe('GET /api/feedback/:id', () => {
    it('lets a CUSTOMER view their own feedback', async () => {
      const { customer, order } = await setupDeliveredOrder();
      const feedback = await createTestFeedback({ customerId: customer.user.id, orderId: order.id });

      const response = await request(app).get(`/api/feedback/${feedback.id}`).set('Authorization', `Bearer ${customer.token}`);

      expectApiSuccess(response, 200, 'Feedback retrieved successfully.');
      expect(response.body.data.feedback.id).toBe(feedback.id);
    });

    it("returns 404 (not 403) when a CUSTOMER requests another customer's feedback - no ID enumeration", async () => {
      const outsider = await createCustomer();
      const { customer, order } = await setupDeliveredOrder();
      const feedback = await createTestFeedback({ customerId: customer.user.id, orderId: order.id });

      const response = await request(app).get(`/api/feedback/${feedback.id}`).set('Authorization', `Bearer ${outsider.token}`);

      expectApiError(response, 404);
    });

    it('lets a MODERATOR view any feedback', async () => {
      const moderator = await createModerator();
      const { customer, order } = await setupDeliveredOrder();
      const feedback = await createTestFeedback({ customerId: customer.user.id, orderId: order.id });

      const response = await request(app).get(`/api/feedback/${feedback.id}`).set('Authorization', `Bearer ${moderator.token}`);

      expectApiSuccess(response, 200);
    });

    it('returns 404 for a nonexistent feedback id', async () => {
      const { customer } = await setupDeliveredOrder();

      const response = await request(app)
        .get('/api/feedback/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${customer.token}`);

      expectApiError(response, 404);
    });

    it('rejects an invalid (non-UUID) feedback id with 400', async () => {
      const { customer } = await setupDeliveredOrder();

      const response = await request(app).get('/api/feedback/not-a-uuid').set('Authorization', `Bearer ${customer.token}`);

      expectApiError(response, 400, 'Validation failed.');
    });
  });

  // ================================================================
  // PATCH /api/feedback/:id (update own)
  // ================================================================
  describe('PATCH /api/feedback/:id', () => {
    it('lets a CUSTOMER update their own feedback, verified in the database', async () => {
      const { customer, order } = await setupDeliveredOrder();
      const feedback = await createTestFeedback({ customerId: customer.user.id, orderId: order.id, rating: 3 });

      const response = await request(app)
        .patch(`/api/feedback/${feedback.id}`)
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ rating: 5, comment: 'Updated my review after a follow-up visit.' });

      expectApiSuccess(response, 200, 'Feedback updated successfully.');
      expect(response.body.data.feedback.rating).toBe(5);

      const dbFeedback = await prisma.feedback.findUnique({ where: { id: feedback.id } });
      expect(dbFeedback?.rating).toBe(5);
      expect(dbFeedback?.comment).toBe('Updated my review after a follow-up visit.');
    });

    it("returns 404 (not 403) updating another customer's feedback - no ID enumeration, row unchanged", async () => {
      const outsider = await createCustomer();
      const { customer, order } = await setupDeliveredOrder();
      const feedback = await createTestFeedback({ customerId: customer.user.id, orderId: order.id, rating: 3 });

      const response = await request(app)
        .patch(`/api/feedback/${feedback.id}`)
        .set('Authorization', `Bearer ${outsider.token}`)
        .send({ rating: 1 });

      expectApiError(response, 404);

      const dbFeedback = await prisma.feedback.findUnique({ where: { id: feedback.id } });
      expect(dbFeedback?.rating).toBe(3);
    });

    it('rejects a MODERATOR updating feedback with 403', async () => {
      const moderator = await createModerator();
      const { customer, order } = await setupDeliveredOrder();
      const feedback = await createTestFeedback({ customerId: customer.user.id, orderId: order.id });

      const response = await request(app)
        .patch(`/api/feedback/${feedback.id}`)
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ rating: 1 });

      expectApiError(response, 403);
    });

    it('rejects an empty update body with 400', async () => {
      const { customer, order } = await setupDeliveredOrder();
      const feedback = await createTestFeedback({ customerId: customer.user.id, orderId: order.id });

      const response = await request(app).patch(`/api/feedback/${feedback.id}`).set('Authorization', `Bearer ${customer.token}`).send({});

      expectApiError(response, 400, 'Validation failed.');
    });
  });

  // ================================================================
  // DELETE /api/feedback/:id (delete own)
  // ================================================================
  describe('DELETE /api/feedback/:id', () => {
    it('lets a CUSTOMER delete their own feedback, verified in the database', async () => {
      const { customer, order } = await setupDeliveredOrder();
      const feedback = await createTestFeedback({ customerId: customer.user.id, orderId: order.id });

      const response = await request(app).delete(`/api/feedback/${feedback.id}`).set('Authorization', `Bearer ${customer.token}`);

      expectApiSuccess(response, 200, 'Feedback deleted successfully.');

      const dbFeedback = await prisma.feedback.findUnique({ where: { id: feedback.id } });
      expect(dbFeedback).toBeNull();
    });

    it("returns 404 (not 403) deleting another customer's feedback - no ID enumeration, row remains", async () => {
      const outsider = await createCustomer();
      const { customer, order } = await setupDeliveredOrder();
      const feedback = await createTestFeedback({ customerId: customer.user.id, orderId: order.id });

      const response = await request(app).delete(`/api/feedback/${feedback.id}`).set('Authorization', `Bearer ${outsider.token}`);

      expectApiError(response, 404);

      const dbFeedback = await prisma.feedback.findUnique({ where: { id: feedback.id } });
      expect(dbFeedback).not.toBeNull();
    });

    it('rejects an OWNER deleting feedback with 403', async () => {
      const owner = await createOwner();
      const { customer, order } = await setupDeliveredOrder();
      const feedback = await createTestFeedback({ customerId: customer.user.id, orderId: order.id });

      const response = await request(app).delete(`/api/feedback/${feedback.id}`).set('Authorization', `Bearer ${owner.token}`);

      expectApiError(response, 403);
    });
  });

  // ================================================================
  // GET /api/feedback/product/:productId
  // ================================================================
  describe('GET /api/feedback/product/:productId', () => {
    it('returns feedback left on orders containing that product', async () => {
      const product = await createTestProduct({ price: 300 });
      const { customer, order } = await setupDeliveredOrder(product.id);
      const feedback = await createTestFeedback({ customerId: customer.user.id, orderId: order.id });

      const response = await request(app).get(`/api/feedback/product/${product.id}`).set('Authorization', `Bearer ${customer.token}`);

      expectApiSuccess(response, 200, 'Product feedback retrieved successfully.');
      const ids = (response.body.data.feedbacks as Array<{ id: string }>).map((f) => f.id);
      expect(ids).toContain(feedback.id);
    });

    it('returns 404 for a nonexistent product', async () => {
      const { customer } = await setupDeliveredOrder();

      const response = await request(app)
        .get('/api/feedback/product/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${customer.token}`);

      expectApiError(response, 404);
    });
  });

  // ================================================================
  // GET /api/feedback/order/:orderId
  // ================================================================
  describe('GET /api/feedback/order/:orderId', () => {
    it('returns the feedback for a given order', async () => {
      const { customer, order } = await setupDeliveredOrder();
      const feedback = await createTestFeedback({ customerId: customer.user.id, orderId: order.id });

      const response = await request(app).get(`/api/feedback/order/${order.id}`).set('Authorization', `Bearer ${customer.token}`);

      expectApiSuccess(response, 200, 'Order feedback retrieved successfully.');
      const ids = (response.body.data.feedbacks as Array<{ id: string }>).map((f) => f.id);
      expect(ids).toEqual([feedback.id]);
    });

    it("returns 404 when a CUSTOMER requests another customer's order feedback", async () => {
      const outsider = await createCustomer();
      const { order } = await setupDeliveredOrder();

      const response = await request(app).get(`/api/feedback/order/${order.id}`).set('Authorization', `Bearer ${outsider.token}`);

      expectApiError(response, 404);
    });

    it('lets a MODERATOR view feedback for any order', async () => {
      const moderator = await createModerator();
      const { customer, order } = await setupDeliveredOrder();
      await createTestFeedback({ customerId: customer.user.id, orderId: order.id });

      const response = await request(app).get(`/api/feedback/order/${order.id}`).set('Authorization', `Bearer ${moderator.token}`);

      expectApiSuccess(response, 200);
      expect(response.body.data.feedbacks.length).toBe(1);
    });

    it('returns 404 for a nonexistent order', async () => {
      const { customer } = await setupDeliveredOrder();

      const response = await request(app)
        .get('/api/feedback/order/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${customer.token}`);

      expectApiError(response, 404);
    });
  });
});
