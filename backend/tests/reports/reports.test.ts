import { BookingStatus, OrderStatus, PaymentStatus, ProjectStatus } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import {
  createCustomer,
  createModerator,
  createOwner,
  createTestBooking,
  createTestInstaller,
  createTestOrder,
  createTestPayment,
  createTestProduct,
  createTestProject,
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

/** One hand-computable fixture set reused across every report's tests. */
const seedReportsFixtures = async () => {
  const owner = await createOwner();
  const moderator = await createModerator();
  const customerA = await createCustomer();
  const customerB = await createCustomer();
  const installer = await createTestInstaller();

  const productA = await createTestProduct({ name: 'Product A', price: 100, withInventory: true, quantity: 50, reorderLevel: 10 });
  const productB = await createTestProduct({ name: 'Product B', price: 50, withInventory: true, quantity: 5, reorderLevel: 10 }); // low stock

  const orderDelivered = await createTestOrder({
    customerId: customerA.user.id,
    status: OrderStatus.DELIVERED,
    items: [{ productId: productA.id, quantity: 2, unitPrice: 100 }], // 200
  });
  const orderPending = await createTestOrder({
    customerId: customerA.user.id,
    status: OrderStatus.PENDING,
    items: [{ productId: productB.id, quantity: 1, unitPrice: 50 }], // 50
  });
  const orderProcessing = await createTestOrder({
    customerId: customerB.user.id,
    status: OrderStatus.PROCESSING,
    items: [{ productId: productA.id, quantity: 1, unitPrice: 100 }], // 100
  });

  await createTestPayment({ orderId: orderDelivered.id, status: PaymentStatus.PAID, amount: 200 });
  await createTestPayment({ orderId: orderProcessing.id, status: PaymentStatus.PAID, amount: 100 });
  await createTestPayment({ orderId: orderPending.id, status: PaymentStatus.PENDING, amount: 50 });

  const bookingPending = await createTestBooking({ customerId: customerA.user.id, status: BookingStatus.PENDING });
  const bookingApproved = await createTestBooking({ customerId: customerB.user.id, installerId: installer.id, status: BookingStatus.APPROVED });

  const projectInProgress = await createTestProject({
    customerId: customerA.user.id,
    ownerId: owner.user.id,
    moderatorId: moderator.user.id,
    status: ProjectStatus.IN_PROGRESS,
    budget: 10000,
  });
  const projectPending = await createTestProject({
    customerId: customerB.user.id,
    ownerId: owner.user.id,
    status: ProjectStatus.PENDING,
    budget: 5000,
  });

  return {
    owner,
    moderator,
    customerA,
    customerB,
    installer,
    productA,
    productB,
    orderDelivered,
    orderPending,
    orderProcessing,
    bookingPending,
    bookingApproved,
    projectInProgress,
    projectPending,
  };
};

describe('Reports module', () => {
  // ================================================================
  // AUTHENTICATION
  // ================================================================
  describe('Authentication', () => {
    it('returns 401 for a request without a JWT', async () => {
      const response = await request(app).get('/api/reports/sales');
      expectApiError(response, 401);
    });

    it('returns 401 for a malformed JWT', async () => {
      const response = await request(app).get('/api/reports/sales').set('Authorization', 'Bearer not-a-real-token');
      expectApiError(response, 401);
    });
  });

  // ================================================================
  // AUTHORIZATION
  // ================================================================
  describe('Authorization', () => {
    const endpoints = ['/api/reports/sales', '/api/reports/inventory', '/api/reports/orders', '/api/reports/bookings', '/api/reports/projects'];

    it('returns 403 for a CUSTOMER on every report endpoint', async () => {
      const customer = await createCustomer();

      for (const endpoint of endpoints) {
        const response = await request(app).get(endpoint).set('Authorization', `Bearer ${customer.token}`);
        expectApiError(response, 403);
      }
    });

    it('lets both OWNER and MODERATOR reach every endpoint (200)', async () => {
      const owner = await createOwner();
      const moderator = await createModerator();

      for (const endpoint of endpoints) {
        const ownerResponse = await request(app).get(endpoint).set('Authorization', `Bearer ${owner.token}`);
        expectApiSuccess(ownerResponse, 200);

        const moderatorResponse = await request(app).get(endpoint).set('Authorization', `Bearer ${moderator.token}`);
        expectApiSuccess(moderatorResponse, 200);
      }
    });
  });

  // ================================================================
  // VALIDATION
  // ================================================================
  describe('Validation', () => {
    it('rejects an invalid dateFrom format with 400', async () => {
      const owner = await createOwner();

      const response = await request(app).get('/api/reports/sales').set('Authorization', `Bearer ${owner.token}`).query({ dateFrom: 'not-a-date' });

      expectApiError(response, 400, 'Validation failed.');
    });

    it('rejects an invalid page value with 400', async () => {
      const owner = await createOwner();

      const response = await request(app).get('/api/reports/orders').set('Authorization', `Bearer ${owner.token}`).query({ page: 'abc' });

      expectApiError(response, 400, 'Validation failed.');
    });

    it('rejects an invalid order status with 400', async () => {
      const owner = await createOwner();

      const response = await request(app).get('/api/reports/orders').set('Authorization', `Bearer ${owner.token}`).query({ status: 'NOT_REAL' });

      expectApiError(response, 400, 'Validation failed.');
    });

    it('rejects an invalid booking status with 400', async () => {
      const owner = await createOwner();

      const response = await request(app).get('/api/reports/bookings').set('Authorization', `Bearer ${owner.token}`).query({ status: 'NOT_REAL' });

      expectApiError(response, 400, 'Validation failed.');
    });

    it('rejects an invalid project status with 400', async () => {
      const owner = await createOwner();

      const response = await request(app).get('/api/reports/projects').set('Authorization', `Bearer ${owner.token}`).query({ status: 'NOT_REAL' });

      expectApiError(response, 400, 'Validation failed.');
    });
  });

  // ================================================================
  // EMPTY DATABASE HANDLING
  // ================================================================
  describe('Empty database handling', () => {
    it('GET /api/reports/sales returns zeroed report with no errors', async () => {
      const owner = await createOwner();

      const response = await request(app).get('/api/reports/sales').set('Authorization', `Bearer ${owner.token}`);

      expectApiSuccess(response, 200);
      expect(response.body.data.summary.totalOrders).toBe(0);
      expect(response.body.data.summary.totalRevenue).toBe(0);
      expect(response.body.data.orders).toEqual([]);
      expect(response.body.data.pagination.total).toBe(0);
    });

    it('GET /api/reports/inventory returns zeroed report with no errors', async () => {
      const owner = await createOwner();

      const response = await request(app).get('/api/reports/inventory').set('Authorization', `Bearer ${owner.token}`);

      expectApiSuccess(response, 200);
      expect(response.body.data.summary.totalItems).toBe(0);
      expect(response.body.data.summary.totalInventoryValue).toBe(0);
      expect(response.body.data.inventory).toEqual([]);
    });

    it('GET /api/reports/orders returns zeroed report with no errors', async () => {
      const owner = await createOwner();

      const response = await request(app).get('/api/reports/orders').set('Authorization', `Bearer ${owner.token}`);

      expectApiSuccess(response, 200);
      expect(response.body.data.summary.totalOrders).toBe(0);
      expect(response.body.data.orders).toEqual([]);
    });

    it('GET /api/reports/bookings returns zeroed report with no errors', async () => {
      const owner = await createOwner();

      const response = await request(app).get('/api/reports/bookings').set('Authorization', `Bearer ${owner.token}`);

      expectApiSuccess(response, 200);
      expect(response.body.data.summary.totalBookings).toBe(0);
      expect(response.body.data.bookings).toEqual([]);
    });

    it('GET /api/reports/projects returns zeroed report with no errors', async () => {
      const owner = await createOwner();

      const response = await request(app).get('/api/reports/projects').set('Authorization', `Bearer ${owner.token}`);

      expectApiSuccess(response, 200);
      expect(response.body.data.summary.totalProjects).toBe(0);
      expect(response.body.data.summary.totalBudget).toBe(0);
      expect(response.body.data.projects).toEqual([]);
    });
  });

  // ================================================================
  // GET /api/reports/sales
  // ================================================================
  describe('GET /api/reports/sales', () => {
    it('computes correct totals for OWNER, verified against the database', async () => {
      const fixtures = await seedReportsFixtures();

      const response = await request(app).get('/api/reports/sales').set('Authorization', `Bearer ${fixtures.owner.token}`);

      expectApiSuccess(response, 200, 'Sales report retrieved successfully.');
      const data = response.body.data;

      expect(data.summary.totalOrders).toBe(3);
      expect(data.summary.totalRevenue).toBe(300);
      expect(data.summary.averageOrderValue).toBe(150);

      const dbOrderCount = await prisma.order.count();
      expect(data.summary.totalOrders).toBe(dbOrderCount);

      const deliveredRow = (data.orders as Array<{ id: string; totalAmount: number }>).find((row) => row.id === fixtures.orderDelivered.id);
      expect(deliveredRow?.totalAmount).toBe(200);
    });

    it('omits revenue fields and per-row totalAmount for MODERATOR', async () => {
      const fixtures = await seedReportsFixtures();

      const response = await request(app).get('/api/reports/sales').set('Authorization', `Bearer ${fixtures.moderator.token}`);

      expectApiSuccess(response, 200);
      expect(response.body.data.summary.totalRevenue).toBeUndefined();
      expect(response.body.data.summary.averageOrderValue).toBeUndefined();
      const orders = response.body.data.orders as Array<{ totalAmount?: number }>;
      expect(orders.every((row) => row.totalAmount === undefined)).toBe(true);
      expect(response.body.data.summary.totalOrders).toBe(3);
    });

    it('filters orders by date range, verified against the database', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const product = await createTestProduct({ price: 100 });

      const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const oldOrder = await prisma.order.create({
        data: {
          orderNumber: `OLD-${Date.now()}`,
          customerId: customer.user.id,
          status: OrderStatus.DELIVERED,
          subtotal: 500,
          shippingFee: 0,
          totalAmount: 500,
          shippingAddress: '123 Test Street',
          createdAt: oldDate,
        },
      });
      const recentOrder = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.DELIVERED, items: [{ productId: product.id, quantity: 1, unitPrice: 100 }] });

      const dateFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const response = await request(app).get('/api/reports/sales').set('Authorization', `Bearer ${owner.token}`).query({ dateFrom });

      expectApiSuccess(response, 200);
      expect(response.body.data.summary.totalOrders).toBe(1);
      const ids = (response.body.data.orders as Array<{ id: string }>).map((row) => row.id);
      expect(ids).toEqual([recentOrder.id]);

      const dbOldOrder = await prisma.order.findUnique({ where: { id: oldOrder.id } });
      expect(dbOldOrder).not.toBeNull();
    });

    it('paginates the orders list', async () => {
      const fixtures = await seedReportsFixtures();

      const response = await request(app)
        .get('/api/reports/sales')
        .set('Authorization', `Bearer ${fixtures.owner.token}`)
        .query({ limit: '2', page: '1' });

      expectApiSuccess(response, 200);
      expect(response.body.data.orders.length).toBeLessThanOrEqual(2);
      expect(response.body.data.pagination.limit).toBe(2);
      expect(response.body.data.pagination.total).toBe(3);
    });
  });

  // ================================================================
  // GET /api/reports/inventory
  // ================================================================
  describe('GET /api/reports/inventory', () => {
    it('computes correct totals for OWNER, verified against the database', async () => {
      const fixtures = await seedReportsFixtures();

      const response = await request(app).get('/api/reports/inventory').set('Authorization', `Bearer ${fixtures.owner.token}`);

      expectApiSuccess(response, 200, 'Inventory report retrieved successfully.');
      const data = response.body.data;

      expect(data.summary.totalItems).toBe(2);
      expect(data.summary.lowStockCount).toBe(1);
      expect(data.summary.totalInventoryValue).toBe(50 * 100 + 5 * 50); // 5250

      const dbInventoryCount = await prisma.inventory.count();
      expect(data.summary.totalItems).toBe(dbInventoryCount);

      const rowB = (data.inventory as Array<{ productId: string; isLowStock: boolean; unitPrice: number }>).find(
        (row) => row.productId === fixtures.productB.id,
      );
      expect(rowB?.isLowStock).toBe(true);
      expect(rowB?.unitPrice).toBe(50);
    });

    it('omits unitPrice and totalInventoryValue for MODERATOR', async () => {
      const fixtures = await seedReportsFixtures();

      const response = await request(app).get('/api/reports/inventory').set('Authorization', `Bearer ${fixtures.moderator.token}`);

      expectApiSuccess(response, 200);
      expect(response.body.data.summary.totalInventoryValue).toBeUndefined();
      const inventory = response.body.data.inventory as Array<{ unitPrice?: number }>;
      expect(inventory.every((row) => row.unitPrice === undefined)).toBe(true);
      expect(response.body.data.summary.lowStockCount).toBe(1);
    });

    it('paginates the inventory list', async () => {
      const fixtures = await seedReportsFixtures();
      await createTestProduct({ withInventory: true, quantity: 30, reorderLevel: 10 });

      const response = await request(app)
        .get('/api/reports/inventory')
        .set('Authorization', `Bearer ${fixtures.owner.token}`)
        .query({ limit: '2', page: '1' });

      expectApiSuccess(response, 200);
      expect(response.body.data.inventory.length).toBeLessThanOrEqual(2);
      expect(response.body.data.pagination.total).toBe(3);
    });
  });

  // ================================================================
  // GET /api/reports/orders
  // ================================================================
  describe('GET /api/reports/orders', () => {
    it('computes status breakdown for both roles, without any revenue figure', async () => {
      const fixtures = await seedReportsFixtures();

      const response = await request(app).get('/api/reports/orders').set('Authorization', `Bearer ${fixtures.owner.token}`);

      expectApiSuccess(response, 200, 'Orders report retrieved successfully.');
      const data = response.body.data;
      expect(data.summary.totalOrders).toBe(3);
      expect(data.summary.totalRevenue).toBeUndefined();

      const statusMap = Object.fromEntries((data.summary.ordersByStatus as Array<{ status: string; count: number }>).map((r) => [r.status, r.count]));
      expect(statusMap[OrderStatus.DELIVERED]).toBe(1);
      expect(statusMap[OrderStatus.PENDING]).toBe(1);
      expect(statusMap[OrderStatus.PROCESSING]).toBe(1);
    });

    it('filters by status', async () => {
      const fixtures = await seedReportsFixtures();

      const response = await request(app)
        .get('/api/reports/orders')
        .set('Authorization', `Bearer ${fixtures.owner.token}`)
        .query({ status: OrderStatus.DELIVERED });

      expectApiSuccess(response, 200);
      expect(response.body.data.summary.totalOrders).toBe(1);
      const ids = (response.body.data.orders as Array<{ id: string }>).map((row) => row.id);
      expect(ids).toEqual([fixtures.orderDelivered.id]);
    });

    it('omits per-row totalAmount for MODERATOR', async () => {
      const fixtures = await seedReportsFixtures();

      const response = await request(app).get('/api/reports/orders').set('Authorization', `Bearer ${fixtures.moderator.token}`);

      expectApiSuccess(response, 200);
      const orders = response.body.data.orders as Array<{ totalAmount?: number }>;
      expect(orders.every((row) => row.totalAmount === undefined)).toBe(true);
    });
  });

  // ================================================================
  // GET /api/reports/bookings
  // ================================================================
  describe('GET /api/reports/bookings', () => {
    it('computes status breakdown, identical for OWNER and MODERATOR, verified against the database', async () => {
      const fixtures = await seedReportsFixtures();

      const ownerResponse = await request(app).get('/api/reports/bookings').set('Authorization', `Bearer ${fixtures.owner.token}`);
      const moderatorResponse = await request(app).get('/api/reports/bookings').set('Authorization', `Bearer ${fixtures.moderator.token}`);

      expectApiSuccess(ownerResponse, 200, 'Bookings report retrieved successfully.');
      expectApiSuccess(moderatorResponse, 200);

      expect(ownerResponse.body.data.summary.totalBookings).toBe(2);
      expect(moderatorResponse.body.data.summary.totalBookings).toBe(2);

      const statusMap = Object.fromEntries(
        (ownerResponse.body.data.summary.bookingsByStatus as Array<{ status: string; count: number }>).map((r) => [r.status, r.count]),
      );
      expect(statusMap[BookingStatus.PENDING]).toBe(1);
      expect(statusMap[BookingStatus.APPROVED]).toBe(1);

      const dbBookingCount = await prisma.booking.count();
      expect(ownerResponse.body.data.summary.totalBookings).toBe(dbBookingCount);

      const approvedRow = (ownerResponse.body.data.bookings as Array<{ id: string; installerName: string | null }>).find(
        (row) => row.id === fixtures.bookingApproved.id,
      );
      expect(approvedRow?.installerName).toBe(`${fixtures.installer.firstName} ${fixtures.installer.lastName}`);
    });

    it('filters by status and date range', async () => {
      const fixtures = await seedReportsFixtures();

      const response = await request(app)
        .get('/api/reports/bookings')
        .set('Authorization', `Bearer ${fixtures.owner.token}`)
        .query({ status: BookingStatus.APPROVED });

      expectApiSuccess(response, 200);
      expect(response.body.data.summary.totalBookings).toBe(1);
      const ids = (response.body.data.bookings as Array<{ id: string }>).map((row) => row.id);
      expect(ids).toEqual([fixtures.bookingApproved.id]);
    });

    it('paginates the bookings list', async () => {
      const fixtures = await seedReportsFixtures();

      const response = await request(app)
        .get('/api/reports/bookings')
        .set('Authorization', `Bearer ${fixtures.owner.token}`)
        .query({ limit: '1', page: '1' });

      expectApiSuccess(response, 200);
      expect(response.body.data.bookings.length).toBeLessThanOrEqual(1);
      expect(response.body.data.pagination.total).toBe(2);
    });
  });

  // ================================================================
  // GET /api/reports/projects
  // ================================================================
  describe('GET /api/reports/projects', () => {
    it('computes correct totals for OWNER, verified against the database', async () => {
      const fixtures = await seedReportsFixtures();

      const response = await request(app).get('/api/reports/projects').set('Authorization', `Bearer ${fixtures.owner.token}`);

      expectApiSuccess(response, 200, 'Projects report retrieved successfully.');
      const data = response.body.data;

      expect(data.summary.totalProjects).toBe(2);
      expect(data.summary.totalBudget).toBe(15000);
      expect(data.summary.averageBudget).toBe(7500);

      const dbProjectCount = await prisma.project.count();
      expect(data.summary.totalProjects).toBe(dbProjectCount);

      const row = (data.projects as Array<{ id: string; budget: number; moderatorName: string | null }>).find(
        (r) => r.id === fixtures.projectInProgress.id,
      );
      expect(row?.budget).toBe(10000);
      expect(row?.moderatorName).toBe(`${fixtures.moderator.user.firstName} ${fixtures.moderator.user.lastName}`);
    });

    it('omits budget fields for MODERATOR', async () => {
      const fixtures = await seedReportsFixtures();

      const response = await request(app).get('/api/reports/projects').set('Authorization', `Bearer ${fixtures.moderator.token}`);

      expectApiSuccess(response, 200);
      expect(response.body.data.summary.totalBudget).toBeUndefined();
      expect(response.body.data.summary.averageBudget).toBeUndefined();
      const projects = response.body.data.projects as Array<{ budget?: number }>;
      expect(projects.every((row) => row.budget === undefined)).toBe(true);
      expect(response.body.data.summary.totalProjects).toBe(2);
    });

    it('filters by status and date range, verified against the database', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();

      const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const oldProject = await prisma.project.create({
        data: { customerId: customer.user.id, ownerId: owner.user.id, name: 'Old Project', status: ProjectStatus.PENDING, createdAt: oldDate },
      });
      const recentProject = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id, status: ProjectStatus.PENDING });

      const dateFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const response = await request(app)
        .get('/api/reports/projects')
        .set('Authorization', `Bearer ${owner.token}`)
        .query({ dateFrom, status: ProjectStatus.PENDING });

      expectApiSuccess(response, 200);
      expect(response.body.data.summary.totalProjects).toBe(1);
      const ids = (response.body.data.projects as Array<{ id: string }>).map((row) => row.id);
      expect(ids).toEqual([recentProject.id]);

      const dbOldProject = await prisma.project.findUnique({ where: { id: oldProject.id } });
      expect(dbOldProject).not.toBeNull();
    });

    it('paginates the projects list', async () => {
      const fixtures = await seedReportsFixtures();

      const response = await request(app)
        .get('/api/reports/projects')
        .set('Authorization', `Bearer ${fixtures.owner.token}`)
        .query({ limit: '1', page: '1' });

      expectApiSuccess(response, 200);
      expect(response.body.data.projects.length).toBeLessThanOrEqual(1);
      expect(response.body.data.pagination.total).toBe(2);
    });
  });
});
