import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { OrderStatus } from '@prisma/client';

import { prisma } from '../../src/config/database';
import {
  createCustomer,
  createModerator,
  createOwner,
  createTestProduct,
  createTestOrder,
} from '../helpers/factories';
import app from '../helpers/testApp';

const expectApiSuccess = (response: request.Response, status: number, message?: string): void => {
  expect(response.status).toBe(status);
  expect(response.body.success).toBe(true);
  if (message) {
    expect(response.body.message).toBe(message);
  }
};

const expectApiError = (response: request.Response, status: number, messageMatch?: string | RegExp): void => {
  expect(response.status).toBe(status);
  expect(response.body.success).toBe(false);
  if (messageMatch) {
    expect(response.body.message).toMatch(messageMatch);
  }
};

describe('Customer Feedback End-to-End Flow & Business Rules', () => {
  it('TEST 1: rejects feedback when order is NOT Delivered (e.g. PROCESSING)', async () => {
    const customer = await createCustomer();
    const product = await createTestProduct({ price: 100 });
    const order = await createTestOrder({
      customerId: customer.user.id,
      items: [{ productId: product.id, quantity: 1 }],
      status: OrderStatus.PROCESSING,
    });

    const response = await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ orderId: order.id, rating: 5, comment: 'Premature review.' });

    expectApiError(response, 400, 'Feedback can only be submitted for completed (delivered) orders.');
  });

  it('TEST 2 & 3: allows feedback when order is DELIVERED even if payment is PENDING (Awaiting payment)', async () => {
    const customer = await createCustomer();
    const product = await createTestProduct({ price: 100 });
    const order = await createTestOrder({
      customerId: customer.user.id,
      items: [{ productId: product.id, quantity: 1 }],
      status: OrderStatus.DELIVERED,
      // No Payment row created here - feedback eligibility only checks
      // order.status (see feedback.service.ts), so an order with no
      // payment yet is exactly "payment still PENDING" for this test.
    });

    const response = await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ orderId: order.id, rating: 5, comment: 'Delivered and leaving feedback before paying.' });

    expectApiSuccess(response, 201, 'Feedback submitted successfully.');
    expect(response.body.data.feedback.rating).toBe(5);
    expect(response.body.data.feedback.orderId).toBe(order.id);
  });

  it('TEST 4 & 5: Customer submits 5 stars + comment, order query returns feedback record', async () => {
    const customer = await createCustomer();
    const product = await createTestProduct({ price: 100 });
    const order = await createTestOrder({
      customerId: customer.user.id,
      items: [{ productId: product.id, quantity: 1 }],
      status: OrderStatus.DELIVERED,
    });

    const postRes = await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        orderId: order.id,
        rating: 5,
        comment: 'The panels arrived in good condition and the service was smooth.',
      });

    expectApiSuccess(postRes, 201);

    // Refresh order details via GET /api/orders/:id
    const orderRes = await request(app)
      .get(`/api/orders/${order.id}`)
      .set('Authorization', `Bearer ${customer.token}`);

    expectApiSuccess(orderRes, 200);
    expect(orderRes.body.data.order.feedback).toBeDefined();
    expect(orderRes.body.data.order.feedback.rating).toBe(5);
    expect(orderRes.body.data.order.feedback.comment).toBe(
      'The panels arrived in good condition and the service was smooth.'
    );
  });

  it('TEST 6 & 11: Backend rejects duplicate feedback for same order, database enforces 1 record', async () => {
    const customer = await createCustomer();
    const product = await createTestProduct({ price: 100 });
    const order = await createTestOrder({
      customerId: customer.user.id,
      items: [{ productId: product.id, quantity: 1 }],
      status: OrderStatus.DELIVERED,
    });

    const first = await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ orderId: order.id, rating: 5 });

    expectApiSuccess(first, 201);

    // Second attempt
    const second = await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ orderId: order.id, rating: 4, comment: 'Duplicate attempt' });

    expectApiError(second, 400, 'You have already submitted feedback for this order.');

    // Database verification: strictly 1 row exists
    const count = await prisma.feedback.count({ where: { orderId: order.id } });
    expect(count).toBe(1);
  });

  it("TEST 7: Customer attempts to review someone else's order -> 404 rejected", async () => {
    const customerA = await createCustomer();
    const customerB = await createCustomer();
    const product = await createTestProduct({ price: 100 });
    const orderB = await createTestOrder({
      customerId: customerB.user.id,
      items: [{ productId: product.id, quantity: 1 }],
      status: OrderStatus.DELIVERED,
    });

    const res = await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${customerA.token}`)
      .send({ orderId: orderB.id, rating: 5 });

    expectApiError(res, 404, 'Order not found.');
  });

  it('TEST 8: Rejects rating 0 or 6', async () => {
    const customer = await createCustomer();
    const product = await createTestProduct({ price: 100 });
    const order = await createTestOrder({
      customerId: customer.user.id,
      items: [{ productId: product.id, quantity: 1 }],
      status: OrderStatus.DELIVERED,
    });

    const res0 = await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ orderId: order.id, rating: 0 });

    expectApiError(res0, 400, 'Validation failed.');

    const res6 = await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ orderId: order.id, rating: 6 });

    expectApiError(res6, 400, 'Validation failed.');
  });

  it('TEST 9, 10, 15: Moderator and Owner view the SAME feedback record, persists on reload', async () => {
    const customer = await createCustomer();
    const moderator = await createModerator();
    const owner = await createOwner();
    const product = await createTestProduct({ price: 100 });
    const order = await createTestOrder({
      customerId: customer.user.id,
      items: [{ productId: product.id, quantity: 1 }],
      status: OrderStatus.DELIVERED,
    });

    const postRes = await request(app)
      .post('/api/feedback')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ orderId: order.id, rating: 5, comment: 'Great service and installation.' });

    const feedbackId = postRes.body.data.feedback.id;

    // Moderator view
    const modRes = await request(app)
      .get(`/api/feedback?orderId=${order.id}`)
      .set('Authorization', `Bearer ${moderator.token}`);

    expectApiSuccess(modRes, 200);
    expect(modRes.body.data.feedbacks).toHaveLength(1);
    expect(modRes.body.data.feedbacks[0].id).toBe(feedbackId);
    expect(modRes.body.data.feedbacks[0].order.orderNumber).toBe(order.orderNumber);
    expect(modRes.body.data.feedbacks[0].customer.firstName).toBe(customer.user.firstName);

    // Owner view
    const ownerRes = await request(app)
      .get(`/api/feedback?orderId=${order.id}`)
      .set('Authorization', `Bearer ${owner.token}`);

    expectApiSuccess(ownerRes, 200);
    expect(ownerRes.body.data.feedbacks).toHaveLength(1);
    expect(ownerRes.body.data.feedbacks[0].id).toBe(feedbackId);
    expect(ownerRes.body.data.feedbacks[0].order.orderNumber).toBe(order.orderNumber);

    // Refresh simulation: second request returns identical data
    const refreshRes = await request(app)
      .get(`/api/feedback?orderId=${order.id}`)
      .set('Authorization', `Bearer ${owner.token}`);

    expect(refreshRes.body.data.feedbacks[0].id).toBe(feedbackId);
  });
});
