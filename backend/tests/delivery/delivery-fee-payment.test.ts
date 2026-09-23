import { createHmac } from 'node:crypto';

import { DeliveryApprovalStatus, OrderStatus, PaymentStatus } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '../../src/config/database';
import { lalamoveProvider } from '../../src/modules/delivery/providers/lalamove.provider';
import { authHeader, createCustomer, createModerator, createTestOrder } from '../helpers/factories';
import app from '../helpers/testApp';

/**
 * Covers the delivery-fee payment flow added on top of the live Lalamove
 * quotation/booking flow (see lalamove-integration.test.ts for that half):
 * paying the DELIVERY fee itself (GCash via PayMongo, or Cash on Delivery)
 * as its own separate charge from the product Payment, and the hard
 * server-side gate on POST /book that refuses to place a real Lalamove
 * order until one of those has actually happened.
 */

vi.mock('../../src/modules/delivery/providers/lalamove.provider', () => ({
  lalamoveProvider: { placeDeliveryOrder: vi.fn() },
}));
const mockProvider = lalamoveProvider as unknown as { placeDeliveryOrder: ReturnType<typeof vi.fn> };

const WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET ?? 'whsec_fake_test_secret_for_testing_only';

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

const QUOTATION = {
  quotationId: 'quo_fee_test_1',
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

/** Order + APPROVED delivery + a still-valid stored quotation - the exact prerequisite both fee endpoints and the booking gate enforce. */
async function withQuotation(customerId: string, moderatorId: string, quotationOverrides: Partial<typeof QUOTATION> = {}) {
  const order = await createTestOrder({ customerId, status: OrderStatus.PROCESSING });
  await prisma.order.update({ where: { id: order.id }, data: { deliveryLocation: DROPOFF_LOCATION } });
  const delivery = await prisma.delivery.create({
    data: {
      orderId: order.id,
      address: order.shippingAddress,
      approvalStatus: DeliveryApprovalStatus.APPROVED,
      approvedAt: new Date(),
      approvedById: moderatorId,
      deliveryStatus: 'NOT_SCHEDULED',
      providerMetadata: { pendingQuotation: { ...QUOTATION, ...quotationOverrides } },
    },
  });
  return { order, delivery };
}

const mockPaymongoCheckoutSuccess = (checkoutSessionId = `cs_fee_test_${Date.now()}`): void => {
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

const buildDeliveryFeeWebhookPayload = (eventType: 'payment.paid' | 'payment.failed', deliveryId: string, paymongoPaymentId?: string): string =>
  JSON.stringify({
    data: {
      id: `evt_fee_test_${Date.now()}`,
      type: 'event',
      attributes: {
        type: eventType,
        livemode: false,
        data: {
          id: paymongoPaymentId ?? `pay_fee_test_${Date.now()}`,
          type: 'payment',
          attributes: { reference_number: `delivery:${deliveryId}` },
        },
      },
    },
  });

const signWebhookPayload = (rawBody: string, secret: string): string => {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return `t=${timestamp},li=${signature},te=${signature}`;
};

const postPaymentWebhook = (rawBody: string, signature: string) =>
  request(app).post('/api/payments/webhook').set('Content-Type', 'application/json').set('Paymongo-Signature', signature).send(rawBody);

const expectApiSuccess = (response: request.Response, status: number): void => {
  expect(response.status).toBe(status);
  expect(response.body.success).toBe(true);
};
const expectApiError = (response: request.Response, status: number, messageMatch?: string | RegExp): void => {
  expect(response.status).toBe(status);
  expect(response.body.success).toBe(false);
  if (messageMatch) expect(response.body.message).toMatch(messageMatch);
};

beforeEach(() => {
  mockProvider.placeDeliveryOrder.mockReset();
});

describe('Delivery-fee payment (separate from the product Payment)', () => {
  // ---------------------------------------------------------------- GCash checkout

  describe('POST /api/delivery/orders/:orderId/fee/gcash', () => {
    it('opens a PayMongo checkout for exactly the quotation amount, never the product price', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order, delivery } = await withQuotation(customer.user.id, moderator.user.id);
      mockPaymongoCheckoutSuccess('cs_fee_creation_check');

      const response = await request(app).post(`/api/delivery/orders/${order.id}/fee/gcash`).set(authHeader(customer.token));

      expectApiSuccess(response, 200);
      expect(response.body.data.checkoutUrl).toBe('https://checkout.paymongo.com/cs_fee_creation_check');

      const feePayment = await prisma.deliveryPayment.findUnique({ where: { deliveryId: delivery.id } });
      expect(feePayment).not.toBeNull();
      expect(feePayment?.method).toBe('PayMongo');
      expect(feePayment?.status).toBe(PaymentStatus.PENDING);
      expect(Number(feePayment?.amount)).toBe(QUOTATION.amount); // the delivery fee, not order.totalAmount
      expect(feePayment?.transactionRef).toBe('cs_fee_creation_check');

      // The reference_number PayMongo was called with carries the "delivery:" prefix, not the bare order id.
      const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
      const requestBody = JSON.parse(fetchMock.mock.calls[0]![1].body);
      expect(requestBody.data.attributes.reference_number).toBe(`delivery:${delivery.id}`);
      expect(requestBody.data.attributes.payment_method_types).toEqual(['gcash']);

      // The product Payment table is completely untouched by this call.
      const productPayment = await prisma.payment.findUnique({ where: { orderId: order.id } });
      expect(productPayment).toBeNull();
    });

    it('rejects when no quotation is on file yet', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.PROCESSING });
      await prisma.delivery.create({ data: { orderId: order.id, address: order.shippingAddress, approvalStatus: DeliveryApprovalStatus.APPROVED, approvedById: moderator.user.id } });

      const response = await request(app).post(`/api/delivery/orders/${order.id}/fee/gcash`).set(authHeader(customer.token));

      expectApiError(response, 400, /quotation/i);
    });

    it('rejects an expired quotation', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order } = await withQuotation(customer.user.id, moderator.user.id, { expiresAt: new Date(Date.now() - 1000).toISOString() });

      const response = await request(app).post(`/api/delivery/orders/${order.id}/fee/gcash`).set(authHeader(customer.token));

      expectApiError(response, 400, /expired/i);
    });

    it("rejects a different customer's order with 403", async () => {
      const owner = await createCustomer();
      const stranger = await createCustomer();
      const moderator = await createModerator();
      const { order } = await withQuotation(owner.user.id, moderator.user.id);

      const response = await request(app).post(`/api/delivery/orders/${order.id}/fee/gcash`).set(authHeader(stranger.token));

      expectApiError(response, 403);
    });

    it('requires authentication', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order } = await withQuotation(customer.user.id, moderator.user.id);

      const response = await request(app).post(`/api/delivery/orders/${order.id}/fee/gcash`);

      expect(response.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------- Cash on Delivery

  describe('POST /api/delivery/orders/:orderId/fee/cash', () => {
    it('records Cash on Delivery for the quotation amount, with no PayMongo call', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order, delivery } = await withQuotation(customer.user.id, moderator.user.id);
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      const response = await request(app).post(`/api/delivery/orders/${order.id}/fee/cash`).set(authHeader(customer.token));

      expectApiSuccess(response, 200);
      expect(response.body.data.amount).toBe(QUOTATION.amount);
      expect(fetchSpy).not.toHaveBeenCalled();

      const feePayment = await prisma.deliveryPayment.findUnique({ where: { deliveryId: delivery.id } });
      expect(feePayment?.method).toBe('Cash');
      expect(feePayment?.status).toBe(PaymentStatus.PENDING);
      expect(Number(feePayment?.amount)).toBe(QUOTATION.amount);
    });
  });

  // ---------------------------------------------------------------- booking gate

  describe('POST /api/delivery/orders/:orderId/book - delivery-fee gate', () => {
    it('rejects booking when no delivery-fee payment exists at all', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order } = await withQuotation(customer.user.id, moderator.user.id);

      const response = await request(app).post(`/api/delivery/orders/${order.id}/book`).set(authHeader(customer.token));

      expectApiError(response, 400, /delivery fee/i);
      expect(mockProvider.placeDeliveryOrder).not.toHaveBeenCalled();
    });

    it('rejects booking while the GCash delivery fee is still PENDING (not yet confirmed by PayMongo)', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order, delivery } = await withQuotation(customer.user.id, moderator.user.id);
      await prisma.deliveryPayment.create({ data: { deliveryId: delivery.id, status: PaymentStatus.PENDING, method: 'PayMongo', amount: QUOTATION.amount, transactionRef: 'cs_pending' } });

      const response = await request(app).post(`/api/delivery/orders/${order.id}/book`).set(authHeader(customer.token));

      expectApiError(response, 400, /not been confirmed/i);
      expect(mockProvider.placeDeliveryOrder).not.toHaveBeenCalled();
    });

    it('allows booking once the GCash delivery fee is PAID', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order, delivery } = await withQuotation(customer.user.id, moderator.user.id);
      await prisma.deliveryPayment.create({ data: { deliveryId: delivery.id, status: PaymentStatus.PAID, method: 'PayMongo', amount: QUOTATION.amount, transactionRef: 'cs_paid', paidAt: new Date() } });
      mockProvider.placeDeliveryOrder.mockResolvedValue({ orderId: 'llm_fee_paid_1', status: 'ASSIGNING_DRIVER', shareLink: null, priceBreakdown: { total: QUOTATION.amount, currency: 'PHP' }, driverId: null });

      const response = await request(app).post(`/api/delivery/orders/${order.id}/book`).set(authHeader(customer.token));

      expectApiSuccess(response, 200);
      expect(response.body.data.delivery.lalamoveOrderId).toBe('llm_fee_paid_1');
    });

    it('allows booking when Cash on Delivery was selected, even though its status is only PENDING', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order, delivery } = await withQuotation(customer.user.id, moderator.user.id);
      await prisma.deliveryPayment.create({ data: { deliveryId: delivery.id, status: PaymentStatus.PENDING, method: 'Cash', amount: QUOTATION.amount } });
      mockProvider.placeDeliveryOrder.mockResolvedValue({ orderId: 'llm_fee_cash_1', status: 'ASSIGNING_DRIVER', shareLink: null, priceBreakdown: { total: QUOTATION.amount, currency: 'PHP' }, driverId: null });

      const response = await request(app).post(`/api/delivery/orders/${order.id}/book`).set(authHeader(customer.token));

      expectApiSuccess(response, 200);
      expect(response.body.data.delivery.lalamoveOrderId).toBe('llm_fee_cash_1');
    });

    it('rejects booking when the paid fee amount no longer matches the current quotation (e.g. vehicle changed after paying)', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order, delivery } = await withQuotation(customer.user.id, moderator.user.id);
      // Paid for the ORIGINAL (cheaper) quotation amount...
      await prisma.deliveryPayment.create({ data: { deliveryId: delivery.id, status: PaymentStatus.PAID, method: 'PayMongo', amount: QUOTATION.amount, transactionRef: 'cs_stale_amount', paidAt: new Date() } });
      // ...then a pricier vehicle was re-quoted, overwriting pendingQuotation, without paying again.
      await prisma.delivery.update({ where: { id: delivery.id }, data: { providerMetadata: { pendingQuotation: { ...QUOTATION, amount: QUOTATION.amount + 300, serviceType: 'VAN' } } } });

      const response = await request(app).post(`/api/delivery/orders/${order.id}/book`).set(authHeader(customer.token));

      expectApiError(response, 400, /does not match/i);
      expect(mockProvider.placeDeliveryOrder).not.toHaveBeenCalled();
    });

    it('rejects booking when the GCash delivery fee FAILED', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order, delivery } = await withQuotation(customer.user.id, moderator.user.id);
      await prisma.deliveryPayment.create({ data: { deliveryId: delivery.id, status: PaymentStatus.FAILED, method: 'PayMongo', amount: QUOTATION.amount, transactionRef: 'cs_failed' } });

      const response = await request(app).post(`/api/delivery/orders/${order.id}/book`).set(authHeader(customer.token));

      expectApiError(response, 400, /not been confirmed/i);
      expect(mockProvider.placeDeliveryOrder).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------- webhook routing

  describe('POST /api/payments/webhook - delivery-fee events (routed via the "delivery:" reference_number prefix)', () => {
    it('marks the DeliveryPayment PAID, notifies the customer, and never touches the product Payment table', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order, delivery } = await withQuotation(customer.user.id, moderator.user.id);
      await prisma.deliveryPayment.create({ data: { deliveryId: delivery.id, status: PaymentStatus.PENDING, method: 'PayMongo', amount: QUOTATION.amount, transactionRef: 'cs_webhook_test' } });

      const rawBody = buildDeliveryFeeWebhookPayload('payment.paid', delivery.id, 'pay_fee_success_1');
      const response = await postPaymentWebhook(rawBody, signWebhookPayload(rawBody, WEBHOOK_SECRET));

      expectApiSuccess(response, 200);

      const feePayment = await prisma.deliveryPayment.findUnique({ where: { deliveryId: delivery.id } });
      expect(feePayment?.status).toBe(PaymentStatus.PAID);
      expect(feePayment?.paidAt).not.toBeNull();
      expect(feePayment?.transactionRef).toBe('pay_fee_success_1');

      // Order status/product Payment are completely unaffected by a delivery-fee event.
      const dbOrder = await prisma.order.findUnique({ where: { id: order.id } });
      expect(dbOrder?.status).toBe(OrderStatus.PROCESSING);
      const productPayment = await prisma.payment.findUnique({ where: { orderId: order.id } });
      expect(productPayment).toBeNull();

      const notifications = await prisma.notification.findMany({ where: { userId: customer.user.id, title: 'Delivery fee paid' } });
      expect(notifications).toHaveLength(1);
    });

    it('does NOT place the Lalamove booking itself - confirmBooking is still a separate, explicit call', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { delivery } = await withQuotation(customer.user.id, moderator.user.id);
      await prisma.deliveryPayment.create({ data: { deliveryId: delivery.id, status: PaymentStatus.PENDING, method: 'PayMongo', amount: QUOTATION.amount, transactionRef: 'cs_no_autobook' } });

      const rawBody = buildDeliveryFeeWebhookPayload('payment.paid', delivery.id);
      await postPaymentWebhook(rawBody, signWebhookPayload(rawBody, WEBHOOK_SECRET));

      expect(mockProvider.placeDeliveryOrder).not.toHaveBeenCalled();
      const stored = await prisma.delivery.findUniqueOrThrow({ where: { id: delivery.id } });
      expect(stored.lalamoveOrderId).toBeNull();
    });

    it('downgrades a PENDING delivery fee to FAILED on payment.failed', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { delivery } = await withQuotation(customer.user.id, moderator.user.id);
      await prisma.deliveryPayment.create({ data: { deliveryId: delivery.id, status: PaymentStatus.PENDING, method: 'PayMongo', amount: QUOTATION.amount, transactionRef: 'cs_will_fail' } });

      const rawBody = buildDeliveryFeeWebhookPayload('payment.failed', delivery.id, 'pay_fee_failed_1');
      const response = await postPaymentWebhook(rawBody, signWebhookPayload(rawBody, WEBHOOK_SECRET));

      expectApiSuccess(response, 200);
      const feePayment = await prisma.deliveryPayment.findUnique({ where: { deliveryId: delivery.id } });
      expect(feePayment?.status).toBe(PaymentStatus.FAILED);
    });

    it('is idempotent - redelivering the same payment.paid event twice only updates once', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { delivery } = await withQuotation(customer.user.id, moderator.user.id);
      await prisma.deliveryPayment.create({ data: { deliveryId: delivery.id, status: PaymentStatus.PENDING, method: 'PayMongo', amount: QUOTATION.amount, transactionRef: 'cs_idempotent' } });

      const rawBody = buildDeliveryFeeWebhookPayload('payment.paid', delivery.id, 'pay_fee_idempotent');
      const signature = signWebhookPayload(rawBody, WEBHOOK_SECRET);

      await postPaymentWebhook(rawBody, signature);
      const firstPaidAt = (await prisma.deliveryPayment.findUnique({ where: { deliveryId: delivery.id } }))?.paidAt;

      await postPaymentWebhook(rawBody, signature);
      const secondPaidAt = (await prisma.deliveryPayment.findUnique({ where: { deliveryId: delivery.id } }))?.paidAt;

      expect(firstPaidAt).not.toBeNull();
      expect(secondPaidAt?.getTime()).toBe(firstPaidAt?.getTime());

      const notifications = await prisma.notification.findMany({ where: { userId: customer.user.id, title: 'Delivery fee paid' } });
      expect(notifications).toHaveLength(1);
    });

    it('acknowledges (200) an event for a delivery id it does not recognize, without erroring', async () => {
      const rawBody = buildDeliveryFeeWebhookPayload('payment.paid', '00000000-0000-0000-0000-000000000000');
      const response = await postPaymentWebhook(rawBody, signWebhookPayload(rawBody, WEBHOOK_SECRET));

      expectApiSuccess(response, 200);
    });
  });
});
