import { BookingStatus, OrderStatus, PaymentStatus, ProjectStatus, RequestStatus } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import {
  createCustomer,
  createModerator,
  createOwner,
  createTestBooking,
  createTestFeedback,
  createTestOrder,
  createTestPayment,
  createTestProduct,
  createTestProject,
  createTestRequest,
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

/**
 * One hand-computable fixture set reused across dashboard/sales/products/
 * customers/projects tests, so every expected number below can be derived
 * by reading this function rather than re-deriving it per test.
 */
const seedAnalyticsFixtures = async () => {
  const owner = await createOwner();
  const moderator = await createModerator();
  const customerA = await createCustomer();
  const customerB = await createCustomer();

  const productA = await createTestProduct({ name: 'Product A', price: 100, withInventory: true, quantity: 50, reorderLevel: 10 });
  const productB = await createTestProduct({ name: 'Product B', price: 50, withInventory: true, quantity: 5, reorderLevel: 10 }); // low stock
  const productC = await createTestProduct({ name: 'Product C', price: 30, withInventory: true, quantity: 20, reorderLevel: 10 });

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
    items: [{ productId: productC.id, quantity: 3, unitPrice: 30 }], // 90
  });

  await createTestPayment({ orderId: orderDelivered.id, status: PaymentStatus.PAID, amount: 200 });
  await createTestPayment({ orderId: orderProcessing.id, status: PaymentStatus.PAID, amount: 90 });
  await createTestPayment({ orderId: orderPending.id, status: PaymentStatus.PENDING, amount: 50 });

  await createTestBooking({ customerId: customerA.user.id, status: BookingStatus.PENDING });
  await createTestBooking({ customerId: customerB.user.id, status: BookingStatus.APPROVED });

  const assignedProject = await createTestProject({
    customerId: customerA.user.id,
    ownerId: owner.user.id,
    moderatorId: moderator.user.id,
    status: ProjectStatus.IN_PROGRESS,
    budget: 10000,
  });
  const unassignedProject = await createTestProject({
    customerId: customerB.user.id,
    ownerId: owner.user.id,
    status: ProjectStatus.PENDING,
    budget: 5000,
  });

  await createTestRequest({ requestedById: moderator.user.id, status: RequestStatus.PENDING });

  await createTestFeedback({ customerId: customerA.user.id, orderId: orderDelivered.id, rating: 5 });
  await createTestFeedback({ customerId: customerB.user.id, orderId: orderProcessing.id, rating: 3 });

  return {
    owner,
    moderator,
    customerA,
    customerB,
    productA,
    productB,
    productC,
    orderDelivered,
    orderPending,
    orderProcessing,
    assignedProject,
    unassignedProject,
  };
};

describe('Analytics module', () => {
  // ================================================================
  // AUTHENTICATION
  // ================================================================
  describe('Authentication', () => {
    it('returns 401 for a request without a JWT', async () => {
      const response = await request(app).get('/api/analytics/dashboard');
      expectApiError(response, 401);
    });

    it('returns 401 for a malformed JWT', async () => {
      const response = await request(app).get('/api/analytics/dashboard').set('Authorization', 'Bearer not-a-real-token');
      expectApiError(response, 401);
    });
  });

  // ================================================================
  // AUTHORIZATION
  // ================================================================
  describe('Authorization', () => {
    it('returns 403 for a CUSTOMER on every analytics endpoint', async () => {
      const customer = await createCustomer();

      const endpoints = ['/api/analytics/dashboard', '/api/analytics/sales', '/api/analytics/products', '/api/analytics/customers', '/api/analytics/projects'];

      for (const endpoint of endpoints) {
        const response = await request(app).get(endpoint).set('Authorization', `Bearer ${customer.token}`);
        expectApiError(response, 403);
      }
    });

    it('lets both OWNER and MODERATOR reach every endpoint (200)', async () => {
      const owner = await createOwner();
      const moderator = await createModerator();
      const endpoints = ['/api/analytics/dashboard', '/api/analytics/sales', '/api/analytics/products', '/api/analytics/customers', '/api/analytics/projects'];

      for (const endpoint of endpoints) {
        const ownerResponse = await request(app).get(endpoint).set('Authorization', `Bearer ${owner.token}`);
        expectApiSuccess(ownerResponse, 200);

        const moderatorResponse = await request(app).get(endpoint).set('Authorization', `Bearer ${moderator.token}`);
        expectApiSuccess(moderatorResponse, 200);
      }
    });
  });

  // ================================================================
  // EMPTY DATABASE HANDLING
  // ================================================================
  describe('Empty database handling', () => {
    it('GET /api/analytics/dashboard returns zeroed stats with no errors', async () => {
      const owner = await createOwner();

      const response = await request(app).get('/api/analytics/dashboard').set('Authorization', `Bearer ${owner.token}`);

      expectApiSuccess(response, 200, 'Dashboard analytics retrieved successfully.');
      expect(response.body.data.totalOrders).toBe(0);
      expect(response.body.data.ordersByStatus).toEqual([]);
      expect(response.body.data.averageFeedbackRating).toBeNull();
      expect(response.body.data.totalRevenue).toBe(0);
      expect(response.body.data.averageOrderValue).toBe(0);
    });

    it('GET /api/analytics/sales returns zeroed stats with no errors', async () => {
      const owner = await createOwner();

      const response = await request(app).get('/api/analytics/sales').set('Authorization', `Bearer ${owner.token}`);

      expectApiSuccess(response, 200);
      expect(response.body.data.totalOrders).toBe(0);
      expect(response.body.data.totalRevenue).toBe(0);
      expect(response.body.data.averageOrderValue).toBe(0);
      expect(response.body.data.revenueByStatus).toEqual([]);
    });

    it('GET /api/analytics/products returns empty list with no errors', async () => {
      const owner = await createOwner();

      const response = await request(app).get('/api/analytics/products').set('Authorization', `Bearer ${owner.token}`);

      expectApiSuccess(response, 200);
      expect(response.body.data.topProducts).toEqual([]);
      expect(response.body.data.pagination.total).toBe(0);
      expect(response.body.data.totalInventoryValue).toBe(0);
    });

    it('GET /api/analytics/customers returns zeroed stats with no errors', async () => {
      const owner = await createOwner();

      const response = await request(app).get('/api/analytics/customers').set('Authorization', `Bearer ${owner.token}`);

      expectApiSuccess(response, 200);
      expect(response.body.data.totalCustomers).toBe(0);
      expect(response.body.data.repeatCustomers).toBe(0);
      expect(response.body.data.topCustomers).toEqual([]);
    });

    it('GET /api/analytics/projects returns empty stats with no errors', async () => {
      const owner = await createOwner();

      const response = await request(app).get('/api/analytics/projects').set('Authorization', `Bearer ${owner.token}`);

      expectApiSuccess(response, 200);
      expect(response.body.data.totalProjects).toBe(0);
      expect(response.body.data.averageDurationDays).toBeNull();
      expect(response.body.data.moderatorWorkload).toEqual([]);
      expect(response.body.data.totalBudget).toBe(0);
    });
  });

  // ================================================================
  // GET /api/analytics/dashboard
  // ================================================================
  describe('GET /api/analytics/dashboard', () => {
    it('computes correct aggregate counts for OWNER, verified against the database', async () => {
      const fixtures = await seedAnalyticsFixtures();

      const response = await request(app).get('/api/analytics/dashboard').set('Authorization', `Bearer ${fixtures.owner.token}`);

      expectApiSuccess(response, 200);
      const data = response.body.data;

      expect(data.totalCustomers).toBe(2);
      expect(data.totalActiveProducts).toBe(3);
      expect(data.lowStockCount).toBe(1);
      expect(data.totalOrders).toBe(3);
      expect(data.totalBookings).toBe(2);
      expect(data.totalProjects).toBe(2);
      expect(data.pendingRequests).toBe(1);
      expect(data.averageFeedbackRating).toBe(4);
      expect(data.totalRevenue).toBe(290);
      expect(data.averageOrderValue).toBe(145);

      const dbOrderCount = await prisma.order.count();
      expect(data.totalOrders).toBe(dbOrderCount);

      const orderStatusMap = Object.fromEntries(
        (data.ordersByStatus as Array<{ status: string; count: number }>).map((row) => [row.status, row.count]),
      );
      expect(orderStatusMap[OrderStatus.DELIVERED]).toBe(1);
      expect(orderStatusMap[OrderStatus.PENDING]).toBe(1);
      expect(orderStatusMap[OrderStatus.PROCESSING]).toBe(1);
    });

    it('omits revenue fields for MODERATOR (operational statistics only)', async () => {
      const fixtures = await seedAnalyticsFixtures();

      const response = await request(app).get('/api/analytics/dashboard').set('Authorization', `Bearer ${fixtures.moderator.token}`);

      expectApiSuccess(response, 200);
      expect(response.body.data.totalRevenue).toBeUndefined();
      expect(response.body.data.averageOrderValue).toBeUndefined();
      // Operational fields are still present.
      expect(response.body.data.totalOrders).toBe(3);
      expect(response.body.data.totalCustomers).toBe(2);
    });
  });

  // ================================================================
  // GET /api/analytics/sales
  // ================================================================
  describe('GET /api/analytics/sales', () => {
    it('computes correct revenue and order breakdown for OWNER', async () => {
      const fixtures = await seedAnalyticsFixtures();

      const response = await request(app).get('/api/analytics/sales').set('Authorization', `Bearer ${fixtures.owner.token}`);

      expectApiSuccess(response, 200);
      const data = response.body.data;

      expect(data.totalOrders).toBe(3);
      expect(data.totalRevenue).toBe(290);
      expect(data.averageOrderValue).toBe(145);

      const revenueByStatus = data.revenueByStatus as Array<{ status: string; count: number; revenue: number }>;
      const delivered = revenueByStatus.find((row) => row.status === OrderStatus.DELIVERED);
      expect(delivered?.revenue).toBe(200);
      const processing = revenueByStatus.find((row) => row.status === OrderStatus.PROCESSING);
      expect(processing?.revenue).toBe(90);
    });

    it('omits revenue fields for MODERATOR but keeps order counts', async () => {
      const fixtures = await seedAnalyticsFixtures();

      const response = await request(app).get('/api/analytics/sales').set('Authorization', `Bearer ${fixtures.moderator.token}`);

      expectApiSuccess(response, 200);
      expect(response.body.data.totalRevenue).toBeUndefined();
      expect(response.body.data.revenueByStatus).toBeUndefined();
      expect(response.body.data.totalOrders).toBe(3);
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
      const response = await request(app)
        .get('/api/analytics/sales')
        .set('Authorization', `Bearer ${owner.token}`)
        .query({ dateFrom });

      expectApiSuccess(response, 200);
      expect(response.body.data.totalOrders).toBe(1);

      const dbOldOrder = await prisma.order.findUnique({ where: { id: oldOrder.id } });
      const dbRecentOrder = await prisma.order.findUnique({ where: { id: recentOrder.id } });
      expect(dbOldOrder).not.toBeNull();
      expect(dbRecentOrder).not.toBeNull();
    });
  });

  // ================================================================
  // GET /api/analytics/products
  // ================================================================
  describe('GET /api/analytics/products', () => {
    it('ranks top-selling products by quantity sold, with revenue for OWNER', async () => {
      const fixtures = await seedAnalyticsFixtures();

      const response = await request(app).get('/api/analytics/products').set('Authorization', `Bearer ${fixtures.owner.token}`);

      expectApiSuccess(response, 200);
      const topProducts = response.body.data.topProducts as Array<{ productId: string; quantitySold: number; revenue: number }>;

      // productC sold 3 units (highest), productA sold 2, productB sold 1.
      expect(topProducts).toHaveLength(3);
      expect(topProducts[0]!.productId).toBe(fixtures.productC.id);
      expect(topProducts[0]!.quantitySold).toBe(3);
      expect(topProducts[0]!.revenue).toBe(90);
      expect(topProducts[1]!.productId).toBe(fixtures.productA.id);
      expect(topProducts[1]!.quantitySold).toBe(2);

      expect(response.body.data.totalActiveProducts).toBe(3);
      expect(response.body.data.lowStockCount).toBe(1);
      expect(response.body.data.totalInventoryValue).toBe(50 * 100 + 5 * 50 + 20 * 30); // 5000 + 250 + 600 = 5850
    });

    it('omits revenue and inventory value for MODERATOR but keeps units sold', async () => {
      const fixtures = await seedAnalyticsFixtures();

      const response = await request(app).get('/api/analytics/products').set('Authorization', `Bearer ${fixtures.moderator.token}`);

      expectApiSuccess(response, 200);
      const topProducts = response.body.data.topProducts as Array<{ revenue?: number; quantitySold: number }>;
      expect(topProducts.every((product) => product.revenue === undefined)).toBe(true);
      expect(topProducts).toHaveLength(3);
      expect(topProducts[0]!.quantitySold).toBe(3);
      expect(response.body.data.totalInventoryValue).toBeUndefined();
    });

    it('paginates the top-products list', async () => {
      const fixtures = await seedAnalyticsFixtures();

      const response = await request(app)
        .get('/api/analytics/products')
        .set('Authorization', `Bearer ${fixtures.owner.token}`)
        .query({ limit: '2', page: '1' });

      expectApiSuccess(response, 200);
      expect(response.body.data.topProducts.length).toBeLessThanOrEqual(2);
      expect(response.body.data.pagination.limit).toBe(2);
      expect(response.body.data.pagination.total).toBe(3);
    });

    it('returns 404-free empty products list when no orders exist yet for otherwise-valid products', async () => {
      const owner = await createOwner();
      await createTestProduct({ withInventory: true, quantity: 5, reorderLevel: 10 });

      const response = await request(app).get('/api/analytics/products').set('Authorization', `Bearer ${owner.token}`);

      expectApiSuccess(response, 200);
      expect(response.body.data.topProducts).toEqual([]);
      expect(response.body.data.lowStockCount).toBe(1);
    });
  });

  // ================================================================
  // GET /api/analytics/customers
  // ================================================================
  describe('GET /api/analytics/customers', () => {
    it('computes totals and repeat-customer count, verified against the database', async () => {
      const fixtures = await seedAnalyticsFixtures();
      // customerA has 2 orders (delivered + pending) -> repeat customer. customerB has 1 order -> not repeat.
      await createTestOrder({ customerId: fixtures.customerB.user.id, status: OrderStatus.PENDING });

      const response = await request(app).get('/api/analytics/customers').set('Authorization', `Bearer ${fixtures.owner.token}`);

      expectApiSuccess(response, 200);
      expect(response.body.data.totalCustomers).toBe(2);
      expect(response.body.data.activeCustomers).toBe(2);
      expect(response.body.data.repeatCustomers).toBe(2);

      const dbCustomerCount = await prisma.user.count({ where: { role: 'CUSTOMER' } });
      expect(response.body.data.totalCustomers).toBe(dbCustomerCount);
    });

    it('ranks top customers by total PAID spend, for OWNER only', async () => {
      const fixtures = await seedAnalyticsFixtures();

      const response = await request(app).get('/api/analytics/customers').set('Authorization', `Bearer ${fixtures.owner.token}`);

      expectApiSuccess(response, 200);
      const topCustomers = response.body.data.topCustomers as Array<{ customerId: string; totalSpent: number }>;

      // customerA: paid 200 (orderDelivered). customerB: paid 90 (orderProcessing).
      expect(topCustomers).toHaveLength(2);
      expect(topCustomers[0]!.customerId).toBe(fixtures.customerA.user.id);
      expect(topCustomers[0]!.totalSpent).toBe(200);
      expect(topCustomers[1]!.customerId).toBe(fixtures.customerB.user.id);
      expect(topCustomers[1]!.totalSpent).toBe(90);
    });

    it('omits topCustomers for MODERATOR but keeps operational counts', async () => {
      const fixtures = await seedAnalyticsFixtures();

      const response = await request(app).get('/api/analytics/customers').set('Authorization', `Bearer ${fixtures.moderator.token}`);

      expectApiSuccess(response, 200);
      expect(response.body.data.topCustomers).toBeUndefined();
      expect(response.body.data.pagination).toBeUndefined();
      expect(response.body.data.totalCustomers).toBe(2);
    });

    it('filters new customers by signup date range, verified against the database', async () => {
      const owner = await createOwner();
      const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const oldCustomer = await prisma.user.create({
        data: {
          firstName: 'Old',
          lastName: 'Customer',
          email: `old-customer-${Date.now()}@panelscan.test`,
          password: 'hashed',
          role: 'CUSTOMER',
          createdAt: oldDate,
        },
      });
      const recentCustomer = await createCustomer();

      const dateFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const response = await request(app).get('/api/analytics/customers').set('Authorization', `Bearer ${owner.token}`).query({ dateFrom });

      expectApiSuccess(response, 200);
      expect(response.body.data.newCustomers).toBe(1);
      expect(response.body.data.totalCustomers).toBe(2);

      const dbOldCustomer = await prisma.user.findUnique({ where: { id: oldCustomer.id } });
      expect(dbOldCustomer?.createdAt.getTime()).toBe(oldDate.getTime());
      expect(recentCustomer.user.id).not.toBe(oldCustomer.id);
    });
  });

  // ================================================================
  // GET /api/analytics/projects
  // ================================================================
  describe('GET /api/analytics/projects', () => {
    it('computes status breakdown, unassigned count, and moderator workload, verified against the database', async () => {
      const fixtures = await seedAnalyticsFixtures();

      const response = await request(app).get('/api/analytics/projects').set('Authorization', `Bearer ${fixtures.owner.token}`);

      expectApiSuccess(response, 200);
      const data = response.body.data;

      expect(data.totalProjects).toBe(2);
      expect(data.unassignedProjects).toBe(1);

      const projectStatusMap = Object.fromEntries(
        (data.projectsByStatus as Array<{ status: string; count: number }>).map((row) => [row.status, row.count]),
      );
      expect(projectStatusMap[ProjectStatus.IN_PROGRESS]).toBe(1);
      expect(projectStatusMap[ProjectStatus.PENDING]).toBe(1);

      const workload = data.moderatorWorkload as Array<{ moderatorId: string; activeProjectCount: number }>;
      expect(workload).toHaveLength(1);
      expect(workload[0]!.moderatorId).toBe(fixtures.moderator.user.id);
      expect(workload[0]!.activeProjectCount).toBe(1);

      expect(data.totalBudget).toBe(15000);
      expect(data.averageBudget).toBe(7500);

      const dbProjectCount = await prisma.project.count();
      expect(data.totalProjects).toBe(dbProjectCount);
    });

    it('computes average completion duration from COMPLETED projects only', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const startDate = new Date('2027-01-01T00:00:00.000Z');
      const endDate = new Date('2027-01-11T00:00:00.000Z'); // 10 days
      await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id, status: ProjectStatus.COMPLETED, startDate, endDate });
      await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id, status: ProjectStatus.PENDING });

      const response = await request(app).get('/api/analytics/projects').set('Authorization', `Bearer ${owner.token}`);

      expectApiSuccess(response, 200);
      expect(response.body.data.averageDurationDays).toBe(10);
    });

    it('omits budget fields for MODERATOR but keeps status breakdown and workload', async () => {
      const fixtures = await seedAnalyticsFixtures();

      const response = await request(app).get('/api/analytics/projects').set('Authorization', `Bearer ${fixtures.moderator.token}`);

      expectApiSuccess(response, 200);
      expect(response.body.data.totalBudget).toBeUndefined();
      expect(response.body.data.averageBudget).toBeUndefined();
      expect(response.body.data.totalProjects).toBe(2);
      expect(response.body.data.moderatorWorkload).toHaveLength(1);
    });

    it('filters projects by creation date range, verified against the database', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();

      const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
      const oldProject = await prisma.project.create({
        data: { customerId: customer.user.id, ownerId: owner.user.id, name: 'Old Project', status: ProjectStatus.PENDING, createdAt: oldDate },
      });
      const recentProject = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id });

      const dateFrom = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const response = await request(app).get('/api/analytics/projects').set('Authorization', `Bearer ${owner.token}`).query({ dateFrom });

      expectApiSuccess(response, 200);
      expect(response.body.data.totalProjects).toBe(1);

      const dbOldProject = await prisma.project.findUnique({ where: { id: oldProject.id } });
      expect(dbOldProject).not.toBeNull();
      expect(recentProject.id).not.toBe(oldProject.id);
    });

    it('paginates the moderator workload list', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const moderatorA = await createModerator();
      const moderatorB = await createModerator();
      await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id, moderatorId: moderatorA.user.id, status: ProjectStatus.IN_PROGRESS });
      await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id, moderatorId: moderatorB.user.id, status: ProjectStatus.IN_PROGRESS });

      const response = await request(app)
        .get('/api/analytics/projects')
        .set('Authorization', `Bearer ${owner.token}`)
        .query({ limit: '1', page: '1' });

      expectApiSuccess(response, 200);
      expect(response.body.data.moderatorWorkload.length).toBeLessThanOrEqual(1);
      expect(response.body.data.pagination.total).toBe(2);
    });
  });

  // ================================================================
  // VALIDATION
  // ================================================================
  describe('Validation', () => {
    it('rejects an invalid dateFrom format with 400', async () => {
      const owner = await createOwner();

      const response = await request(app).get('/api/analytics/sales').set('Authorization', `Bearer ${owner.token}`).query({ dateFrom: 'not-a-date' });

      expectApiError(response, 400, 'Validation failed.');
    });

    it('rejects an invalid page value with 400', async () => {
      const owner = await createOwner();

      const response = await request(app).get('/api/analytics/products').set('Authorization', `Bearer ${owner.token}`).query({ page: 'abc' });

      expectApiError(response, 400, 'Validation failed.');
    });
  });
});
