import { DeliveryApprovalStatus, OrderStatus, PaymentStatus } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '../../src/config/database';
import { lalamoveProvider } from '../../src/modules/delivery/providers/lalamove.provider';
import { AppError } from '../../src/utils/AppError';
import { authHeader, createCustomer, createModerator, createOwner, createTestOrder, createTestPayment } from '../helpers/factories';
import app from '../helpers/testApp';

/**
 * The moderator-driven delivery workflow, end to end:
 *   customer pays the product -> customer requests delivery -> moderator
 *   approves -> moderator selects the vehicle -> moderator books Lalamove ->
 *   customer sees the fee + tracking -> Lalamove reports progress.
 * Lalamove itself is mocked; everything else (routes, role checks, DB,
 * notifications) is real.
 */

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

const mockProvider = lalamoveProvider as unknown as Record<'getAvailableServices' | 'getQuotation' | 'placeDeliveryOrder' | 'getOrder' | 'getDriverDetails' | 'cancelOrder', ReturnType<typeof vi.fn>>;

const WEBHOOK_TOKEN = process.env.LALAMOVE_WEBHOOK_TOKEN as string;

const DROPOFF_LOCATION = {
  addressLine1: 'Kaypian Road',
  regionCode: '030000000',
  regionName: 'Region III',
  provinceCode: '031400000',
  provinceName: 'Bulacan',
  cityMunicipalityCode: '030905000',
  cityMunicipalityName: 'City of San Jose del Monte',
  barangayCode: '030905001',
  barangayName: 'Bulong Bayan',
  postalCode: '3023',
  formattedAddress: 'Kaypian Road, Bulong Bayan, City of San Jose del Monte, Bulacan 3023, Philippines',
  recipientName: 'Maria Santos',
  recipientPhone: '+639171112222',
  latitude: 14.8123,
  longitude: 121.0456,
  geocodingStatus: 'completed',
  geocodingProvider: 'customer-pin',
};

const VAN = { key: 'VAN', description: 'L300 / Cargo Van', maxWeightKg: 1000, dimensionsMeters: null };

const quotation = (overrides: Record<string, unknown> = {}) => ({
  quotationId: 'quo_flow_1',
  quotedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  amount: 245,
  currency: 'PHP',
  serviceType: 'VAN',
  distanceMeters: 5000,
  stops: [
    { stopId: 'stop_pickup', coordinates: { lat: '14.8136', lng: '121.0450' }, address: 'Warehouse' },
    { stopId: 'stop_dropoff', coordinates: { lat: '14.8123', lng: '121.0456' }, address: 'Customer' },
  ],
  ...overrides,
});

const expectApiSuccess = (response: request.Response, status: number, message?: string): void => {
  expect(response.status).toBe(status);
  expect(response.body.success).toBe(true);
  if (message) expect(response.body.message).toBe(message);
};

const expectApiError = (response: request.Response, status: number, messageMatch?: string | RegExp): void => {
  expect(response.status).toBe(status);
  expect(response.body.success).toBe(false);
  if (messageMatch) expect(response.body.message).toMatch(messageMatch);
};

/** An approved order with a map-pinned address and (by default) a PAID product payment - the state in which delivery can be requested. */
async function paidOrder(customerId: string, paymentStatus: PaymentStatus | null = PaymentStatus.PAID, orderOverrides: { moderatorApproved?: boolean; status?: OrderStatus } = {}) {
  const order = await createTestOrder({ customerId, status: orderOverrides.status ?? OrderStatus.PROCESSING, moderatorApproved: orderOverrides.moderatorApproved ?? true });
  await prisma.order.update({ where: { id: order.id }, data: { deliveryLocation: DROPOFF_LOCATION } });
  if (paymentStatus) await createTestPayment({ orderId: order.id, status: paymentStatus, amount: 100 });
  return order;
}

async function requestedDelivery(customer: { user: { id: string }; token: string }) {
  const order = await paidOrder(customer.user.id);
  const response = await request(app).post(`/api/delivery/orders/${order.id}/request`).set(authHeader(customer.token));
  expectApiSuccess(response, 200);
  return { order, deliveryId: response.body.data.delivery.id as string };
}

async function approvedDelivery(customer: { user: { id: string }; token: string }, moderator: { token: string }) {
  const result = await requestedDelivery(customer);
  expectApiSuccess(await request(app).patch(`/api/delivery/orders/${result.order.id}/approve`).set(authHeader(moderator.token)), 200);
  return result;
}

async function vehicleSelected(customer: { user: { id: string }; token: string }, moderator: { token: string }) {
  const result = await approvedDelivery(customer, moderator);
  mockProvider.getAvailableServices.mockResolvedValue([VAN]);
  mockProvider.getQuotation.mockResolvedValue(quotation());
  expectApiSuccess(await request(app).post(`/api/delivery/orders/${result.order.id}/vehicle`).set(authHeader(moderator.token)).send({ serviceType: 'VAN' }), 200);
  return result;
}

const notificationTitles = async (userId: string) => (await prisma.notification.findMany({ where: { userId } })).map((notification) => notification.title);

beforeEach(() => {
  for (const fn of Object.values(mockProvider)) fn.mockReset();
});

describe('Moderator-driven delivery workflow', () => {
  describe('TEST 1 - product payment gates the delivery request', () => {
    it.each([
      ['awaiting moderator approval', { moderatorApproved: false }, PaymentStatus.PAID],
      ['payment not started', {}, null],
      ['payment pending', {}, PaymentStatus.PENDING],
      ['payment failed', {}, PaymentStatus.FAILED],
    ] as const)('refuses the request while the order is %s', async (_label, orderOverrides, paymentStatus) => {
      const customer = await createCustomer();
      const order = await paidOrder(customer.user.id, paymentStatus, orderOverrides);

      const response = await request(app).post(`/api/delivery/orders/${order.id}/request`).set(authHeader(customer.token));

      expectApiError(response, 400, 'Delivery can be requested after your order has been approved and payment has been completed.');
      expect(await prisma.delivery.findUnique({ where: { orderId: order.id } })).toBeNull();
    });

    it('refuses a cancelled order', async () => {
      const customer = await createCustomer();
      const order = await paidOrder(customer.user.id, PaymentStatus.PAID, { status: OrderStatus.CANCELLED });

      const response = await request(app).post(`/api/delivery/orders/${order.id}/request`).set(authHeader(customer.token));

      expectApiError(response, 400, /cancelled/i);
    });

    it('the moderator order approval itself is unchanged', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.PENDING, moderatorApproved: false });

      const response = await request(app).patch(`/api/orders/${order.id}/approve`).set(authHeader(moderator.token));

      expectApiSuccess(response, 200, 'Order approved successfully.');
      expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).moderatorApproved).toBe(true);
    });
  });

  describe('TEST 2 - customer requests delivery', () => {
    it('creates a PENDING_APPROVAL request with no vehicle, fee or booking, and notifies customer, moderator and owner', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const owner = await createOwner();
      const order = await paidOrder(customer.user.id);

      const response = await request(app).post(`/api/delivery/orders/${order.id}/request`).set(authHeader(customer.token));

      expectApiSuccess(response, 200, 'Delivery request submitted successfully.');
      const delivery = response.body.data.delivery;
      expect(delivery.approvalStatus).toBe(DeliveryApprovalStatus.PENDING_APPROVAL);
      expect(delivery.requestedAt).toBeTruthy();
      expect(delivery.deliveryStatus).toBe('NOT_SCHEDULED');
      expect(delivery.vehicleType).toBeNull();
      expect(delivery.shippingFee).toBeNull();
      expect(delivery.lalamoveOrderId).toBeNull();
      // The request carries what the moderator needs: address + pin, customer contact, items, payment status.
      expect(delivery.order.deliveryLocation.latitude).toBe(DROPOFF_LOCATION.latitude);
      expect(delivery.order.customer.email).toBe(customer.user.email);
      expect(delivery.order.payment.status).toBe(PaymentStatus.PAID);
      expect(mockProvider.getQuotation).not.toHaveBeenCalled();
      expect(mockProvider.placeDeliveryOrder).not.toHaveBeenCalled();

      expect(await notificationTitles(customer.user.id)).toContain('Delivery request submitted');
      expect(await notificationTitles(moderator.user.id)).toContain('New delivery request received');
      expect(await notificationTitles(owner.user.id)).toContain('New delivery request received');

      expectApiError(await request(app).post(`/api/delivery/orders/${order.id}/request`).set(authHeader(customer.token)), 409, /already awaiting approval/i);
    });

    it("refuses another customer's order", async () => {
      const customer = await createCustomer();
      const stranger = await createCustomer();
      const order = await paidOrder(customer.user.id);

      expectApiError(await request(app).post(`/api/delivery/orders/${order.id}/request`).set(authHeader(stranger.token)), 403);
    });

    it('staff cannot request delivery on the customer\'s behalf', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const order = await paidOrder(customer.user.id);

      expect((await request(app).post(`/api/delivery/orders/${order.id}/request`).set(authHeader(moderator.token))).status).toBe(403);
    });

    it('shows the pending request in the sales report', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order } = await requestedDelivery(customer);

      const report = await request(app).get('/api/reports/sales').set(authHeader(moderator.token));

      const row = report.body.data.orders.find((o: { id: string }) => o.id === order.id);
      expect(row.deliveryApprovalStatus).toBe(DeliveryApprovalStatus.PENDING_APPROVAL);
      expect(row.deliveryRequestedAt).toBeTruthy();
    });
  });

  describe('TEST 3 - moderator approval', () => {
    it('lists the request in the moderator "requested" queue and approves it without booking anything', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const owner = await createOwner();
      const { order, deliveryId } = await requestedDelivery(customer);

      const queue = await request(app).get('/api/delivery?deliveryState=requested').set(authHeader(moderator.token));
      expect(queue.body.data.deliveries.some((d: { id: string }) => d.id === deliveryId)).toBe(true);

      const response = await request(app).patch(`/api/delivery/orders/${order.id}/approve`).set(authHeader(moderator.token));

      expectApiSuccess(response, 200, 'Delivery request approved successfully.');
      expect(response.body.data.delivery.approvalStatus).toBe(DeliveryApprovalStatus.APPROVED);
      expect(response.body.data.delivery.approvedById).toBe(moderator.user.id);
      expect(response.body.data.delivery.lalamoveOrderId).toBeNull();
      expect(mockProvider.placeDeliveryOrder).not.toHaveBeenCalled();

      expect(await notificationTitles(customer.user.id)).toContain('Delivery request approved');
      expect(await notificationTitles(owner.user.id)).toContain('Delivery request approved');

      const toBook = await request(app).get('/api/delivery?deliveryState=to_book').set(authHeader(moderator.token));
      expect(toBook.body.data.deliveries.some((d: { id: string }) => d.id === deliveryId)).toBe(true);
    });

    it('the customer and the owner cannot approve or decline', async () => {
      const customer = await createCustomer();
      const owner = await createOwner();
      const { order, deliveryId } = await requestedDelivery(customer);

      for (const token of [customer.token, owner.token]) {
        expect((await request(app).patch(`/api/delivery/orders/${order.id}/approve`).set(authHeader(token))).status).toBe(403);
        expect((await request(app).patch(`/api/delivery/orders/${order.id}/decline`).set(authHeader(token)).send({})).status).toBe(403);
      }
      expect((await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } })).approvalStatus).toBe(DeliveryApprovalStatus.PENDING_APPROVAL);
    });

    it('a declined request can be requested again', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order } = await requestedDelivery(customer);

      const decline = await request(app).patch(`/api/delivery/orders/${order.id}/decline`).set(authHeader(moderator.token)).send({ reason: 'Address unclear' });
      expectApiSuccess(decline, 200);
      expect(decline.body.data.delivery.declineReason).toBe('Address unclear');

      const again = await request(app).post(`/api/delivery/orders/${order.id}/request`).set(authHeader(customer.token));
      expectApiSuccess(again, 200);
      expect(again.body.data.delivery.approvalStatus).toBe(DeliveryApprovalStatus.PENDING_APPROVAL);
      expect(again.body.data.delivery.declineReason).toBeNull();
    });
  });

  describe('TEST 4 - vehicle selection (moderator only)', () => {
    it('saves the moderator-selected vehicle and an estimated fee from a live quotation', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order, deliveryId } = await approvedDelivery(customer, moderator);
      mockProvider.getAvailableServices.mockResolvedValue([VAN]);
      mockProvider.getQuotation.mockResolvedValue(quotation());

      const response = await request(app).post(`/api/delivery/orders/${order.id}/vehicle`).set(authHeader(moderator.token)).send({ serviceType: 'VAN' });

      expectApiSuccess(response, 200, 'Vehicle selected successfully.');
      expect(response.body.data.quotation).toMatchObject({ amount: 245, serviceType: 'VAN' });
      expect(mockProvider.getQuotation.mock.calls[0]![0].dropoff).toMatchObject({ latitude: DROPOFF_LOCATION.latitude, longitude: DROPOFF_LOCATION.longitude });
      const stored = await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
      expect(stored.vehicleType).toBe('VAN');
      expect(stored.deliveryStatus).toBe('VEHICLE_SELECTED');
      expect((stored.providerMetadata as { vehicleLabel?: string }).vehicleLabel).toBe('1000 kg Van');
      expect(stored.shippingFee).toBeNull(); // an estimate is not the fee - only a booking sets it
    });

    it('refuses a vehicle Lalamove does not offer', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order } = await approvedDelivery(customer, moderator);
      mockProvider.getAvailableServices.mockResolvedValue([VAN]);

      const response = await request(app).post(`/api/delivery/orders/${order.id}/vehicle`).set(authHeader(moderator.token)).send({ serviceType: 'SPACESHIP' });

      expectApiError(response, 400, /not offered/i);
      expect(mockProvider.getQuotation).not.toHaveBeenCalled();
    });

    it('refuses before the request is approved', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order } = await requestedDelivery(customer);

      expectApiError(await request(app).post(`/api/delivery/orders/${order.id}/vehicle`).set(authHeader(moderator.token)).send({ serviceType: 'VAN' }), 400, /approve/i);
    });

    it('the customer and the owner cannot select a vehicle or list vehicle types', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const owner = await createOwner();
      const { order } = await approvedDelivery(customer, moderator);

      for (const token of [customer.token, owner.token]) {
        expect((await request(app).post(`/api/delivery/orders/${order.id}/vehicle`).set(authHeader(token)).send({ serviceType: 'VAN' })).status).toBe(403);
        expect((await request(app).get('/api/delivery/vehicle-types').set(authHeader(token))).status).toBe(403);
      }
      expect(mockProvider.getQuotation).not.toHaveBeenCalled();
    });
  });

  describe('TEST 5/6/7 - Lalamove booking, shipping fee and tracking', () => {
    it('books with Lalamove, saves booking id + real fee + tracking link, and the customer sees them', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const owner = await createOwner();
      const { order, deliveryId } = await vehicleSelected(customer, moderator);
      mockProvider.placeDeliveryOrder.mockResolvedValue({ orderId: 'llm_flow_1', status: 'ASSIGNING_DRIVER', shareLink: 'https://share.lalamove.com/flow1', priceBreakdown: { total: 250, currency: 'PHP' }, driverId: null });

      const response = await request(app).post(`/api/delivery/orders/${order.id}/book`).set(authHeader(moderator.token));

      expectApiSuccess(response, 200, 'Delivery booked successfully.');
      const [quotationId, senderStopId, recipient, referenceId] = mockProvider.placeDeliveryOrder.mock.calls[0]!;
      expect(quotationId).toBe('quo_flow_1');
      expect(senderStopId).toBe('stop_pickup');
      expect(recipient).toMatchObject({ stopId: 'stop_dropoff', name: 'Maria Santos', phone: '+639171112222' });
      expect(referenceId).toBe(order.id);

      const stored = await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
      expect(stored.lalamoveOrderId).toBe('llm_flow_1');
      expect(Number(stored.shippingFee)).toBe(250); // Lalamove's booked total, not the 245 estimate
      expect(stored.trackingUrl).toBe('https://share.lalamove.com/flow1');
      expect(stored.bookedById).toBe(moderator.user.id);
      expect(stored.bookedAt).not.toBeNull();
      expect(stored.deliveryStatus).toBe('ASSIGNING_DRIVER');

      // Customer's Order Details reads the same delivery.
      const orderView = await request(app).get(`/api/orders/${order.id}`).set(authHeader(customer.token));
      const customerDelivery = orderView.body.data.order.delivery;
      expect(customerDelivery.vehicleType).toBe('VAN');
      expect(customerDelivery.shippingFee).toBe('250');
      expect(customerDelivery.trackingUrl).toBe('https://share.lalamove.com/flow1');
      expect(customerDelivery.deliveryPayment).toBeNull(); // the fee is outstanding, not paid

      // The product payment is untouched by the shipping fee.
      const productPayment = await prisma.payment.findUniqueOrThrow({ where: { orderId: order.id } });
      expect(productPayment.status).toBe(PaymentStatus.PAID);
      expect(Number(productPayment.amount)).toBe(100);

      const customerTitles = await notificationTitles(customer.user.id);
      expect(customerTitles).toEqual(expect.arrayContaining(['Delivery booked', 'Delivery fee available']));
      const feeNotice = await prisma.notification.findFirstOrThrow({ where: { userId: customer.user.id, title: 'Delivery fee available' } });
      expect(feeNotice.message).toContain('₱250.00');
      expect(await notificationTitles(owner.user.id)).toContain('Lalamove booking successful');

      expectApiError(await request(app).post(`/api/delivery/orders/${order.id}/book`).set(authHeader(moderator.token)), 409);
      expect(mockProvider.placeDeliveryOrder).toHaveBeenCalledTimes(1);
    });

    it('re-quotes the same vehicle when the stored quotation has expired', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order, deliveryId } = await vehicleSelected(customer, moderator);
      const stored = await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
      const metadata = stored.providerMetadata as Record<string, unknown>;
      await prisma.delivery.update({ where: { id: deliveryId }, data: { providerMetadata: { ...metadata, pendingQuotation: quotation({ expiresAt: new Date(Date.now() - 1000).toISOString() }) } } });
      mockProvider.getQuotation.mockReset().mockResolvedValue(quotation({ quotationId: 'quo_fresh' }));
      mockProvider.placeDeliveryOrder.mockResolvedValue({ orderId: 'llm_fresh', status: 'ASSIGNING_DRIVER', shareLink: null, priceBreakdown: { total: 260, currency: 'PHP' }, driverId: null });

      expectApiSuccess(await request(app).post(`/api/delivery/orders/${order.id}/book`).set(authHeader(moderator.token)), 200);

      expect(mockProvider.getQuotation.mock.calls[0]![0].serviceType).toBe('VAN');
      expect(mockProvider.placeDeliveryOrder.mock.calls[0]![0]).toBe('quo_fresh');
    });

    it('refuses to book before a vehicle is selected', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order } = await approvedDelivery(customer, moderator);

      expectApiError(await request(app).post(`/api/delivery/orders/${order.id}/book`).set(authHeader(moderator.token)), 400, /select a lalamove vehicle/i);
      expect(mockProvider.placeDeliveryOrder).not.toHaveBeenCalled();
    });

    it('the customer and the owner cannot book', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const owner = await createOwner();
      const { order } = await vehicleSelected(customer, moderator);

      for (const token of [customer.token, owner.token]) {
        expect((await request(app).post(`/api/delivery/orders/${order.id}/book`).set(authHeader(token))).status).toBe(403);
      }
      expect(mockProvider.placeDeliveryOrder).not.toHaveBeenCalled();
    });

    it('keeps the booking when Lalamove has no tracking link yet, and picks it up on refresh', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order, deliveryId } = await vehicleSelected(customer, moderator);
      mockProvider.placeDeliveryOrder.mockResolvedValue({ orderId: 'llm_notrack', status: 'ASSIGNING_DRIVER', shareLink: null, priceBreakdown: { total: 250, currency: 'PHP' }, driverId: null });

      expectApiSuccess(await request(app).post(`/api/delivery/orders/${order.id}/book`).set(authHeader(moderator.token)), 200);
      const booked = await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
      expect(booked.lalamoveOrderId).toBe('llm_notrack');
      expect(booked.trackingUrl).toBeNull();

      mockProvider.getOrder.mockResolvedValue({ orderId: 'llm_notrack', status: 'ASSIGNING_DRIVER', shareLink: 'https://share.lalamove.com/later', priceBreakdown: null, driverId: null });
      expectApiSuccess(await request(app).post(`/api/delivery/${deliveryId}/refresh`).set(authHeader(customer.token)), 200);
      expect((await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } })).trackingUrl).toBe('https://share.lalamove.com/later');
    });
  });

  describe('TEST 8 - owner is view-only', () => {
    it('sees customer, address, coordinates, vehicle, fee, booking and tracking, but cannot change anything', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const owner = await createOwner();
      const { order, deliveryId } = await vehicleSelected(customer, moderator);
      mockProvider.placeDeliveryOrder.mockResolvedValue({ orderId: 'llm_owner_view', status: 'ASSIGNING_DRIVER', shareLink: 'https://share.lalamove.com/owner', priceBreakdown: { total: 250, currency: 'PHP' }, driverId: null });
      await request(app).post(`/api/delivery/orders/${order.id}/book`).set(authHeader(moderator.token));

      const view = await request(app).get(`/api/delivery/${deliveryId}`).set(authHeader(owner.token));
      expectApiSuccess(view, 200);
      const delivery = view.body.data.delivery;
      expect(delivery.order.customer.firstName).toBe(customer.user.firstName);
      expect(delivery.order.deliveryLocation.formattedAddress).toBe(DROPOFF_LOCATION.formattedAddress);
      expect(delivery.order.deliveryLocation.latitude).toBe(DROPOFF_LOCATION.latitude);
      expect(delivery.vehicleType).toBe('VAN');
      expect(delivery.shippingFee).toBe('250');
      expect(delivery.lalamoveOrderId).toBe('llm_owner_view');
      expect(delivery.trackingUrl).toBe('https://share.lalamove.com/owner');

      expect((await request(app).post(`/api/delivery/${deliveryId}/cancel-booking`).set(authHeader(owner.token))).status).toBe(403);
      expect((await request(app).patch(`/api/delivery/${deliveryId}`).set(authHeader(owner.token)).send({ courierName: 'Other' })).status).toBe(403);
      expect((await request(app).patch(`/api/delivery/orders/${order.id}/coordinates`).set(authHeader(owner.token)).send({ latitude: 14.8, longitude: 121 })).status).toBe(403);
      expect(mockProvider.cancelOrder).not.toHaveBeenCalled();
    });
  });

  describe('TEST 9 - booking failure', () => {
    it('shows the moderator an error, never marks the delivery booked, and records the failure for the customer view', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order, deliveryId } = await vehicleSelected(customer, moderator);
      mockProvider.placeDeliveryOrder.mockRejectedValue(new AppError('Insufficient wallet balance.', 400));

      const response = await request(app).post(`/api/delivery/orders/${order.id}/book`).set(authHeader(moderator.token));

      expectApiError(response, 400, /Lalamove booking failed\. Please try again\..*Insufficient wallet balance/);
      const stored = await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
      expect(stored.lalamoveOrderId).toBeNull();
      expect(stored.shippingFee).toBeNull();
      expect(stored.trackingUrl).toBeNull();
      expect(stored.deliveryStatus).toBe('BOOKING_FAILED');
      expect(stored.bookingError).toBe('Insufficient wallet balance.');
      expect(stored.vehicleType).toBe('VAN'); // the moderator's choice survives for the retry
      expect((stored.providerMetadata as Record<string, unknown>).pendingQuotation).toBeUndefined();
      expect(await notificationTitles(moderator.user.id)).toContain('Lalamove booking failed');
      expect(await notificationTitles(customer.user.id)).not.toContain('Delivery booked');

      // Retry re-quotes and succeeds.
      mockProvider.getQuotation.mockResolvedValue(quotation({ quotationId: 'quo_retry' }));
      mockProvider.placeDeliveryOrder.mockReset().mockResolvedValue({ orderId: 'llm_retry', status: 'ASSIGNING_DRIVER', shareLink: null, priceBreakdown: { total: 250, currency: 'PHP' }, driverId: null });
      expectApiSuccess(await request(app).post(`/api/delivery/orders/${order.id}/book`).set(authHeader(moderator.token)), 200);
      const retried = await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
      expect(retried.lalamoveOrderId).toBe('llm_retry');
      expect(retried.bookingError).toBeNull();
    });

    it('refuses a second booking while one is already in flight', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order, deliveryId } = await vehicleSelected(customer, moderator);
      await prisma.delivery.update({ where: { id: deliveryId }, data: { deliveryStatus: 'BOOKING' } });

      expectApiError(await request(app).post(`/api/delivery/orders/${order.id}/book`).set(authHeader(moderator.token)), 409, /in progress/i);
      expect(mockProvider.placeDeliveryOrder).not.toHaveBeenCalled();
    });
  });

  describe('TEST 10 - Lalamove reports progress and completion', () => {
    it('in transit then delivered, with the matching customer notifications', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const owner = await createOwner();
      const { order, deliveryId } = await vehicleSelected(customer, moderator);
      mockProvider.placeDeliveryOrder.mockResolvedValue({ orderId: 'llm_progress', status: 'ASSIGNING_DRIVER', shareLink: 'https://share.lalamove.com/p', priceBreakdown: { total: 250, currency: 'PHP' }, driverId: null });
      await request(app).post(`/api/delivery/orders/${order.id}/book`).set(authHeader(moderator.token));

      const send = (status: string) =>
        request(app)
          .post(`/api/delivery/webhook/${WEBHOOK_TOKEN}`)
          .set('Content-Type', 'application/json')
          .send(JSON.stringify({ eventType: 'ORDER_STATUS_CHANGED', data: { order: { orderId: 'llm_progress', status } } }));

      expectApiSuccess(await send('PICKED_UP'), 200);
      expect(await notificationTitles(customer.user.id)).toContain('Delivery on the way');

      expectApiSuccess(await send('COMPLETED'), 200);
      const stored = await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
      expect(stored.deliveryStatus).toBe('COMPLETED');
      expect(stored.deliveredAt).not.toBeNull();
      expect(await notificationTitles(customer.user.id)).toContain('Order delivered');
      expect(await notificationTitles(owner.user.id)).toContain('Delivery status changed');

      const completed = await request(app).get('/api/delivery?deliveryState=completed').set(authHeader(owner.token));
      expect(completed.body.data.deliveries.some((d: { id: string }) => d.id === deliveryId)).toBe(true);
    });
  });

  describe('Backup database', () => {
    it('never fails a workflow step when the backup is unavailable - it logs BACKUP_SYNC_FAILED for the delivery instead', async () => {
      // BACKUP_DATABASE_URL is deliberately unset in .env.test.
      const customer = await createCustomer();
      const { deliveryId } = await requestedDelivery(customer);

      const logs = await prisma.activityLog.findMany({ where: { action: 'BACKUP_SYNC_FAILED' } });
      const matching = logs.filter((log) => (log.metadata as { id?: string } | null)?.id === deliveryId);
      expect(matching.length).toBeGreaterThanOrEqual(1);
      expect((matching[0]?.metadata as { model?: string }).model).toBe('delivery');
    });
  });
});
