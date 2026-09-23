import { DeliveryApprovalStatus, OrderStatus } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '../../src/config/database';
import { lalamoveProvider } from '../../src/modules/delivery/providers/lalamove.provider';
import { AppError } from '../../src/utils/AppError';
import { authHeader, createCustomer, createModerator, createOwner, createTestOrder } from '../helpers/factories';
import app from '../helpers/testApp';

// Hoisted by vitest above the imports above, so the static `lalamoveProvider`
// import above already resolves to this mocked shape - no dynamic import needed.
vi.mock('../../src/modules/delivery/providers/lalamove.provider', () => ({
  lalamoveProvider: {
    getAvailableServices: vi.fn(),
    getQuotation: vi.fn(),
    placeDeliveryOrder: vi.fn(),
    getOrder: vi.fn(),
    getDriverDetails: vi.fn(),
    cancelOrder: vi.fn(),
  },
}));

const mockProvider = lalamoveProvider as unknown as {
  getAvailableServices: ReturnType<typeof vi.fn>;
  getQuotation: ReturnType<typeof vi.fn>;
  placeDeliveryOrder: ReturnType<typeof vi.fn>;
  getOrder: ReturnType<typeof vi.fn>;
  getDriverDetails: ReturnType<typeof vi.fn>;
  cancelOrder: ReturnType<typeof vi.fn>;
};

const DROPOFF_LOCATION = {
  addressLine1: '45 Customer St',
  regionCode: '030000000',
  regionName: 'Region III',
  provinceCode: '031400000',
  provinceName: 'Bulacan',
  cityMunicipalityCode: '030905000',
  cityMunicipalityName: 'City of San Jose del Monte',
  barangayCode: '030905001',
  barangayName: 'Tungkong Mangga',
  postalCode: '3023',
  formattedAddress: '45 Customer St, Tungkong Mangga, City of San Jose del Monte, Bulacan 3023, Philippines',
  recipientName: 'Maria Santos',
  recipientPhone: '+639171112222',
  latitude: 14.8123,
  longitude: 121.0456,
  geocodingStatus: 'completed',
};

const QUOTATION_RESULT = {
  quotationId: 'quo_test_1',
  quotedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  amount: 189,
  currency: 'PHP',
  serviceType: 'MOTORCYCLE',
  distanceMeters: 5000,
  stops: [
    { stopId: 'stop_pickup', coordinates: { lat: '14.8136', lng: '121.0450' }, address: 'Warehouse' },
    { stopId: 'stop_dropoff', coordinates: { lat: '14.8123', lng: '121.0456' }, address: 'Customer' },
  ],
};

/** Order + delivery already through the approval gate, with real dropoff coordinates - the exact prerequisite requestQuotation/confirmBooking enforce. */
async function createApprovedDeliveryOrder(customerId: string, moderatorId: string) {
  const order = await createTestOrder({ customerId, status: OrderStatus.PROCESSING });
  await prisma.order.update({ where: { id: order.id }, data: { deliveryLocation: DROPOFF_LOCATION } });
  const delivery = await prisma.delivery.create({
    data: { orderId: order.id, address: order.shippingAddress, approvalStatus: DeliveryApprovalStatus.APPROVED, approvedAt: new Date(), approvedById: moderatorId, deliveryStatus: 'NOT_SCHEDULED' },
  });
  return { order, delivery };
}

const expectApiSuccess = (response: request.Response, status: number): void => {
  expect(response.status).toBe(status);
  expect(response.body.success).toBe(true);
};
const expectApiError = (response: request.Response, status: number, messageMatch?: string | RegExp): void => {
  expect(response.status).toBe(status);
  expect(response.body.success).toBe(false);
  if (messageMatch) expect(response.body.message).toMatch(messageMatch);
};

/** Avoids a Prisma JSON-path DB filter (uncertain support on CockroachDB) - fetches failed logs and filters by deliveryId in JS instead. */
const failedLogsFor = async (deliveryId: string) => {
  const logs = await prisma.activityLog.findMany({ where: { action: { endsWith: '_FAILED' } } });
  return logs.filter((log) => (log.metadata as { deliveryId?: string } | null)?.deliveryId === deliveryId);
};

beforeEach(() => {
  mockProvider.getAvailableServices.mockReset();
  mockProvider.getQuotation.mockReset();
  mockProvider.placeDeliveryOrder.mockReset();
  mockProvider.getOrder.mockReset();
  mockProvider.getDriverDetails.mockReset();
  mockProvider.cancelOrder.mockReset();
});

describe('Live Lalamove integration', () => {
  // ---------------------------------------------------------------- vehicle types

  describe('GET /api/delivery/vehicle-types', () => {
    it('returns the live provider list when available', async () => {
      const customer = await createCustomer();
      mockProvider.getAvailableServices.mockResolvedValue([{ key: 'VAN', description: 'Van', maxWeightKg: 700, dimensionsMeters: null }]);

      const response = await request(app).get('/api/delivery/vehicle-types').set(authHeader(customer.token));

      expectApiSuccess(response, 200);
      expect(response.body.data.services).toEqual([{ key: 'VAN', description: 'Van', maxWeightKg: 700, dimensionsMeters: null }]);
    });

    it('falls back to a static list (never errors the request) if the provider call fails', async () => {
      const customer = await createCustomer();
      mockProvider.getAvailableServices.mockRejectedValue(new Error('network down'));

      const response = await request(app).get('/api/delivery/vehicle-types').set(authHeader(customer.token));

      expectApiSuccess(response, 200);
      expect(response.body.data.services.length).toBeGreaterThan(0);
    });

    it('requires authentication', async () => {
      const response = await request(app).get('/api/delivery/vehicle-types');
      expect(response.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------- quotation

  describe('POST /api/delivery/orders/:orderId/quotation', () => {
    it('returns a live quotation and stores it (with stop ids) for later booking', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order, delivery } = await createApprovedDeliveryOrder(customer.user.id, moderator.user.id);
      mockProvider.getQuotation.mockResolvedValue(QUOTATION_RESULT);

      const response = await request(app).post(`/api/delivery/orders/${order.id}/quotation`).set(authHeader(customer.token)).send({ serviceType: 'MOTORCYCLE' });

      expectApiSuccess(response, 200);
      expect(response.body.data.quotation).toMatchObject({ amount: 189, currency: 'PHP', serviceType: 'MOTORCYCLE', quotationId: 'quo_test_1' });

      const stored = await prisma.delivery.findUniqueOrThrow({ where: { id: delivery.id } });
      expect((stored.providerMetadata as any)?.pendingQuotation?.quotationId).toBe('quo_test_1');
      expect((stored.providerMetadata as any)?.pendingQuotation?.stops).toHaveLength(2);

      const logs = await prisma.activityLog.findMany({ where: { action: 'LALAMOVE_QUOTATION_REQUESTED' } });
      expect(logs.some((log) => log.userId === customer.user.id)).toBe(true);
    });

    it('rejects a serviceType that is missing', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order } = await createApprovedDeliveryOrder(customer.user.id, moderator.user.id);

      const response = await request(app).post(`/api/delivery/orders/${order.id}/quotation`).set(authHeader(customer.token)).send({});

      expect(response.status).toBe(400);
      expect(mockProvider.getQuotation).not.toHaveBeenCalled();
    });

    it('rejects when the delivery request has not been approved yet', async () => {
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.PROCESSING });
      await prisma.delivery.create({ data: { orderId: order.id, address: order.shippingAddress, approvalStatus: DeliveryApprovalStatus.PENDING_APPROVAL } });

      const response = await request(app).post(`/api/delivery/orders/${order.id}/quotation`).set(authHeader(customer.token)).send({ serviceType: 'MOTORCYCLE' });

      expectApiError(response, 400, /approved/i);
      expect(mockProvider.getQuotation).not.toHaveBeenCalled();
    });

    it('rejects when the order has no delivery coordinates yet, naming the reason clearly', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.PROCESSING });
      await prisma.delivery.create({ data: { orderId: order.id, address: order.shippingAddress, approvalStatus: DeliveryApprovalStatus.APPROVED, approvedById: moderator.user.id } });

      const response = await request(app).post(`/api/delivery/orders/${order.id}/quotation`).set(authHeader(customer.token)).send({ serviceType: 'MOTORCYCLE' });

      expectApiError(response, 400, /coordinates/i);
      expect(mockProvider.getQuotation).not.toHaveBeenCalled();
    });

    it("rejects a different customer's order with 403", async () => {
      const owner = await createCustomer();
      const stranger = await createCustomer();
      const moderator = await createModerator();
      const { order } = await createApprovedDeliveryOrder(owner.user.id, moderator.user.id);

      const response = await request(app).post(`/api/delivery/orders/${order.id}/quotation`).set(authHeader(stranger.token)).send({ serviceType: 'MOTORCYCLE' });

      expectApiError(response, 403);
    });

    it('lets staff request a quotation on the customer\'s behalf', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order } = await createApprovedDeliveryOrder(customer.user.id, moderator.user.id);
      mockProvider.getQuotation.mockResolvedValue(QUOTATION_RESULT);

      const response = await request(app).post(`/api/delivery/orders/${order.id}/quotation`).set(authHeader(moderator.token)).send({ serviceType: 'MOTORCYCLE' });

      expectApiSuccess(response, 200);
    });

    it('logs a failure and propagates the provider error when the provider call fails, without storing a quotation', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order, delivery } = await createApprovedDeliveryOrder(customer.user.id, moderator.user.id);
      mockProvider.getQuotation.mockRejectedValue(new AppError('Invalid service type.', 400));

      const response = await request(app).post(`/api/delivery/orders/${order.id}/quotation`).set(authHeader(customer.token)).send({ serviceType: 'BOGUS' });

      expect(response.status).toBe(400);
      const stored = await prisma.delivery.findUniqueOrThrow({ where: { id: delivery.id } });
      expect((stored.providerMetadata as any)?.pendingQuotation).toBeUndefined();
      const logs = await prisma.activityLog.findMany({ where: { action: 'LALAMOVE_QUOTATION_FAILED' } });
      expect(logs.length).toBeGreaterThan(0);
    });

    it('requires authentication', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order } = await createApprovedDeliveryOrder(customer.user.id, moderator.user.id);
      const response = await request(app).post(`/api/delivery/orders/${order.id}/quotation`).send({ serviceType: 'MOTORCYCLE' });
      expect(response.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------- booking

  describe('POST /api/delivery/orders/:orderId/book', () => {
    // Booking is gated on the delivery fee itself since the delivery-fee
    // payment feature was added (see delivery-fee-payment.test.ts for that
    // gate's own dedicated coverage) - Cash is the simplest way to satisfy
    // it here without pulling PayMongo into tests that are really about the
    // quotation/booking mechanics.
    async function withQuotation(customerId: string, moderatorId: string, quotationOverrides: Partial<typeof QUOTATION_RESULT> = {}) {
      const { order, delivery } = await createApprovedDeliveryOrder(customerId, moderatorId);
      const amount = quotationOverrides.amount ?? QUOTATION_RESULT.amount;
      await prisma.delivery.update({ where: { id: delivery.id }, data: { providerMetadata: { pendingQuotation: { ...QUOTATION_RESULT, ...quotationOverrides } } } });
      await prisma.deliveryPayment.create({ data: { deliveryId: delivery.id, status: 'PENDING', method: 'Cash', amount } });
      return { order, delivery };
    }

    it('books the stored quotation, persists the real Lalamove order id, and notifies the customer', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order, delivery } = await withQuotation(customer.user.id, moderator.user.id);
      mockProvider.placeDeliveryOrder.mockResolvedValue({ orderId: 'llm_order_1', status: 'ASSIGNING_DRIVER', shareLink: 'https://share.lalamove.com/abc', priceBreakdown: { total: 189, currency: 'PHP' }, driverId: null });

      const response = await request(app).post(`/api/delivery/orders/${order.id}/book`).set(authHeader(customer.token));

      expectApiSuccess(response, 200);
      expect(response.body.data.delivery.lalamoveOrderId).toBe('llm_order_1');
      expect(response.body.data.delivery.deliveryStatus).toBe('ASSIGNING_DRIVER');

      const [quotationIdArg, senderStopIdArg, recipientArg] = mockProvider.placeDeliveryOrder.mock.calls[0]!;
      expect(quotationIdArg).toBe('quo_test_1');
      expect(senderStopIdArg).toBe('stop_pickup');
      expect(recipientArg).toMatchObject({ stopId: 'stop_dropoff', name: 'Maria Santos', phone: '+639171112222' });

      const stored = await prisma.delivery.findUniqueOrThrow({ where: { id: delivery.id } });
      expect(stored.lalamoveOrderId).toBe('llm_order_1');
      expect((stored.providerMetadata as any)?.vehicleType).toBe('MOTORCYCLE');
      expect((stored.providerMetadata as any)?.trackingUrl).toBe('https://share.lalamove.com/abc');
      expect((stored.providerMetadata as any)?.pendingQuotation).toBeUndefined();

      const notifications = await prisma.notification.findMany({ where: { userId: customer.user.id, title: 'Delivery booked' } });
      expect(notifications).toHaveLength(1);
    });

    it('rejects booking without a stored quotation', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order, delivery } = await createApprovedDeliveryOrder(customer.user.id, moderator.user.id);
      // The delivery-fee gate is checked first - satisfy it (Cash) so this
      // test actually reaches the "no quotation on file" check it's testing.
      await prisma.deliveryPayment.create({ data: { deliveryId: delivery.id, status: 'PENDING', method: 'Cash', amount: 189 } });

      const response = await request(app).post(`/api/delivery/orders/${order.id}/book`).set(authHeader(customer.token));

      expectApiError(response, 400, /quotation/i);
      expect(mockProvider.placeDeliveryOrder).not.toHaveBeenCalled();
    });

    it('rejects booking an expired quotation without touching the provider', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order } = await withQuotation(customer.user.id, moderator.user.id, { expiresAt: new Date(Date.now() - 1000).toISOString() });

      const response = await request(app).post(`/api/delivery/orders/${order.id}/book`).set(authHeader(customer.token));

      expectApiError(response, 400, /expired/i);
      expect(mockProvider.placeDeliveryOrder).not.toHaveBeenCalled();
    });

    it('rejects booking the same order twice (already has a Lalamove order id)', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order, delivery } = await withQuotation(customer.user.id, moderator.user.id);
      await prisma.delivery.update({ where: { id: delivery.id }, data: { lalamoveOrderId: 'llm_already_booked' } });

      const response = await request(app).post(`/api/delivery/orders/${order.id}/book`).set(authHeader(customer.token));

      expectApiError(response, 409);
      expect(mockProvider.placeDeliveryOrder).not.toHaveBeenCalled();
    });

    it('logs a failure, changes nothing, and propagates the error when the provider rejects the booking', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order, delivery } = await withQuotation(customer.user.id, moderator.user.id);
      mockProvider.placeDeliveryOrder.mockRejectedValue(new AppError('Quotation has expired upstream.', 400));

      const response = await request(app).post(`/api/delivery/orders/${order.id}/book`).set(authHeader(customer.token));

      expect(response.status).toBe(400);
      const stored = await prisma.delivery.findUniqueOrThrow({ where: { id: delivery.id } });
      expect(stored.lalamoveOrderId).toBeNull();
      const logs = await prisma.activityLog.findMany({ where: { action: 'LALAMOVE_ORDER_PLACE_FAILED' } });
      expect(logs.length).toBeGreaterThan(0);
    });

    it("rejects a different customer's order with 403", async () => {
      const owner = await createCustomer();
      const stranger = await createCustomer();
      const moderator = await createModerator();
      const { order } = await withQuotation(owner.user.id, moderator.user.id);

      const response = await request(app).post(`/api/delivery/orders/${order.id}/book`).set(authHeader(stranger.token));

      expectApiError(response, 403);
    });
  });

  // ---------------------------------------------------------------- status refresh

  describe('POST /api/delivery/:id/refresh', () => {
    async function bookedDelivery(customerId: string, moderatorId: string) {
      const { order, delivery } = await createApprovedDeliveryOrder(customerId, moderatorId);
      const updated = await prisma.delivery.update({ where: { id: delivery.id }, data: { lalamoveOrderId: 'llm_booked_1', deliveryStatus: 'ASSIGNING_DRIVER' } });
      return { order, delivery: updated };
    }

    it('syncs live status and driver details, and notifies the customer when the status changed', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { delivery } = await bookedDelivery(customer.user.id, moderator.user.id);
      mockProvider.getOrder.mockResolvedValue({ orderId: 'llm_booked_1', status: 'ON_GOING', shareLink: null, priceBreakdown: null, driverId: 'driver_1' });
      mockProvider.getDriverDetails.mockResolvedValue({ driverId: 'driver_1', name: 'Pedro Santos', phone: '+639179999999', plateNumber: 'ABC123', photoUrl: null });

      const response = await request(app).post(`/api/delivery/${delivery.id}/refresh`).set(authHeader(customer.token));

      expectApiSuccess(response, 200);
      expect(response.body.data.delivery.deliveryStatus).toBe('ON_GOING');

      const stored = await prisma.delivery.findUniqueOrThrow({ where: { id: delivery.id } });
      expect((stored.providerMetadata as any)?.driverName).toBe('Pedro Santos');
      expect((stored.providerMetadata as any)?.driverPlateNumber).toBe('ABC123');

      const notifications = await prisma.notification.findMany({ where: { userId: customer.user.id, title: 'Delivery status updated' } });
      expect(notifications).toHaveLength(1);
    });

    it('does not notify again when the status has not changed', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { delivery } = await bookedDelivery(customer.user.id, moderator.user.id);
      mockProvider.getOrder.mockResolvedValue({ orderId: 'llm_booked_1', status: 'ASSIGNING_DRIVER', shareLink: null, priceBreakdown: null, driverId: null });

      await request(app).post(`/api/delivery/${delivery.id}/refresh`).set(authHeader(customer.token));

      const notifications = await prisma.notification.findMany({ where: { userId: customer.user.id, title: 'Delivery status updated' } });
      expect(notifications).toHaveLength(0);
    });

    it('sets deliveredAt automatically when the live status becomes COMPLETED', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { delivery } = await bookedDelivery(customer.user.id, moderator.user.id);
      mockProvider.getOrder.mockResolvedValue({ orderId: 'llm_booked_1', status: 'COMPLETED', shareLink: null, priceBreakdown: null, driverId: null });

      await request(app).post(`/api/delivery/${delivery.id}/refresh`).set(authHeader(customer.token));

      const stored = await prisma.delivery.findUniqueOrThrow({ where: { id: delivery.id } });
      expect(stored.deliveredAt).not.toBeNull();
    });

    it('rejects refreshing a delivery that has not been booked yet', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { delivery } = await createApprovedDeliveryOrder(customer.user.id, moderator.user.id);

      const response = await request(app).post(`/api/delivery/${delivery.id}/refresh`).set(authHeader(customer.token));

      expectApiError(response, 400, /not been booked/i);
    });

    it("hides another customer's delivery with a plain 404", async () => {
      const owner = await createCustomer();
      const stranger = await createCustomer();
      const moderator = await createModerator();
      const { delivery } = await bookedDelivery(owner.user.id, moderator.user.id);

      const response = await request(app).post(`/api/delivery/${delivery.id}/refresh`).set(authHeader(stranger.token));

      expect(response.status).toBe(404);
    });

    it('lets an OWNER (read-only elsewhere) refresh status - it is a read-only sync against Lalamove', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const owner = await createOwner();
      const { delivery } = await bookedDelivery(customer.user.id, moderator.user.id);
      mockProvider.getOrder.mockResolvedValue({ orderId: 'llm_booked_1', status: 'PICKED_UP', shareLink: null, priceBreakdown: null, driverId: null });

      const response = await request(app).post(`/api/delivery/${delivery.id}/refresh`).set(authHeader(owner.token));

      expectApiSuccess(response, 200);
    });

    it('logs a failure and propagates the error when the provider call fails', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { delivery } = await bookedDelivery(customer.user.id, moderator.user.id);
      mockProvider.getOrder.mockRejectedValue(new AppError('Provider unavailable.', 503));

      const response = await request(app).post(`/api/delivery/${delivery.id}/refresh`).set(authHeader(customer.token));

      expect(response.status).toBe(503);
      const logs = await failedLogsFor(delivery.id);
      expect(logs.some((log) => log.action === 'LALAMOVE_STATUS_REFRESH_FAILED')).toBe(true);
    });
  });

  // ---------------------------------------------------------------- cancel booking

  describe('POST /api/delivery/:id/cancel-booking', () => {
    async function bookedDelivery(customerId: string, moderatorId: string, deliveryStatus = 'ASSIGNING_DRIVER') {
      const { order, delivery } = await createApprovedDeliveryOrder(customerId, moderatorId);
      const updated = await prisma.delivery.update({ where: { id: delivery.id }, data: { lalamoveOrderId: 'llm_cancel_1', deliveryStatus } });
      return { order, delivery: updated };
    }

    it('cancels the real booking, updates status, and notifies the customer', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { delivery } = await bookedDelivery(customer.user.id, moderator.user.id);
      mockProvider.cancelOrder.mockResolvedValue({ success: true });

      const response = await request(app).post(`/api/delivery/${delivery.id}/cancel-booking`).set(authHeader(moderator.token));

      expectApiSuccess(response, 200);
      expect(response.body.data.delivery.deliveryStatus).toBe('CANCELED');
      expect(mockProvider.cancelOrder).toHaveBeenCalledWith('llm_cancel_1');

      const notifications = await prisma.notification.findMany({ where: { userId: customer.user.id, title: 'Delivery cancelled' } });
      expect(notifications).toHaveLength(1);
    });

    it('is MODERATOR-only: rejects CUSTOMER and OWNER', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const owner = await createOwner();
      const { delivery } = await bookedDelivery(customer.user.id, moderator.user.id);

      expect((await request(app).post(`/api/delivery/${delivery.id}/cancel-booking`).set(authHeader(customer.token))).status).toBe(403);
      expect((await request(app).post(`/api/delivery/${delivery.id}/cancel-booking`).set(authHeader(owner.token))).status).toBe(403);
      expect(mockProvider.cancelOrder).not.toHaveBeenCalled();
    });

    it('rejects cancelling a delivery that has not been booked yet', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { delivery } = await createApprovedDeliveryOrder(customer.user.id, moderator.user.id);

      const response = await request(app).post(`/api/delivery/${delivery.id}/cancel-booking`).set(authHeader(moderator.token));

      expectApiError(response, 400, /not been booked/i);
    });

    it('rejects cancelling an already-completed delivery', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { delivery } = await bookedDelivery(customer.user.id, moderator.user.id, 'COMPLETED');

      const response = await request(app).post(`/api/delivery/${delivery.id}/cancel-booking`).set(authHeader(moderator.token));

      expectApiError(response, 409);
      expect(mockProvider.cancelOrder).not.toHaveBeenCalled();
    });

    it("surfaces Lalamove's own rejection (e.g. already picked up), logs it, and leaves the delivery unchanged", async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { delivery } = await bookedDelivery(customer.user.id, moderator.user.id, 'PICKED_UP');
      mockProvider.cancelOrder.mockRejectedValue(new AppError('Order cannot be cancelled after pickup.', 400));

      const response = await request(app).post(`/api/delivery/${delivery.id}/cancel-booking`).set(authHeader(moderator.token));

      expectApiError(response, 400, /cannot be cancelled/i);
      const stored = await prisma.delivery.findUniqueOrThrow({ where: { id: delivery.id } });
      expect(stored.deliveryStatus).toBe('PICKED_UP');
      const logs = await failedLogsFor(delivery.id);
      expect(logs.some((log) => log.action === 'LALAMOVE_ORDER_CANCEL_FAILED')).toBe(true);
    });
  });

  // ---------------------------------------------------------------- manual coordinates bridge

  describe('PATCH /api/delivery/orders/:orderId/coordinates', () => {
    it('lets staff set dropoff coordinates manually, merged into the existing delivery location', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.PROCESSING });
      await prisma.order.update({ where: { id: order.id }, data: { deliveryLocation: { ...DROPOFF_LOCATION, latitude: null, longitude: null, geocodingStatus: 'pending' } } });

      const response = await request(app).patch(`/api/delivery/orders/${order.id}/coordinates`).set(authHeader(moderator.token)).send({ latitude: 14.82, longitude: 121.05 });

      expectApiSuccess(response, 200);
      const stored = await prisma.order.findUniqueOrThrow({ where: { id: order.id } });
      const location = stored.deliveryLocation as any;
      expect(location.latitude).toBe(14.82);
      expect(location.longitude).toBe(121.05);
      expect(location.geocodingProvider).toBe('manual');
      expect(location.addressLine1).toBe(DROPOFF_LOCATION.addressLine1); // rest of the address untouched
    });

    it('rejects a CUSTOMER (staff-only)', async () => {
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.PROCESSING });
      await prisma.order.update({ where: { id: order.id }, data: { deliveryLocation: DROPOFF_LOCATION } });

      const response = await request(app).patch(`/api/delivery/orders/${order.id}/coordinates`).set(authHeader(customer.token)).send({ latitude: 14.82, longitude: 121.05 });

      expect(response.status).toBe(403);
    });

    it('rejects coordinates outside the Philippines', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.PROCESSING });
      await prisma.order.update({ where: { id: order.id }, data: { deliveryLocation: DROPOFF_LOCATION } });

      const response = await request(app).patch(`/api/delivery/orders/${order.id}/coordinates`).set(authHeader(moderator.token)).send({ latitude: 40.7128, longitude: -74.006 }); // New York

      expect(response.status).toBe(400);
    });

    it('returns 400 when the order has no structured delivery location to attach coordinates to', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.PROCESSING });

      const response = await request(app).patch(`/api/delivery/orders/${order.id}/coordinates`).set(authHeader(moderator.token)).send({ latitude: 14.82, longitude: 121.05 });

      expect(response.status).toBe(400);
    });
  });

  // ---------------------------------------------------------------- admin: failed requests

  describe('GET /api/delivery/failed-requests', () => {
    it('lists failed provider calls for MODERATOR/OWNER and hides them from CUSTOMER', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const owner = await createOwner();
      const { order } = await createApprovedDeliveryOrder(customer.user.id, moderator.user.id);
      mockProvider.getQuotation.mockRejectedValue(new AppError('boom', 400));
      await request(app).post(`/api/delivery/orders/${order.id}/quotation`).set(authHeader(customer.token)).send({ serviceType: 'MOTORCYCLE' });

      const asModerator = await request(app).get('/api/delivery/failed-requests').set(authHeader(moderator.token));
      const asOwner = await request(app).get('/api/delivery/failed-requests').set(authHeader(owner.token));
      const asCustomer = await request(app).get('/api/delivery/failed-requests').set(authHeader(customer.token));

      expectApiSuccess(asModerator, 200);
      expect(asModerator.body.data.logs.some((log: { action: string }) => log.action === 'LALAMOVE_QUOTATION_FAILED')).toBe(true);
      expectApiSuccess(asOwner, 200);
      expect(asCustomer.status).toBe(403);
    });
  });

  // ---------------------------------------------------------------- webhook

  describe('POST /api/delivery/webhook/:token', () => {
    const WEBHOOK_TOKEN = process.env.LALAMOVE_WEBHOOK_TOKEN as string;

    it('rejects a request with the wrong token', async () => {
      const response = await request(app).post('/api/delivery/webhook/wrong-token').set('Content-Type', 'application/json').send(JSON.stringify({ eventType: 'ORDER_STATUS_CHANGED' }));
      expect(response.status).toBe(404);
    });

    it('rejects a malformed body even with the right token', async () => {
      const response = await request(app).post(`/api/delivery/webhook/${WEBHOOK_TOKEN}`).set('Content-Type', 'application/json').send('not json');
      expect(response.status).toBe(400);
    });

    it('updates status and driver info for a known order, and notifies the customer on a status change', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order, delivery } = await createApprovedDeliveryOrder(customer.user.id, moderator.user.id);
      await prisma.delivery.update({ where: { id: delivery.id }, data: { lalamoveOrderId: 'llm_webhook_1', deliveryStatus: 'ASSIGNING_DRIVER' } });

      const payload = JSON.stringify({
        eventType: 'ORDER_STATUS_CHANGED',
        data: { order: { orderId: 'llm_webhook_1', status: 'ON_GOING' }, driver: { driverId: 'd1', name: 'Ana Cruz', phone: '+639170001111' } },
      });

      const response = await request(app).post(`/api/delivery/webhook/${WEBHOOK_TOKEN}`).set('Content-Type', 'application/json').send(payload);

      expectApiSuccess(response, 200);
      const stored = await prisma.delivery.findUniqueOrThrow({ where: { id: delivery.id } });
      expect(stored.deliveryStatus).toBe('ON_GOING');
      expect((stored.providerMetadata as any)?.driverName).toBe('Ana Cruz');

      const notifications = await prisma.notification.findMany({ where: { userId: order.customerId, title: 'Delivery status updated' } });
      expect(notifications).toHaveLength(1);

      const logs = await prisma.activityLog.findMany({ where: { action: 'LALAMOVE_WEBHOOK_RECEIVED' } });
      expect(logs.some((log) => (log.metadata as any)?.lalamoveOrderId === 'llm_webhook_1')).toBe(true);
    });

    it('acknowledges (200) an event for an order it does not recognize, without erroring', async () => {
      const payload = JSON.stringify({ eventType: 'ORDER_STATUS_CHANGED', data: { order: { orderId: 'llm_unknown_order', status: 'ON_GOING' } } });

      const response = await request(app).post(`/api/delivery/webhook/${WEBHOOK_TOKEN}`).set('Content-Type', 'application/json').send(payload);

      expectApiSuccess(response, 200);
    });

    it('is idempotent: redelivering the same event re-applies the same state without erroring or double-notifying', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { delivery } = await createApprovedDeliveryOrder(customer.user.id, moderator.user.id);
      await prisma.delivery.update({ where: { id: delivery.id }, data: { lalamoveOrderId: 'llm_webhook_2', deliveryStatus: 'ASSIGNING_DRIVER' } });

      const payload = JSON.stringify({ eventType: 'ORDER_STATUS_CHANGED', data: { order: { orderId: 'llm_webhook_2', status: 'PICKED_UP' } } });

      await request(app).post(`/api/delivery/webhook/${WEBHOOK_TOKEN}`).set('Content-Type', 'application/json').send(payload);
      const second = await request(app).post(`/api/delivery/webhook/${WEBHOOK_TOKEN}`).set('Content-Type', 'application/json').send(payload);

      expectApiSuccess(second, 200);
      const notifications = await prisma.notification.findMany({ where: { userId: customer.user.id, title: 'Delivery status updated' } });
      expect(notifications).toHaveLength(1); // only the first delivery actually changed the status
    });
  });
});
