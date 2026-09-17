import { NotificationType, OrderStatus } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import { createCustomer, createModerator, createOwner, createTestDelivery, createTestOrder } from '../helpers/factories';
import app from '../helpers/testApp';

const VALID_ADDRESS = '123 Rizal Street, Quezon City, Metro Manila, 1100';
const FUTURE_DATE = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
const PAST_DATE = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

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

describe('Delivery module', () => {
  // ================================================================
  // AUTHENTICATION
  // ================================================================
  describe('Authentication', () => {
    it('returns 401 for a request without a JWT', async () => {
      const response = await request(app).get('/api/delivery');
      expectApiError(response, 401);
    });

    it('returns 401 for a malformed JWT', async () => {
      const response = await request(app).get('/api/delivery').set('Authorization', 'Bearer not-a-real-token');
      expectApiError(response, 401);
    });
  });

  // ================================================================
  // POST /api/delivery (create)
  // ================================================================
  describe('POST /api/delivery', () => {
    it('lets a MODERATOR create a delivery, verified in the database', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.PROCESSING });

      const response = await request(app)
        .post('/api/delivery')
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ orderId: order.id, address: VALID_ADDRESS, scheduledDate: FUTURE_DATE, courierName: 'LBC Express', trackingNumber: 'TRK-001' });

      expectApiSuccess(response, 201, 'Delivery created successfully.');
      expect(response.body.data.delivery.courierName).toBe('LBC Express');

      const dbDelivery = await prisma.delivery.findUnique({ where: { id: response.body.data.delivery.id } });
      expect(dbDelivery).not.toBeNull();
      expect(dbDelivery?.orderId).toBe(order.id);
      expect(dbDelivery?.deliveredAt).toBeNull();
      expect(dbDelivery?.trackingNumber).toBe('TRK-001');
      expect(dbDelivery?.createdAt).toBeInstanceOf(Date);
    });

    it('rejects a CUSTOMER creating a delivery with 403, no row created', async () => {
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.PROCESSING });

      const response = await request(app)
        .post('/api/delivery')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ orderId: order.id, address: VALID_ADDRESS, scheduledDate: FUTURE_DATE });

      expectApiError(response, 403);

      const count = await prisma.delivery.count({ where: { orderId: order.id } });
      expect(count).toBe(0);
    });

    it('rejects an OWNER creating a delivery with 403 - read-only', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.PROCESSING });

      const response = await request(app)
        .post('/api/delivery')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ orderId: order.id, address: VALID_ADDRESS, scheduledDate: FUTURE_DATE });

      expectApiError(response, 403);
    });

    it('returns 404 for a nonexistent order', async () => {
      const moderator = await createModerator();

      const response = await request(app)
        .post('/api/delivery')
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ orderId: '00000000-0000-0000-0000-000000000000', address: VALID_ADDRESS, scheduledDate: FUTURE_DATE });

      expectApiError(response, 404);
    });

    it('rejects a second delivery for the same order with 409, only one row exists', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.PROCESSING });
      await createTestDelivery({ orderId: order.id });

      const response = await request(app)
        .post('/api/delivery')
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ orderId: order.id, address: VALID_ADDRESS, scheduledDate: FUTURE_DATE });

      expectApiError(response, 409);

      const count = await prisma.delivery.count({ where: { orderId: order.id } });
      expect(count).toBe(1);
    });

    it('rejects creating a delivery for a CANCELLED order with 409, no row created', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.CANCELLED });

      const response = await request(app)
        .post('/api/delivery')
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ orderId: order.id, address: VALID_ADDRESS, scheduledDate: FUTURE_DATE });

      expectApiError(response, 409);

      const count = await prisma.delivery.count({ where: { orderId: order.id } });
      expect(count).toBe(0);
    });

    it('rejects a scheduledDate in the past with 400', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.PROCESSING });

      const response = await request(app)
        .post('/api/delivery')
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ orderId: order.id, address: VALID_ADDRESS, scheduledDate: PAST_DATE });

      expectApiError(response, 400, 'Validation failed.');
    });

    it('rejects an address that is too short with 400', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.PROCESSING });

      const response = await request(app)
        .post('/api/delivery')
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ orderId: order.id, address: 'short', scheduledDate: FUTURE_DATE });

      expectApiError(response, 400, 'Validation failed.');
    });

    it('rejects a missing scheduledDate with 400', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.PROCESSING });

      const response = await request(app)
        .post('/api/delivery')
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ orderId: order.id, address: VALID_ADDRESS });

      expectApiError(response, 400, 'Validation failed.');
    });
  });

  // ================================================================
  // AUTOMATIC NOTIFICATIONS
  // ================================================================
  describe('Automatic notifications - Delivery', () => {
    it('notifies the customer when a delivery is created', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.PROCESSING });

      const response = await request(app)
        .post('/api/delivery')
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ orderId: order.id, address: VALID_ADDRESS, scheduledDate: FUTURE_DATE });

      expectApiSuccess(response, 201);
      const deliveryId = response.body.data.delivery.id as string;

      const notification = await prisma.notification.findFirst({
        where: { userId: customer.user.id, type: NotificationType.SYSTEM, title: 'Delivery created' },
      });
      expect(notification).not.toBeNull();
      expect((notification?.metadata as { deliveryId?: string; event?: string } | null)?.deliveryId).toBe(deliveryId);
      expect((notification?.metadata as { event?: string } | null)?.event).toBe('DELIVERY_CREATED');
    });

    it('notifies the customer when the tracking number is updated', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.PROCESSING });
      const delivery = await createTestDelivery({ orderId: order.id });

      const response = await request(app)
        .patch(`/api/delivery/${delivery.id}`)
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ trackingNumber: 'TRK-999' });

      expectApiSuccess(response, 200);

      const notification = await prisma.notification.findFirst({
        where: { userId: customer.user.id, type: NotificationType.SYSTEM, title: 'Tracking number updated' },
      });
      expect(notification).not.toBeNull();
      expect((notification?.metadata as { event?: string } | null)?.event).toBe('TRACKING_NUMBER_UPDATED');
    });

    it('notifies the customer when the delivery is rescheduled', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.PROCESSING });
      const delivery = await createTestDelivery({ orderId: order.id });

      const response = await request(app)
        .patch(`/api/delivery/${delivery.id}`)
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ scheduledDate: FUTURE_DATE });

      expectApiSuccess(response, 200);

      const notification = await prisma.notification.findFirst({
        where: { userId: customer.user.id, type: NotificationType.SYSTEM, title: 'Delivery scheduled' },
      });
      expect(notification).not.toBeNull();
      expect((notification?.metadata as { event?: string } | null)?.event).toBe('DELIVERY_SCHEDULED');
    });

    it('fires both notifications when trackingNumber and scheduledDate are updated together', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.PROCESSING });
      const delivery = await createTestDelivery({ orderId: order.id });

      const response = await request(app)
        .patch(`/api/delivery/${delivery.id}`)
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ trackingNumber: 'TRK-777', scheduledDate: FUTURE_DATE });

      expectApiSuccess(response, 200);

      const notificationCount = await prisma.notification.count({ where: { userId: customer.user.id, type: NotificationType.SYSTEM } });
      expect(notificationCount).toBe(2);
    });

    it('notifies the customer when the delivery is marked delivered', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.PROCESSING });
      const delivery = await createTestDelivery({ orderId: order.id });

      const response = await request(app).patch(`/api/delivery/${delivery.id}/delivered`).set('Authorization', `Bearer ${moderator.token}`);

      expectApiSuccess(response, 200);

      const notification = await prisma.notification.findFirst({
        where: { userId: customer.user.id, type: NotificationType.SYSTEM, title: 'Delivery marked delivered' },
      });
      expect(notification).not.toBeNull();
      expect((notification?.metadata as { event?: string } | null)?.event).toBe('DELIVERY_MARKED_DELIVERED');
    });
  });

  // ================================================================
  // GET /api/delivery (list, filter, search, pagination, sorting)
  // ================================================================
  describe('GET /api/delivery', () => {
    it("scopes a CUSTOMER to deliveries for their own orders only, confirmed against the database", async () => {
      const customerA = await createCustomer();
      const customerB = await createCustomer();
      const orderA = await createTestOrder({ customerId: customerA.user.id });
      const orderB = await createTestOrder({ customerId: customerB.user.id });
      const deliveryA = await createTestDelivery({ orderId: orderA.id });
      const deliveryB = await createTestDelivery({ orderId: orderB.id });

      const response = await request(app).get('/api/delivery').set('Authorization', `Bearer ${customerA.token}`);

      expectApiSuccess(response, 200, 'Deliveries retrieved successfully.');
      const ids = (response.body.data.deliveries as Array<{ id: string }>).map((d) => d.id);
      expect(ids).toContain(deliveryA.id);
      expect(ids).not.toContain(deliveryB.id);

      const dbDeliveryB = await prisma.delivery.findUnique({ where: { id: deliveryB.id } });
      expect(dbDeliveryB).not.toBeNull();
    });

    it('lets a MODERATOR view every delivery across customers', async () => {
      const moderator = await createModerator();
      const customerA = await createCustomer();
      const customerB = await createCustomer();
      const orderA = await createTestOrder({ customerId: customerA.user.id });
      const orderB = await createTestOrder({ customerId: customerB.user.id });
      await createTestDelivery({ orderId: orderA.id });
      await createTestDelivery({ orderId: orderB.id });

      const response = await request(app).get('/api/delivery').set('Authorization', `Bearer ${moderator.token}`);

      expectApiSuccess(response, 200);
      expect(response.body.data.deliveries.length).toBeGreaterThanOrEqual(2);
    });

    it('lets an OWNER view every delivery (read-only)', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id });
      await createTestDelivery({ orderId: order.id });

      const response = await request(app).get('/api/delivery').set('Authorization', `Bearer ${owner.token}`);

      expectApiSuccess(response, 200);
      expect(response.body.data.deliveries.length).toBeGreaterThanOrEqual(1);
    });

    it('filters by status=delivered', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const orderA = await createTestOrder({ customerId: customer.user.id });
      const orderB = await createTestOrder({ customerId: customer.user.id });
      const delivered = await createTestDelivery({ orderId: orderA.id, deliveredAt: new Date() });
      await createTestDelivery({ orderId: orderB.id });

      const response = await request(app).get('/api/delivery').set('Authorization', `Bearer ${moderator.token}`).query({ status: 'delivered' });

      expectApiSuccess(response, 200);
      const ids = (response.body.data.deliveries as Array<{ id: string }>).map((d) => d.id);
      expect(ids).toContain(delivered.id);
      expect((response.body.data.deliveries as Array<{ deliveredAt: string | null }>).every((d) => d.deliveredAt !== null)).toBe(true);
    });

    it('filters by status=scheduled', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const orderA = await createTestOrder({ customerId: customer.user.id });
      const orderB = await createTestOrder({ customerId: customer.user.id });
      const scheduled = await createTestDelivery({ orderId: orderA.id });
      await createTestDelivery({ orderId: orderB.id, deliveredAt: new Date() });

      const response = await request(app).get('/api/delivery').set('Authorization', `Bearer ${moderator.token}`).query({ status: 'scheduled' });

      expectApiSuccess(response, 200);
      const ids = (response.body.data.deliveries as Array<{ id: string }>).map((d) => d.id);
      expect(ids).toContain(scheduled.id);
      expect((response.body.data.deliveries as Array<{ deliveredAt: string | null }>).every((d) => d.deliveredAt === null)).toBe(true);
    });

    it('finds a delivery by tracking number search', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const orderA = await createTestOrder({ customerId: customer.user.id });
      const orderB = await createTestOrder({ customerId: customer.user.id });
      const match = await createTestDelivery({ orderId: orderA.id, trackingNumber: 'UNIQUE-TRACK-123' });
      await createTestDelivery({ orderId: orderB.id, trackingNumber: 'OTHER-000' });

      const response = await request(app).get('/api/delivery').set('Authorization', `Bearer ${moderator.token}`).query({ search: 'UNIQUE-TRACK' });

      expectApiSuccess(response, 200);
      const ids = (response.body.data.deliveries as Array<{ id: string }>).map((d) => d.id);
      expect(ids).toContain(match.id);
    });

    it('finds a delivery by courier name search', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id });
      const match = await createTestDelivery({ orderId: order.id, courierName: 'J&T Express' });

      const response = await request(app).get('/api/delivery').set('Authorization', `Bearer ${moderator.token}`).query({ search: 'J&T' });

      expectApiSuccess(response, 200);
      const ids = (response.body.data.deliveries as Array<{ id: string }>).map((d) => d.id);
      expect(ids).toContain(match.id);
    });

    it('finds a delivery by address search', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id });
      const match = await createTestDelivery({ orderId: order.id, address: '456 Leaking Roof Avenue, Cebu City, Cebu, 6000' });

      const response = await request(app).get('/api/delivery').set('Authorization', `Bearer ${moderator.token}`).query({ search: 'Leaking Roof' });

      expectApiSuccess(response, 200);
      const ids = (response.body.data.deliveries as Array<{ id: string }>).map((d) => d.id);
      expect(ids).toContain(match.id);
    });

    it('sorts by scheduledDate ascending/descending', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const orderA = await createTestOrder({ customerId: customer.user.id });
      const orderB = await createTestOrder({ customerId: customer.user.id });
      const earlier = await createTestDelivery({ orderId: orderA.id, scheduledDate: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000) });
      const later = await createTestDelivery({ orderId: orderB.id, scheduledDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000) });

      const asc = await request(app)
        .get('/api/delivery')
        .set('Authorization', `Bearer ${moderator.token}`)
        .query({ sortBy: 'scheduledDate', sortOrder: 'asc' });
      expectApiSuccess(asc, 200);
      expect(asc.body.data.deliveries[0].id).toBe(earlier.id);

      const desc = await request(app)
        .get('/api/delivery')
        .set('Authorization', `Bearer ${moderator.token}`)
        .query({ sortBy: 'scheduledDate', sortOrder: 'desc' });
      expectApiSuccess(desc, 200);
      expect(desc.body.data.deliveries[0].id).toBe(later.id);
    });

    it('paginates deliveries', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      for (let i = 0; i < 3; i += 1) {
        const order = await createTestOrder({ customerId: customer.user.id });
        await createTestDelivery({ orderId: order.id });
      }

      const response = await request(app).get('/api/delivery').set('Authorization', `Bearer ${moderator.token}`).query({ limit: '2', page: '1' });

      expectApiSuccess(response, 200);
      expect(response.body.data.deliveries.length).toBeLessThanOrEqual(2);
      expect(response.body.data.pagination.limit).toBe(2);
      expect(response.body.data.pagination.total).toBeGreaterThanOrEqual(3);
    });
  });

  // ================================================================
  // GET /api/delivery/:id
  // ================================================================
  describe('GET /api/delivery/:id', () => {
    it('lets a CUSTOMER view a delivery for their own order', async () => {
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id });
      const delivery = await createTestDelivery({ orderId: order.id });

      const response = await request(app).get(`/api/delivery/${delivery.id}`).set('Authorization', `Bearer ${customer.token}`);

      expectApiSuccess(response, 200, 'Delivery retrieved successfully.');
      expect(response.body.data.delivery.id).toBe(delivery.id);
    });

    it("returns 404 (not 403) when a CUSTOMER requests another customer's delivery - no ID enumeration", async () => {
      const outsider = await createCustomer();
      const owner = await createCustomer();
      const order = await createTestOrder({ customerId: owner.user.id });
      const delivery = await createTestDelivery({ orderId: order.id });

      const response = await request(app).get(`/api/delivery/${delivery.id}`).set('Authorization', `Bearer ${outsider.token}`);

      expectApiError(response, 404);
    });

    it('lets an OWNER view any delivery', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id });
      const delivery = await createTestDelivery({ orderId: order.id });

      const response = await request(app).get(`/api/delivery/${delivery.id}`).set('Authorization', `Bearer ${owner.token}`);

      expectApiSuccess(response, 200);
    });

    it('returns 404 for a nonexistent delivery', async () => {
      const moderator = await createModerator();

      const response = await request(app)
        .get('/api/delivery/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${moderator.token}`);

      expectApiError(response, 404);
    });

    it('rejects an invalid (non-UUID) delivery id with 400', async () => {
      const moderator = await createModerator();

      const response = await request(app).get('/api/delivery/not-a-uuid').set('Authorization', `Bearer ${moderator.token}`);

      expectApiError(response, 400, 'Validation failed.');
    });
  });

  // ================================================================
  // PATCH /api/delivery/:id
  // ================================================================
  describe('PATCH /api/delivery/:id', () => {
    it('lets a MODERATOR update courier/tracking/address/scheduledDate, verified in the database', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id });
      const delivery = await createTestDelivery({ orderId: order.id });
      const newScheduledDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const response = await request(app)
        .patch(`/api/delivery/${delivery.id}`)
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ courierName: 'Grab Express', trackingNumber: 'GRB-555', address: '789 Updated Address, Davao City, Davao, 8000', scheduledDate: newScheduledDate });

      expectApiSuccess(response, 200, 'Delivery updated successfully.');

      const dbDelivery = await prisma.delivery.findUnique({ where: { id: delivery.id } });
      expect(dbDelivery?.courierName).toBe('Grab Express');
      expect(dbDelivery?.trackingNumber).toBe('GRB-555');
      expect(dbDelivery?.address).toBe('789 Updated Address, Davao City, Davao, 8000');
      expect(dbDelivery?.scheduledDate?.toISOString()).toBe(newScheduledDate);
    });

    it('ignores an orderId in the request body - orderId can never change', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id });
      const otherOrder = await createTestOrder({ customerId: customer.user.id });
      const delivery = await createTestDelivery({ orderId: order.id });

      const response = await request(app)
        .patch(`/api/delivery/${delivery.id}`)
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ orderId: otherOrder.id, courierName: 'Updated Courier' });

      expectApiSuccess(response, 200);

      const dbDelivery = await prisma.delivery.findUnique({ where: { id: delivery.id } });
      expect(dbDelivery?.orderId).toBe(order.id);
      expect(dbDelivery?.courierName).toBe('Updated Courier');
    });

    it('rejects a CUSTOMER updating a delivery with 403', async () => {
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id });
      const delivery = await createTestDelivery({ orderId: order.id });

      const response = await request(app)
        .patch(`/api/delivery/${delivery.id}`)
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ courierName: 'Should not work' });

      expectApiError(response, 403);
    });

    it('rejects an OWNER updating a delivery with 403 - read-only', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id });
      const delivery = await createTestDelivery({ orderId: order.id });

      const response = await request(app)
        .patch(`/api/delivery/${delivery.id}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ courierName: 'Should not work' });

      expectApiError(response, 403);
    });

    it('returns 404 for a nonexistent delivery', async () => {
      const moderator = await createModerator();

      const response = await request(app)
        .patch('/api/delivery/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ courierName: 'Test' });

      expectApiError(response, 404);
    });

    it('rejects an empty update body with 400', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id });
      const delivery = await createTestDelivery({ orderId: order.id });

      const response = await request(app).patch(`/api/delivery/${delivery.id}`).set('Authorization', `Bearer ${moderator.token}`).send({});

      expectApiError(response, 400, 'Validation failed.');
    });
  });

  // ================================================================
  // PATCH /api/delivery/:id/delivered
  // ================================================================
  describe('PATCH /api/delivery/:id/delivered', () => {
    it('lets a MODERATOR mark a delivery as delivered, verified in the database', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id });
      const delivery = await createTestDelivery({ orderId: order.id });

      const response = await request(app).patch(`/api/delivery/${delivery.id}/delivered`).set('Authorization', `Bearer ${moderator.token}`);

      expectApiSuccess(response, 200, 'Delivery marked as delivered.');

      const dbDelivery = await prisma.delivery.findUnique({ where: { id: delivery.id } });
      expect(dbDelivery?.deliveredAt).toBeInstanceOf(Date);
    });

    it('rejects marking an already-delivered delivery with 409, database unchanged', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id });
      const deliveredAt = new Date();
      const delivery = await createTestDelivery({ orderId: order.id, deliveredAt });

      const response = await request(app).patch(`/api/delivery/${delivery.id}/delivered`).set('Authorization', `Bearer ${moderator.token}`);

      expectApiError(response, 409);

      const dbDelivery = await prisma.delivery.findUnique({ where: { id: delivery.id } });
      expect(dbDelivery?.deliveredAt?.getTime()).toBe(deliveredAt.getTime());
    });

    it('rejects a CUSTOMER marking a delivery as delivered with 403', async () => {
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id });
      const delivery = await createTestDelivery({ orderId: order.id });

      const response = await request(app).patch(`/api/delivery/${delivery.id}/delivered`).set('Authorization', `Bearer ${customer.token}`);

      expectApiError(response, 403);
    });

    it('rejects an OWNER marking a delivery as delivered with 403 - read-only', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id });
      const delivery = await createTestDelivery({ orderId: order.id });

      const response = await request(app).patch(`/api/delivery/${delivery.id}/delivered`).set('Authorization', `Bearer ${owner.token}`);

      expectApiError(response, 403);
    });

    it('returns 404 for a nonexistent delivery', async () => {
      const moderator = await createModerator();

      const response = await request(app)
        .patch('/api/delivery/00000000-0000-0000-0000-000000000000/delivered')
        .set('Authorization', `Bearer ${moderator.token}`);

      expectApiError(response, 404);
    });
  });

  // ================================================================
  // DELETE /api/delivery/:id
  // ================================================================
  describe('DELETE /api/delivery/:id', () => {
    it('lets a MODERATOR delete a non-delivered delivery, verified in the database', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id });
      const delivery = await createTestDelivery({ orderId: order.id });

      const response = await request(app).delete(`/api/delivery/${delivery.id}`).set('Authorization', `Bearer ${moderator.token}`);

      expectApiSuccess(response, 200, 'Delivery deleted successfully.');

      const dbDelivery = await prisma.delivery.findUnique({ where: { id: delivery.id } });
      expect(dbDelivery).toBeNull();
    });

    it('rejects deleting an already-delivered delivery with 409, row remains', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id });
      const delivery = await createTestDelivery({ orderId: order.id, deliveredAt: new Date() });

      const response = await request(app).delete(`/api/delivery/${delivery.id}`).set('Authorization', `Bearer ${moderator.token}`);

      expectApiError(response, 409);

      const dbDelivery = await prisma.delivery.findUnique({ where: { id: delivery.id } });
      expect(dbDelivery).not.toBeNull();
    });

    it('rejects a CUSTOMER deleting a delivery with 403, row remains', async () => {
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id });
      const delivery = await createTestDelivery({ orderId: order.id });

      const response = await request(app).delete(`/api/delivery/${delivery.id}`).set('Authorization', `Bearer ${customer.token}`);

      expectApiError(response, 403);

      const dbDelivery = await prisma.delivery.findUnique({ where: { id: delivery.id } });
      expect(dbDelivery).not.toBeNull();
    });

    it('rejects an OWNER deleting a delivery with 403 - read-only, row remains', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id });
      const delivery = await createTestDelivery({ orderId: order.id });

      const response = await request(app).delete(`/api/delivery/${delivery.id}`).set('Authorization', `Bearer ${owner.token}`);

      expectApiError(response, 403);

      const dbDelivery = await prisma.delivery.findUnique({ where: { id: delivery.id } });
      expect(dbDelivery).not.toBeNull();
    });

    it('returns 404 for a nonexistent delivery', async () => {
      const moderator = await createModerator();

      const response = await request(app)
        .delete('/api/delivery/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${moderator.token}`);

      expectApiError(response, 404);
    });
  });
});
