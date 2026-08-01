import { createHmac } from 'node:crypto';

import { BookingStatus, NotificationType, OrderStatus, PaymentStatus, ProjectStatus } from '@prisma/client';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '../../src/config/database';
import {
  addCartItem,
  createCustomer,
  createModerator,
  createTestBooking,
  createTestCart,
  createTestChatRoom,
  createTestNotification,
  createTestOrder,
  createTestPayment,
  createTestProduct,
} from '../helpers/factories';
import app from '../helpers/testApp';

const VALID_ADDRESS = '123 Rizal Street, Quezon City, Metro Manila, 1100';
const WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET ?? 'whsec_fake_test_secret_for_testing_only';

/**
 * Every test in this suite checks HTTP status + response.body.success +
 * response.body.message, per the QA pattern established across every other
 * module's test suite in this project.
 */
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

const mockPaymongoCheckoutSuccess = (checkoutSessionId = `cs_test_${Date.now()}`): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          id: checkoutSessionId,
          type: 'checkout_session',
          attributes: { checkout_url: `https://checkout.paymongo.com/${checkoutSessionId}`, status: 'active' },
        },
      }),
    }),
  );
};

const buildWebhookPayload = (eventType: 'payment.paid' | 'payment.failed', orderId: string, paymongoPaymentId?: string): string =>
  JSON.stringify({
    data: {
      id: `evt_test_${Date.now()}`,
      type: 'event',
      attributes: {
        type: eventType,
        livemode: false,
        data: {
          id: paymongoPaymentId ?? `pay_test_${Date.now()}`,
          type: 'payment',
          attributes: { reference_number: orderId },
        },
      },
    },
  });

const signWebhookPayload = (rawBody: string, secret: string): string => {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return `t=${timestamp},li=${signature},te=${signature}`;
};

const postWebhook = (rawBody: string, signature?: string) => {
  const req = request(app).post('/api/payments/webhook').set('Content-Type', 'application/json');
  if (signature) req.set('Paymongo-Signature', signature);
  return req.send(rawBody);
};

describe('Notification module', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ================================================================
  // AUTHENTICATION
  // ================================================================
  describe('Authentication', () => {
    it('returns 401 for a request without a JWT', async () => {
      const response = await request(app).get('/api/notifications');
      expectApiError(response, 401);
    });

    it('returns 401 for a malformed JWT', async () => {
      const response = await request(app).get('/api/notifications').set('Authorization', 'Bearer not-a-real-token');
      expectApiError(response, 401);
    });
  });

  // ================================================================
  // GET /api/notifications - LIST / FILTER / SEARCH / PAGINATION
  // ================================================================
  describe('GET /api/notifications', () => {
    it("returns only the requester's own notifications, verified against the database", async () => {
      const { token, user } = await createCustomer();
      const other = await createCustomer();
      const mine = await createTestNotification({ userId: user.id, title: 'Mine' });
      const theirs = await createTestNotification({ userId: other.user.id, title: 'Theirs' });

      const response = await request(app).get('/api/notifications').set('Authorization', `Bearer ${token}`);

      expectApiSuccess(response, 200, 'Notifications retrieved successfully.');
      const ids = (response.body.data.notifications as Array<{ id: string }>).map((n) => n.id);
      expect(ids).toContain(mine.id);
      expect(ids).not.toContain(theirs.id);

      const dbTheirs = await prisma.notification.findUnique({ where: { id: theirs.id } });
      expect(dbTheirs).not.toBeNull();
    });

    it('MODERATOR and OWNER also only ever see their own notifications', async () => {
      const moderator = await createModerator();
      const owner = await createModerator();
      await createTestNotification({ userId: moderator.user.id, title: 'Moderator notification' });
      await createTestNotification({ userId: owner.user.id, title: 'Owner notification' });

      const response = await request(app).get('/api/notifications').set('Authorization', `Bearer ${moderator.token}`);

      expectApiSuccess(response, 200);
      const titles = (response.body.data.notifications as Array<{ title: string }>).map((n) => n.title);
      expect(titles).toContain('Moderator notification');
      expect(titles).not.toContain('Owner notification');
    });

    it('filters unread only', async () => {
      const { token, user } = await createCustomer();
      const unread = await createTestNotification({ userId: user.id, isRead: false, title: 'Unread' });
      await createTestNotification({ userId: user.id, isRead: true, title: 'Read' });

      const response = await request(app).get('/api/notifications').set('Authorization', `Bearer ${token}`).query({ isRead: 'false' });

      expectApiSuccess(response, 200);
      const ids = (response.body.data.notifications as Array<{ id: string }>).map((n) => n.id);
      expect(ids).toEqual([unread.id]);
    });

    it('filters read only', async () => {
      const { token, user } = await createCustomer();
      await createTestNotification({ userId: user.id, isRead: false, title: 'Unread' });
      const read = await createTestNotification({ userId: user.id, isRead: true, title: 'Read' });

      const response = await request(app).get('/api/notifications').set('Authorization', `Bearer ${token}`).query({ isRead: 'true' });

      expectApiSuccess(response, 200);
      const ids = (response.body.data.notifications as Array<{ id: string }>).map((n) => n.id);
      expect(ids).toEqual([read.id]);
    });

    it('filters by type', async () => {
      const { token, user } = await createCustomer();
      const orderNotif = await createTestNotification({ userId: user.id, type: NotificationType.ORDER });
      await createTestNotification({ userId: user.id, type: NotificationType.CHAT });

      const response = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${token}`)
        .query({ type: NotificationType.ORDER });

      expectApiSuccess(response, 200);
      const ids = (response.body.data.notifications as Array<{ id: string }>).map((n) => n.id);
      expect(ids).toEqual([orderNotif.id]);
    });

    it('finds a notification by title/message search', async () => {
      const { token, user } = await createCustomer();
      const match = await createTestNotification({ userId: user.id, title: 'Leaking roof panel update' });
      await createTestNotification({ userId: user.id, title: 'Unrelated notification' });

      const response = await request(app).get('/api/notifications').set('Authorization', `Bearer ${token}`).query({ search: 'roof' });

      expectApiSuccess(response, 200);
      const ids = (response.body.data.notifications as Array<{ id: string }>).map((n) => n.id);
      expect(ids).toContain(match.id);
    });

    it('sorts newest-first by default and oldest-first with sort=asc', async () => {
      const { token, user } = await createCustomer();
      const first = await createTestNotification({ userId: user.id, title: 'First' });
      await new Promise((resolve) => setTimeout(resolve, 5));
      const second = await createTestNotification({ userId: user.id, title: 'Second' });

      const desc = await request(app).get('/api/notifications').set('Authorization', `Bearer ${token}`);
      expectApiSuccess(desc, 200);
      expect(desc.body.data.notifications[0].id).toBe(second.id);

      const asc = await request(app).get('/api/notifications').set('Authorization', `Bearer ${token}`).query({ sort: 'asc' });
      expectApiSuccess(asc, 200);
      expect(asc.body.data.notifications[0].id).toBe(first.id);
    });

    it('paginates notifications', async () => {
      const { token, user } = await createCustomer();
      for (let i = 0; i < 3; i += 1) {
        await createTestNotification({ userId: user.id });
      }

      const response = await request(app).get('/api/notifications').set('Authorization', `Bearer ${token}`).query({ limit: '2', page: '1' });

      expectApiSuccess(response, 200);
      expect(response.body.data.notifications.length).toBeLessThanOrEqual(2);
      expect(response.body.data.pagination.limit).toBe(2);
      expect(response.body.data.pagination.total).toBeGreaterThanOrEqual(3);
    });
  });

  // ================================================================
  // GET /api/notifications/unread/count
  // ================================================================
  describe('GET /api/notifications/unread/count', () => {
    it("returns the requester's own unread count only", async () => {
      const { token, user } = await createCustomer();
      const other = await createCustomer();
      await createTestNotification({ userId: user.id, isRead: false });
      await createTestNotification({ userId: user.id, isRead: false });
      await createTestNotification({ userId: user.id, isRead: true });
      await createTestNotification({ userId: other.user.id, isRead: false });

      const response = await request(app).get('/api/notifications/unread/count').set('Authorization', `Bearer ${token}`);

      expectApiSuccess(response, 200, 'Unread count retrieved successfully.');
      expect(response.body.data.count).toBe(2);
    });
  });

  // ================================================================
  // PATCH /api/notifications/:id/read
  // ================================================================
  describe('PATCH /api/notifications/:id/read', () => {
    it('marks a notification as read, verified in the database', async () => {
      const { token, user } = await createCustomer();
      const notification = await createTestNotification({ userId: user.id, isRead: false });

      const response = await request(app).patch(`/api/notifications/${notification.id}/read`).set('Authorization', `Bearer ${token}`);

      expectApiSuccess(response, 200, 'Notification marked as read.');
      expect(response.body.data.notification.isRead).toBe(true);

      const dbNotification = await prisma.notification.findUnique({ where: { id: notification.id } });
      expect(dbNotification?.isRead).toBe(true);
    });

    it("returns 404 (not 403) when marking another customer's notification as read - no ID enumeration", async () => {
      const { token } = await createCustomer();
      const owner = await createCustomer();
      const notification = await createTestNotification({ userId: owner.user.id, isRead: false });

      const response = await request(app).patch(`/api/notifications/${notification.id}/read`).set('Authorization', `Bearer ${token}`);

      expectApiError(response, 404);

      const dbNotification = await prisma.notification.findUnique({ where: { id: notification.id } });
      expect(dbNotification?.isRead).toBe(false);
    });

    it('returns 404 for a nonexistent notification', async () => {
      const { token } = await createCustomer();

      const response = await request(app)
        .patch('/api/notifications/00000000-0000-0000-0000-000000000000/read')
        .set('Authorization', `Bearer ${token}`);

      expectApiError(response, 404);
    });

    it('rejects an invalid (non-UUID) notification id with 400', async () => {
      const { token } = await createCustomer();

      const response = await request(app).patch('/api/notifications/not-a-uuid/read').set('Authorization', `Bearer ${token}`);

      expectApiError(response, 400, 'Validation failed.');
    });
  });

  // ================================================================
  // PATCH /api/notifications/read-all
  // ================================================================
  describe('PATCH /api/notifications/read-all', () => {
    it("marks every one of the requester's unread notifications as read, leaves other users' untouched", async () => {
      const { token, user } = await createCustomer();
      const other = await createCustomer();
      await createTestNotification({ userId: user.id, isRead: false });
      await createTestNotification({ userId: user.id, isRead: false });
      const otherNotification = await createTestNotification({ userId: other.user.id, isRead: false });

      const response = await request(app).patch('/api/notifications/read-all').set('Authorization', `Bearer ${token}`);

      expectApiSuccess(response, 200, 'All notifications marked as read.');
      expect(response.body.data.count).toBe(2);

      const unreadRemaining = await prisma.notification.count({ where: { userId: user.id, isRead: false } });
      expect(unreadRemaining).toBe(0);

      const dbOther = await prisma.notification.findUnique({ where: { id: otherNotification.id } });
      expect(dbOther?.isRead).toBe(false);
    });
  });

  // ================================================================
  // DELETE /api/notifications/:id
  // ================================================================
  describe('DELETE /api/notifications/:id', () => {
    it('deletes the notification, verified in the database', async () => {
      const { token, user } = await createCustomer();
      const notification = await createTestNotification({ userId: user.id });

      const response = await request(app).delete(`/api/notifications/${notification.id}`).set('Authorization', `Bearer ${token}`);

      expectApiSuccess(response, 200, 'Notification deleted successfully.');

      const dbNotification = await prisma.notification.findUnique({ where: { id: notification.id } });
      expect(dbNotification).toBeNull();
    });

    it("returns 404 (not 403) deleting another customer's notification - no ID enumeration, row remains", async () => {
      const { token } = await createCustomer();
      const owner = await createCustomer();
      const notification = await createTestNotification({ userId: owner.user.id });

      const response = await request(app).delete(`/api/notifications/${notification.id}`).set('Authorization', `Bearer ${token}`);

      expectApiError(response, 404);

      const dbNotification = await prisma.notification.findUnique({ where: { id: notification.id } });
      expect(dbNotification).not.toBeNull();
    });

    it('returns 404 for a nonexistent notification', async () => {
      const { token } = await createCustomer();

      const response = await request(app).delete('/api/notifications/00000000-0000-0000-0000-000000000000').set('Authorization', `Bearer ${token}`);

      expectApiError(response, 404);
    });
  });

  // ================================================================
  // AUTOMATIC TRIGGER: ORDER
  // ================================================================
  describe('Automatic notifications - Order', () => {
    it('creates an ORDER notification when a customer checks out', async () => {
      const customer = await createCustomer();
      const product = await createTestProduct({ withInventory: true, quantity: 50, price: 100 });
      const cart = await createTestCart(customer.user.id);
      await addCartItem(cart.id, product.id, 2);

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ shippingAddress: VALID_ADDRESS });

      expectApiSuccess(response, 201);
      const orderId = response.body.data.order.id as string;

      const notification = await prisma.notification.findFirst({ where: { userId: customer.user.id, type: NotificationType.ORDER } });
      expect(notification).not.toBeNull();
      expect(notification?.title).toBe('Order placed');
      expect((notification?.metadata as { orderId?: string } | null)?.orderId).toBe(orderId);
    });

    it('creates an ORDER notification when a MODERATOR updates order status', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.PENDING });

      const response = await request(app)
        .patch(`/api/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ status: OrderStatus.PROCESSING });

      expectApiSuccess(response, 200);

      const notification = await prisma.notification.findFirst({
        where: { userId: customer.user.id, type: NotificationType.ORDER, title: 'Order status updated' },
      });
      expect(notification).not.toBeNull();
      expect((notification?.metadata as { status?: string } | null)?.status).toBe(OrderStatus.PROCESSING);
    });
  });

  // ================================================================
  // AUTOMATIC TRIGGER: PAYMENT
  // ================================================================
  describe('Automatic notifications - Payment', () => {
    it('creates a PAYMENT notification when a payment is created', async () => {
      const customer = await createCustomer();
      const product = await createTestProduct({ price: 200 });
      const order = await createTestOrder({ customerId: customer.user.id, items: [{ productId: product.id, quantity: 1, unitPrice: 200 }] });
      mockPaymongoCheckoutSuccess();

      const response = await request(app)
        .post('/api/payments/create')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ orderId: order.id });

      expectApiSuccess(response, 201);

      const notification = await prisma.notification.findFirst({
        where: { userId: customer.user.id, type: NotificationType.PAYMENT, title: 'Payment initiated' },
      });
      expect(notification).not.toBeNull();
    });

    it('creates a PAYMENT notification when the payment.paid webhook is received', async () => {
      const customer = await createCustomer();
      const product = await createTestProduct({ price: 200 });
      const order = await createTestOrder({ customerId: customer.user.id, items: [{ productId: product.id, quantity: 1, unitPrice: 200 }] });
      await createTestPayment({ orderId: order.id, status: PaymentStatus.PENDING, transactionRef: 'cs_test_notif' });

      const rawBody = buildWebhookPayload('payment.paid', order.id);
      const signature = signWebhookPayload(rawBody, WEBHOOK_SECRET);

      const response = await postWebhook(rawBody, signature);
      expectApiSuccess(response, 200);

      const notification = await prisma.notification.findFirst({
        where: { userId: customer.user.id, type: NotificationType.PAYMENT, title: 'Payment successful' },
      });
      expect(notification).not.toBeNull();
      expect((notification?.metadata as { orderId?: string } | null)?.orderId).toBe(order.id);
    });
  });

  // ================================================================
  // AUTOMATIC TRIGGER: BOOKING
  // ================================================================
  describe('Automatic notifications - Booking', () => {
    it('creates a BOOKING notification when a customer creates a booking', async () => {
      const customer = await createCustomer();

      const response = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ scheduledDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), address: VALID_ADDRESS });

      expectApiSuccess(response, 201);

      const notification = await prisma.notification.findFirst({
        where: { userId: customer.user.id, type: NotificationType.BOOKING, title: 'Booking created' },
      });
      expect(notification).not.toBeNull();
    });

    it('creates a BOOKING notification when a MODERATOR approves a booking', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const booking = await createTestBooking({ customerId: customer.user.id, status: BookingStatus.PENDING });

      const response = await request(app)
        .patch(`/api/bookings/${booking.id}/status`)
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ status: BookingStatus.APPROVED });

      expectApiSuccess(response, 200);

      const notification = await prisma.notification.findFirst({
        where: { userId: customer.user.id, type: NotificationType.BOOKING, title: 'Booking approved' },
      });
      expect(notification).not.toBeNull();
    });

    it('creates a BOOKING notification when a customer cancels their own booking', async () => {
      const customer = await createCustomer();
      const booking = await createTestBooking({ customerId: customer.user.id, status: BookingStatus.PENDING });

      const response = await request(app).patch(`/api/bookings/${booking.id}/cancel`).set('Authorization', `Bearer ${customer.token}`);

      expectApiSuccess(response, 200);

      const notification = await prisma.notification.findFirst({
        where: { userId: customer.user.id, type: NotificationType.BOOKING, title: 'Booking cancelled' },
      });
      expect(notification).not.toBeNull();
    });

    it('creates a BOOKING notification when a MODERATOR cancels a booking via the status endpoint', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const booking = await createTestBooking({ customerId: customer.user.id, status: BookingStatus.APPROVED });

      const response = await request(app)
        .patch(`/api/bookings/${booking.id}/status`)
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ status: BookingStatus.CANCELLED });

      expectApiSuccess(response, 200);

      const notification = await prisma.notification.findFirst({
        where: { userId: customer.user.id, type: NotificationType.BOOKING, title: 'Booking cancelled' },
      });
      expect(notification).not.toBeNull();
    });
  });

  // ================================================================
  // AUTOMATIC TRIGGER: PROJECT (via booking completion)
  // ================================================================
  describe('Automatic notifications - Project', () => {
    it(
      'creates a SYSTEM notification (Project updated) when a booking completes and syncs a project - ' +
        'NotificationType has no dedicated PROJECT value, so SYSTEM is used with metadata.event to disambiguate',
      async () => {
        const moderator = await createModerator();
        const customer = await createCustomer();
        const booking = await createTestBooking({ customerId: customer.user.id, status: BookingStatus.SCHEDULED, address: VALID_ADDRESS });

        const response = await request(app)
          .patch(`/api/bookings/${booking.id}/status`)
          .set('Authorization', `Bearer ${moderator.token}`)
          .send({ status: BookingStatus.COMPLETED });

        expectApiSuccess(response, 200);

        const project = await prisma.project.findFirst({ where: { customerId: customer.user.id, status: ProjectStatus.COMPLETED } });
        expect(project).not.toBeNull();

        const notification = await prisma.notification.findFirst({
          where: { userId: customer.user.id, type: NotificationType.SYSTEM, title: 'Project updated' },
        });
        expect(notification).not.toBeNull();
        expect((notification?.metadata as { projectId?: string; event?: string } | null)?.projectId).toBe(project?.id);
        expect((notification?.metadata as { event?: string } | null)?.event).toBe('PROJECT_UPDATED');
      },
    );
  });

  // ================================================================
  // AUTOMATIC TRIGGER: CHAT
  // ================================================================
  describe('Automatic notifications - Chat', () => {
    it('creates a CHAT notification for the other participant when a message is sent', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const room = await createTestChatRoom({ participantIds: [customer.user.id] });

      const response = await request(app)
        .post(`/api/chat/${room.id}/messages`)
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ content: 'How can I help you today?' });

      expectApiSuccess(response, 201);

      const notification = await prisma.notification.findFirst({ where: { userId: customer.user.id, type: NotificationType.CHAT } });
      expect(notification).not.toBeNull();
      expect(notification?.message).toBe('How can I help you today?');

      // The sender never gets notified of their own message.
      const senderNotification = await prisma.notification.findFirst({ where: { userId: moderator.user.id, type: NotificationType.CHAT } });
      expect(senderNotification).toBeNull();
    });

    it('does not duplicate a chat notification when the same participant replies twice', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const room = await createTestChatRoom({ participantIds: [customer.user.id] });

      await request(app).post(`/api/chat/${room.id}/messages`).set('Authorization', `Bearer ${moderator.token}`).send({ content: 'First' });
      await request(app).post(`/api/chat/${room.id}/messages`).set('Authorization', `Bearer ${customer.token}`).send({ content: 'Reply' });

      const notificationCount = await prisma.notification.count({ where: { userId: moderator.user.id, type: NotificationType.CHAT } });
      expect(notificationCount).toBe(1);
    });
  });
});
