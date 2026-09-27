import { NotificationType } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import {
  addCartItem,
  createCustomer,
  createModerator,
  createOwner,
  createTestCart,
  createTestChatRoom,
  createTestNotification,
  createTestOrder,
  createTestProduct,
} from '../helpers/factories';
import app from '../helpers/testApp';

const VALID_ADDRESS = '123 Rizal Street, Quezon City, Metro Manila, 1100';

const titlesFor = async (userId: string): Promise<string[]> =>
  (await prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })).map((n) => n.title);

const unreadCount = async (token: string): Promise<number> => {
  const response = await request(app).get('/api/notifications/unread/count').set('Authorization', `Bearer ${token}`);
  expect(response.status).toBe(200);
  return response.body.data.count as number;
};

/**
 * Role-targeted notification triggers - each `it` corresponds to one of the
 * notification system's acceptance tests.
 */
describe('Notification triggers', () => {
  describe('orders', () => {
    it('notifies the customer, every moderator, and the owner when an order is placed (acceptance test 1)', async () => {
      const customer = await createCustomer();
      const otherCustomer = await createCustomer();
      const moderator = await createModerator();
      const owner = await createOwner();
      const product = await createTestProduct({ withInventory: true, quantity: 50 });
      const cart = await createTestCart(customer.user.id);
      await addCartItem(cart.id, product.id, 2);

      const response = await request(app).post('/api/orders').set('Authorization', `Bearer ${customer.token}`).send({ shippingAddress: VALID_ADDRESS });
      expect(response.status).toBe(201);
      const orderId = response.body.data.order.id as string;

      expect(await titlesFor(customer.user.id)).toContain('Order placed');

      const moderatorNotification = await prisma.notification.findFirst({ where: { userId: moderator.user.id, type: NotificationType.ORDER } });
      expect(moderatorNotification?.title).toBe('New order received');
      expect(moderatorNotification?.message).toMatch(/awaiting your approval/);
      expect((moderatorNotification?.metadata as { orderId?: string } | null)?.orderId).toBe(orderId);

      const ownerNotification = await prisma.notification.findFirst({ where: { userId: owner.user.id, type: NotificationType.ORDER } });
      expect(ownerNotification?.title).toBe('New order placed');

      expect(await titlesFor(otherCustomer.user.id)).toEqual([]);
    });

    it('notifies the customer when a moderator approves their order (acceptance test 2)', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const order = await createTestOrder({ customerId: customer.user.id, moderatorApproved: false });

      const response = await request(app).patch(`/api/orders/${order.id}/approve`).set('Authorization', `Bearer ${moderator.token}`);
      expect(response.status).toBe(200);

      const notification = await prisma.notification.findFirst({ where: { userId: customer.user.id, title: 'Order approved' } });
      expect(notification?.message).toMatch(/has been approved/);
    });

    it('tells the customer their order was declined when staff cancel it before approving', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const order = await createTestOrder({ customerId: customer.user.id, moderatorApproved: false });

      const response = await request(app).patch(`/api/orders/${order.id}/status`).set('Authorization', `Bearer ${moderator.token}`).send({ status: 'CANCELLED' });
      expect(response.status).toBe(200);

      expect(await titlesFor(customer.user.id)).toContain('Order declined');
    });
  });

  describe('installation requests', () => {
    it('notifies moderators and the owner of a new installation request, not other customers (acceptance test 3)', async () => {
      const customer = await createCustomer();
      const otherCustomer = await createCustomer();
      const moderator = await createModerator();
      const owner = await createOwner();
      await createTestOrder({ customerId: customer.user.id });

      const response = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ scheduledDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), address: VALID_ADDRESS });
      expect(response.status).toBe(201);

      for (const staff of [moderator, owner]) {
        const notification = await prisma.notification.findFirst({ where: { userId: staff.user.id, title: 'New installation request' } });
        expect(notification?.type).toBe(NotificationType.BOOKING);
      }
      expect(await titlesFor(otherCustomer.user.id)).toEqual([]);
    });
  });

  describe('inventory', () => {
    it('alerts moderators and the owner once when stock crosses the reorder level (acceptance test 4)', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const owner = await createOwner();
      const product = await createTestProduct({ withInventory: true, quantity: 12, reorderLevel: 10 });
      const cart = await createTestCart(customer.user.id);

      await addCartItem(cart.id, product.id, 3); // 12 -> 9: crosses the reorder level
      expect((await request(app).post('/api/orders').set('Authorization', `Bearer ${customer.token}`).send({ shippingAddress: VALID_ADDRESS })).status).toBe(201);

      await addCartItem(cart.id, product.id, 1); // 9 -> 8: already low, must not re-alert
      expect((await request(app).post('/api/orders').set('Authorization', `Bearer ${customer.token}`).send({ shippingAddress: VALID_ADDRESS })).status).toBe(201);

      for (const staff of [moderator, owner]) {
        const alerts = await prisma.notification.findMany({ where: { userId: staff.user.id, title: 'Low stock alert' } });
        expect(alerts).toHaveLength(1);
        expect(alerts[0]?.message).toContain(product.name);
      }
      expect(await titlesFor(customer.user.id)).not.toContain('Low stock alert');
    });

    it('alerts staff when an owner-approved change empties a product, and tells carted customers when it is back', async () => {
      const shopper = await createCustomer();
      const moderator = await createModerator();
      const owner = await createOwner();
      const product = await createTestProduct({ withInventory: true, quantity: 4, reorderLevel: 2 });
      const cart = await createTestCart(shopper.user.id);
      await addCartItem(cart.id, product.id, 1);

      // Moderator stock changes are change requests; the stock only moves once the owner approves.
      const applyViaApprovedRequest = async (action: 'reduce' | 'add', quantity: number): Promise<void> => {
        const submitted = await request(app).patch(`/api/inventory/${product.id}/${action}`).set('Authorization', `Bearer ${moderator.token}`).send({ quantity });
        expect(submitted.status).toBe(200);
        const approved = await request(app).patch(`/api/requests/${submitted.body.data.request.id}/approve`).set('Authorization', `Bearer ${owner.token}`).send({});
        expect(approved.status).toBe(200);
      };

      await applyViaApprovedRequest('reduce', 4);
      expect(await titlesFor(moderator.user.id)).toContain('Out of stock');
      expect(await titlesFor(owner.user.id)).toContain('Out of stock');

      await applyViaApprovedRequest('add', 10);
      expect(await titlesFor(shopper.user.id)).toContain('Back in stock');
    });
  });

  describe('support chat', () => {
    it("alerts moderators to a customer's first message in a conversation no staff member has joined", async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const owner = await createOwner();
      const room = await createTestChatRoom({ participantIds: [customer.user.id] });

      await request(app).post(`/api/chat/${room.id}/messages`).set('Authorization', `Bearer ${customer.token}`).send({ content: 'Do you install on weekends?' });
      await request(app).post(`/api/chat/${room.id}/messages`).set('Authorization', `Bearer ${customer.token}`).send({ content: 'Hello?' });

      const alerts = await prisma.notification.findMany({ where: { userId: moderator.user.id, title: 'New customer message' } });
      expect(alerts).toHaveLength(1);
      expect(alerts[0]?.message).toContain('Do you install on weekends?');
      expect(await titlesFor(owner.user.id)).not.toContain('New customer message');
    });
  });

  describe('account', () => {
    it('notifies the owner (only) about a new customer registration', async () => {
      const moderator = await createModerator();
      const owner = await createOwner();

      const response = await request(app).post('/api/auth/register').send({
        firstName: 'Ana',
        lastName: 'Reyes',
        email: `ana.${Date.now()}@example.com`,
        password: 'P@nelScan2026',
        acceptedTerms: true,
      });
      expect([200, 201]).toContain(response.status);

      expect(await titlesFor(owner.user.id)).toContain('New customer');
      expect(await titlesFor(moderator.user.id)).not.toContain('New customer');
    });

    it('notifies a customer when their profile is updated', async () => {
      const customer = await createCustomer();
      const response = await request(app).patch('/api/auth/me').set('Authorization', `Bearer ${customer.token}`).send({ firstName: 'Updated' });
      expect(response.status).toBe(200);
      expect(await titlesFor(customer.user.id)).toContain('Profile updated');
    });
  });

  describe('read state', () => {
    it('drops the unread badge to zero after mark-all-as-read, and the state persists (acceptance tests 5-7)', async () => {
      const customer = await createCustomer();
      await createTestNotification({ userId: customer.user.id, title: 'One' });
      await createTestNotification({ userId: customer.user.id, title: 'Two' });
      const third = await createTestNotification({ userId: customer.user.id, title: 'Three' });

      expect(await unreadCount(customer.token)).toBe(3);

      await request(app).patch(`/api/notifications/${third.id}/read`).set('Authorization', `Bearer ${customer.token}`);
      expect(await unreadCount(customer.token)).toBe(2);

      await request(app).patch('/api/notifications/read-all').set('Authorization', `Bearer ${customer.token}`);
      expect(await unreadCount(customer.token)).toBe(0);

      // A fresh read (as after a page refresh) still sees every notification, all read.
      const list = await request(app).get('/api/notifications').set('Authorization', `Bearer ${customer.token}`);
      expect(list.body.data.notifications).toHaveLength(3);
      expect((list.body.data.notifications as Array<{ isRead: boolean }>).every((n) => n.isRead)).toBe(true);
    });
  });
});
