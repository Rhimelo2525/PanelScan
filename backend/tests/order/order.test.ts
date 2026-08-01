import { OrderStatus } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import {
  addCartItem,
  createCustomer,
  createModerator,
  createTestCart,
  createTestOrder,
  createTestProduct,
} from '../helpers/factories';
import app from '../helpers/testApp';

const VALID_ADDRESS = '123 Rizal Street, Quezon City, Metro Manila, 1100';

/**
 * Every test in this suite checks HTTP status + response.body.success +
 * response.body.message, per the QA requirements for this module. These two
 * helpers make that a one-line call instead of three repeated `expect`s in
 * every single test, so the requirement holds uniformly without duplicated
 * boilerplate.
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

/** Seeds a customer with a cart containing one purchasable product. */
const setupCustomerWithCartItem = async (
  quantity: number,
  productOptions: Parameters<typeof createTestProduct>[0] = {},
) => {
  const customer = await createCustomer();
  const product = await createTestProduct({ withInventory: true, quantity: 100, price: 100, ...productOptions });
  const cart = await createTestCart(customer.user.id);
  await addCartItem(cart.id, product.id, quantity);
  return { customer, product, cart };
};

describe('Order module', () => {
  // ================================================================
  // AUTHENTICATION & AUTHORIZATION
  // ================================================================
  describe('Authentication & Authorization', () => {
    it('returns 401 for a request without a JWT', async () => {
      const response = await request(app).get('/api/orders');
      expectApiError(response, 401);
    });

    it('returns 401 for a request with an invalid/malformed JWT', async () => {
      const response = await request(app).get('/api/orders').set('Authorization', 'Bearer this-is-not-a-real-token');
      expectApiError(response, 401);
    });

    it('allows a CUSTOMER to create an order', async () => {
      const { customer } = await setupCustomerWithCartItem(2);

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ shippingAddress: VALID_ADDRESS });

      expectApiSuccess(response, 201, 'Order created successfully.');
      expect(response.body.data.order).toBeDefined();

      const dbOrder = await prisma.order.findUnique({ where: { id: response.body.data.order.id } });
      expect(dbOrder).not.toBeNull();
    });

    it('scopes a CUSTOMER to only their own orders when listing', async () => {
      const customerA = await createCustomer();
      const customerB = await createCustomer();
      await createTestOrder({ customerId: customerA.user.id });
      await createTestOrder({ customerId: customerB.user.id });

      const response = await request(app).get('/api/orders').set('Authorization', `Bearer ${customerA.token}`);

      expectApiSuccess(response, 200, 'Orders retrieved successfully.');
      expect(Array.isArray(response.body.data.orders)).toBe(true);
      expect(response.body.data.orders).toHaveLength(1);
      expect(response.body.data.orders[0].customerId).toBe(customerA.user.id);
    });

    it("returns 404 when a CUSTOMER requests another customer's order", async () => {
      const customerA = await createCustomer();
      const customerB = await createCustomer();
      const order = await createTestOrder({ customerId: customerB.user.id });

      const response = await request(app).get(`/api/orders/${order.id}`).set('Authorization', `Bearer ${customerA.token}`);

      expectApiError(response, 404);
    });

    it('returns 403 when a CUSTOMER tries to update order status', async () => {
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id });

      const response = await request(app)
        .patch(`/api/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ status: OrderStatus.PROCESSING });

      expectApiError(response, 403);

      const dbOrder = await prisma.order.findUnique({ where: { id: order.id } });
      expect(dbOrder?.status).toBe(OrderStatus.PENDING);
    });

    it('allows a MODERATOR to view all orders across customers', async () => {
      const moderator = await createModerator();
      const customerA = await createCustomer();
      const customerB = await createCustomer();
      await createTestOrder({ customerId: customerA.user.id });
      await createTestOrder({ customerId: customerB.user.id });

      const response = await request(app).get('/api/orders').set('Authorization', `Bearer ${moderator.token}`);

      expectApiSuccess(response, 200, 'Orders retrieved successfully.');
      const customerIds = (response.body.data.orders as Array<{ customerId: string }>).map((o) => o.customerId);
      expect(customerIds).toEqual(expect.arrayContaining([customerA.user.id, customerB.user.id]));
    });

    it('allows a MODERATOR to update order status', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.PENDING });

      const response = await request(app)
        .patch(`/api/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ status: OrderStatus.PROCESSING });

      expectApiSuccess(response, 200, 'Order status updated successfully.');
      expect(response.body.data.order.status).toBe(OrderStatus.PROCESSING);

      const dbOrder = await prisma.order.findUnique({ where: { id: order.id } });
      expect(dbOrder?.status).toBe(OrderStatus.PROCESSING);
    });
  });

  // ================================================================
  // CREATE ORDER / CHECKOUT
  // ================================================================
  describe('Create Order / Checkout', () => {
    it('creates an order from the cart with correct totals and a preserved product snapshot', async () => {
      const customer = await createCustomer();
      const productA = await createTestProduct({ withInventory: true, quantity: 100, price: 100 });
      const productB = await createTestProduct({ withInventory: true, quantity: 50, price: 250 });
      const cart = await createTestCart(customer.user.id);
      await addCartItem(cart.id, productA.id, 3);
      await addCartItem(cart.id, productB.id, 2);

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ shippingAddress: VALID_ADDRESS });

      // --- HTTP response ---
      expectApiSuccess(response, 201, 'Order created successfully.');
      const order = response.body.data.order;
      expect(order).toHaveProperty('id');
      expect(order.customerId).toBe(customer.user.id);
      expect(order.status).toBe(OrderStatus.PENDING);
      expect(Array.isArray(order.items)).toBe(true);
      expect(order.items).toHaveLength(2);
      // subtotal = 100*3 + 250*2 = 800; no shipping fee yet -> totalAmount === subtotal
      expect(Number(order.subtotal)).toBe(800);
      expect(Number(order.totalAmount)).toBe(800);

      // --- Database: Order record exists, with the correct customerId/amounts ---
      const dbOrder = await prisma.order.findUnique({ where: { id: order.id } });
      expect(dbOrder).not.toBeNull();
      expect(dbOrder?.customerId).toBe(customer.user.id);
      expect(Number(dbOrder?.subtotal)).toBe(800);
      expect(Number(dbOrder?.totalAmount)).toBe(800);

      // --- Database: OrderItem records created, with a preserved product snapshot ---
      const dbItems = await prisma.orderItem.findMany({ where: { orderId: order.id } });
      expect(dbItems).toHaveLength(2);

      const dbItemA = dbItems.find((item) => item.productId === productA.id);
      expect(dbItemA?.quantity).toBe(3);
      expect(dbItemA?.productName).toBe(productA.name);
      expect(Number(dbItemA?.unitPrice)).toBe(100);
      expect(Number(dbItemA?.lineTotal)).toBe(300);

      const dbItemB = dbItems.find((item) => item.productId === productB.id);
      expect(dbItemB?.quantity).toBe(2);
      expect(dbItemB?.productName).toBe(productB.name);
      expect(Number(dbItemB?.unitPrice)).toBe(250);
      expect(Number(dbItemB?.lineTotal)).toBe(500);
    });
  });

  // ================================================================
  // CART BEHAVIOR
  // ================================================================
  describe('Cart behavior after checkout', () => {
    it('clears the cart (CartItem count becomes 0) but keeps the Cart row', async () => {
      const { customer, cart } = await setupCustomerWithCartItem(2);

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ shippingAddress: VALID_ADDRESS });

      expectApiSuccess(response, 201, 'Order created successfully.');

      const remainingItems = await prisma.cartItem.count({ where: { cartId: cart.id } });
      expect(remainingItems).toBe(0);

      const dbCart = await prisma.cart.findUnique({ where: { id: cart.id } });
      expect(dbCart).not.toBeNull();
    });
  });

  // ================================================================
  // INVENTORY BEHAVIOR
  // ================================================================
  describe('Inventory behavior', () => {
    it('decreases inventory quantity by the ordered amount (100 -> order 5 -> 95)', async () => {
      const { customer, product } = await setupCustomerWithCartItem(5, { quantity: 100 });

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ shippingAddress: VALID_ADDRESS });

      expectApiSuccess(response, 201, 'Order created successfully.');

      const inventory = await prisma.inventory.findUnique({ where: { productId: product.id } });
      expect(inventory?.quantity).toBe(95);
    });

    it('cannot order more than available stock: 400, inventory unchanged, no order created', async () => {
      const { customer, product, cart } = await setupCustomerWithCartItem(20, { quantity: 5 });

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ shippingAddress: VALID_ADDRESS });

      expectApiError(response, 400, /available/i);

      const inventory = await prisma.inventory.findUnique({ where: { productId: product.id } });
      expect(inventory?.quantity).toBe(5);

      const orderCount = await prisma.order.count({ where: { customerId: customer.user.id } });
      expect(orderCount).toBe(0);

      const cartItemCount = await prisma.cartItem.count({ where: { cartId: cart.id } });
      expect(cartItemCount).toBe(1);
    });
  });

  // ================================================================
  // VALIDATION TESTS
  // ================================================================
  describe('Validation', () => {
    it('rejects checkout with an empty cart (400)', async () => {
      const customer = await createCustomer();
      await createTestCart(customer.user.id);

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ shippingAddress: VALID_ADDRESS });

      expectApiError(response, 400, /cart is empty/i);

      const orderCount = await prisma.order.count({ where: { customerId: customer.user.id } });
      expect(orderCount).toBe(0);
    });

    it('rejects checkout with a missing shipping address (400)', async () => {
      const { customer } = await setupCustomerWithCartItem(1);

      const response = await request(app).post('/api/orders').set('Authorization', `Bearer ${customer.token}`).send({});

      expectApiError(response, 400, 'Validation failed.');
      expect(response.body.errors.some((e: { path: string }) => e.path === 'shippingAddress')).toBe(true);
    });

    it('rejects invalid order data - wrong type for shippingAddress (400)', async () => {
      const { customer } = await setupCustomerWithCartItem(1);

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ shippingAddress: 12345 });

      expectApiError(response, 400, 'Validation failed.');
      expect(response.body.errors.some((e: { path: string }) => e.path === 'shippingAddress')).toBe(true);
    });

    it('rejects ordering an inactive product (400), nothing committed', async () => {
      const { customer, product } = await setupCustomerWithCartItem(1, { isActive: false });

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ shippingAddress: VALID_ADDRESS });

      expectApiError(response, 400, /no longer available/i);

      const orderCount = await prisma.order.count({ where: { customerId: customer.user.id } });
      expect(orderCount).toBe(0);
      const inventory = await prisma.inventory.findUnique({ where: { productId: product.id } });
      expect(inventory?.quantity).toBe(100);
    });

    it('rejects ordering a soft-deleted product (400), nothing committed', async () => {
      const { customer, product } = await setupCustomerWithCartItem(1);
      await prisma.product.update({ where: { id: product.id }, data: { deletedAt: new Date(), isActive: false } });

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ shippingAddress: VALID_ADDRESS });

      expectApiError(response, 400, /no longer available/i);

      const orderCount = await prisma.order.count({ where: { customerId: customer.user.id } });
      expect(orderCount).toBe(0);
    });
  });

  // ================================================================
  // ORDER STATUS TESTS (MODERATOR)
  // ================================================================
  describe('Order status transitions', () => {
    it('walks an order through PENDING -> PROCESSING -> SHIPPED -> DELIVERED, verified in the database at each step', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.PENDING });

      const transitions: OrderStatus[] = [OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.DELIVERED];

      for (const nextStatus of transitions) {
        const response = await request(app)
          .patch(`/api/orders/${order.id}/status`)
          .set('Authorization', `Bearer ${moderator.token}`)
          .send({ status: nextStatus });

        expectApiSuccess(response, 200, 'Order status updated successfully.');
        expect(response.body.data.order.status).toBe(nextStatus);

        const dbOrder = await prisma.order.findUnique({ where: { id: order.id } });
        expect(dbOrder?.status).toBe(nextStatus);
      }
    });

    it('rejects an invalid status value (400), database unchanged', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.PENDING });

      const response = await request(app)
        .patch(`/api/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ status: 'INVALID_STATUS' });

      expectApiError(response, 400, 'Validation failed.');

      const dbOrder = await prisma.order.findUnique({ where: { id: order.id } });
      expect(dbOrder?.status).toBe(OrderStatus.PENDING);
    });
  });

  // ================================================================
  // CANCELLATION TESTS
  // ================================================================
  describe('Cancellation', () => {
    it('lets a CUSTOMER cancel their own PENDING order, restocking inventory', async () => {
      const customer = await createCustomer();
      // createTestOrder seeds Order/OrderItem rows directly via Prisma - unlike
      // a real checkout, it never decrements Inventory. So the product here is
      // seeded already reduced by the order's quantity (10 original - 4 for
      // this order = 6 on hand), accurately representing what the database
      // would actually look like for a real PENDING order with items reserved.
      const product = await createTestProduct({ withInventory: true, quantity: 6 });
      const order = await createTestOrder({
        customerId: customer.user.id,
        status: OrderStatus.PENDING,
        items: [{ productId: product.id, quantity: 4 }],
      });

      const response = await request(app).patch(`/api/orders/${order.id}/cancel`).set('Authorization', `Bearer ${customer.token}`);

      expectApiSuccess(response, 200, 'Order cancelled successfully.');
      expect(response.body.data.order.status).toBe(OrderStatus.CANCELLED);

      const dbOrder = await prisma.order.findUnique({ where: { id: order.id } });
      expect(dbOrder?.status).toBe(OrderStatus.CANCELLED);

      const inventory = await prisma.inventory.findUnique({ where: { productId: product.id } });
      expect(inventory?.quantity).toBe(10); // restocked back to the original quantity
    });

    it('rejects cancelling a DELIVERED order (400), status unchanged', async () => {
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.DELIVERED });

      const response = await request(app).patch(`/api/orders/${order.id}/cancel`).set('Authorization', `Bearer ${customer.token}`);

      expectApiError(response, 400, /pending/i);

      const dbOrder = await prisma.order.findUnique({ where: { id: order.id } });
      expect(dbOrder?.status).toBe(OrderStatus.DELIVERED);
    });
  });
});
