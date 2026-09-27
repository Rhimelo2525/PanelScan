import { createHmac } from 'node:crypto';

import { DeliveryApprovalStatus, OrderStatus, PaymentStatus } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '../../src/config/database';
import { lalamoveProvider } from '../../src/modules/delivery/providers/lalamove.provider';
import { authHeader, createCustomer, createModerator, createTestOrder } from '../helpers/factories';
import app from '../helpers/testApp';

/**
 * Covers paying the SHIPPING fee (GCash via PayMongo, or cash on delivery)
 * as its own charge, separate from the product Payment. In the moderator-
 * driven flow the fee only exists once the moderator has booked Lalamove
 * (see delivery-approval.test.ts) - it is the total Lalamove returned for
 * that booking, and paying the product never marks it paid.
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

const SHIPPING_FEE = 250;

/** Order + a delivery the moderator has already booked with Lalamove, carrying the fee Lalamove returned. */
async function bookedDelivery(customerId: string, moderatorId: string, overrides: { lalamoveOrderId?: string | null; shippingFee?: number | null; deliveryStatus?: string } = {}) {
  const order = await createTestOrder({ customerId, status: OrderStatus.PROCESSING });
  await prisma.order.update({ where: { id: order.id }, data: { deliveryLocation: DROPOFF_LOCATION } });
  const delivery = await prisma.delivery.create({
    data: {
      orderId: order.id,
      address: order.shippingAddress,
      approvalStatus: DeliveryApprovalStatus.APPROVED,
      approvedAt: new Date(),
      approvedById: moderatorId,
      vehicleType: 'VAN',
      deliveryStatus: overrides.deliveryStatus ?? 'ASSIGNING_DRIVER',
      lalamoveOrderId: overrides.lalamoveOrderId === undefined ? `llm_fee_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` : overrides.lalamoveOrderId,
      shippingFee: overrides.shippingFee === undefined ? SHIPPING_FEE : overrides.shippingFee,
      bookedAt: new Date(),
      bookedById: moderatorId,
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
    it('opens a PayMongo checkout for exactly the booked Lalamove fee, never the product price', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order, delivery } = await bookedDelivery(customer.user.id, moderator.user.id);
      mockPaymongoCheckoutSuccess('cs_fee_creation_check');

      const response = await request(app).post(`/api/delivery/orders/${order.id}/fee/gcash`).set(authHeader(customer.token));

      expectApiSuccess(response, 200);
      expect(response.body.data.checkoutUrl).toBe('https://checkout.paymongo.com/cs_fee_creation_check');

      const feePayment = await prisma.deliveryPayment.findUnique({ where: { deliveryId: delivery.id } });
      expect(feePayment?.method).toBe('PayMongo');
      expect(feePayment?.status).toBe(PaymentStatus.PENDING);
      expect(Number(feePayment?.amount)).toBe(SHIPPING_FEE); // the shipping fee, not order.totalAmount
      expect(feePayment?.transactionRef).toBe('cs_fee_creation_check');

      // The reference_number PayMongo was called with carries the "delivery:" prefix, not the bare order id.
      const fetchMock = global.fetch as unknown as ReturnType<typeof vi.fn>;
      const requestBody = JSON.parse(fetchMock.mock.calls[0]![1].body);
      expect(requestBody.data.attributes.reference_number).toBe(`delivery:${delivery.id}`);
      expect(requestBody.data.attributes.line_items[0].amount).toBe(SHIPPING_FEE * 100);
      expect(requestBody.data.attributes.payment_method_types).toEqual(['gcash']);

      // The product Payment table is completely untouched by this call.
      expect(await prisma.payment.findUnique({ where: { orderId: order.id } })).toBeNull();
    });

    it('rejects before the moderator has booked the delivery (no fee exists yet)', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order } = await bookedDelivery(customer.user.id, moderator.user.id, { lalamoveOrderId: null, shippingFee: null, deliveryStatus: 'VEHICLE_SELECTED' });

      const response = await request(app).post(`/api/delivery/orders/${order.id}/fee/gcash`).set(authHeader(customer.token));

      expectApiError(response, 400, /once PanelScan staff have booked/i);
    });

    it('rejects a fee that is already paid', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order, delivery } = await bookedDelivery(customer.user.id, moderator.user.id);
      await prisma.deliveryPayment.create({ data: { deliveryId: delivery.id, status: PaymentStatus.PAID, method: 'PayMongo', amount: SHIPPING_FEE, transactionRef: 'cs_already_paid', paidAt: new Date() } });

      const response = await request(app).post(`/api/delivery/orders/${order.id}/fee/gcash`).set(authHeader(customer.token));

      expectApiError(response, 409, /already been paid/i);
    });

    it("rejects a different customer's order with 403", async () => {
      const owner = await createCustomer();
      const stranger = await createCustomer();
      const moderator = await createModerator();
      const { order } = await bookedDelivery(owner.user.id, moderator.user.id);

      expectApiError(await request(app).post(`/api/delivery/orders/${order.id}/fee/gcash`).set(authHeader(stranger.token)), 403);
    });

    it('is CUSTOMER-only: staff cannot start a fee payment', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order } = await bookedDelivery(customer.user.id, moderator.user.id);

      expect((await request(app).post(`/api/delivery/orders/${order.id}/fee/gcash`).set(authHeader(moderator.token))).status).toBe(403);
      expect((await request(app).post(`/api/delivery/orders/${order.id}/fee/cash`).set(authHeader(moderator.token))).status).toBe(403);
    });

    it('requires authentication', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order } = await bookedDelivery(customer.user.id, moderator.user.id);

      expect((await request(app).post(`/api/delivery/orders/${order.id}/fee/gcash`)).status).toBe(401);
    });
  });

  // ---------------------------------------------------------------- Cash on Delivery

  describe('POST /api/delivery/orders/:orderId/fee/cash', () => {
    it('records cash on delivery for the booked fee, with no PayMongo call, leaving it unpaid', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order, delivery } = await bookedDelivery(customer.user.id, moderator.user.id);
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      const response = await request(app).post(`/api/delivery/orders/${order.id}/fee/cash`).set(authHeader(customer.token));

      expectApiSuccess(response, 200);
      expect(response.body.data.amount).toBe(SHIPPING_FEE);
      expect(fetchSpy).not.toHaveBeenCalled();

      const feePayment = await prisma.deliveryPayment.findUnique({ where: { deliveryId: delivery.id } });
      expect(feePayment?.method).toBe('Cash');
      expect(feePayment?.status).toBe(PaymentStatus.PENDING);
      expect(Number(feePayment?.amount)).toBe(SHIPPING_FEE);
    });
  });

  // ---------------------------------------------------------------- webhook routing

  describe('POST /api/payments/webhook - delivery-fee events (routed via the "delivery:" reference_number prefix)', () => {
    it('marks the DeliveryPayment PAID, notifies the customer, and never touches the product Payment table', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order, delivery } = await bookedDelivery(customer.user.id, moderator.user.id);
      await prisma.deliveryPayment.create({ data: { deliveryId: delivery.id, status: PaymentStatus.PENDING, method: 'PayMongo', amount: SHIPPING_FEE, transactionRef: 'cs_webhook_test' } });

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

    it('settles only the fee - the existing Lalamove booking is left as it was', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { delivery } = await bookedDelivery(customer.user.id, moderator.user.id);
      await prisma.deliveryPayment.create({ data: { deliveryId: delivery.id, status: PaymentStatus.PENDING, method: 'PayMongo', amount: SHIPPING_FEE, transactionRef: 'cs_no_rebook' } });

      const rawBody = buildDeliveryFeeWebhookPayload('payment.paid', delivery.id);
      await postPaymentWebhook(rawBody, signWebhookPayload(rawBody, WEBHOOK_SECRET));

      expect(mockProvider.placeDeliveryOrder).not.toHaveBeenCalled();
      const stored = await prisma.delivery.findUniqueOrThrow({ where: { id: delivery.id } });
      expect(stored.lalamoveOrderId).toBe(delivery.lalamoveOrderId);
      expect(Number(stored.shippingFee)).toBe(SHIPPING_FEE);
    });

    it('downgrades a PENDING delivery fee to FAILED on payment.failed', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { delivery } = await bookedDelivery(customer.user.id, moderator.user.id);
      await prisma.deliveryPayment.create({ data: { deliveryId: delivery.id, status: PaymentStatus.PENDING, method: 'PayMongo', amount: SHIPPING_FEE, transactionRef: 'cs_will_fail' } });

      const rawBody = buildDeliveryFeeWebhookPayload('payment.failed', delivery.id, 'pay_fee_failed_1');
      const response = await postPaymentWebhook(rawBody, signWebhookPayload(rawBody, WEBHOOK_SECRET));

      expectApiSuccess(response, 200);
      const feePayment = await prisma.deliveryPayment.findUnique({ where: { deliveryId: delivery.id } });
      expect(feePayment?.status).toBe(PaymentStatus.FAILED);
    });

    it('is idempotent - redelivering the same payment.paid event twice only updates once', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { delivery } = await bookedDelivery(customer.user.id, moderator.user.id);
      await prisma.deliveryPayment.create({ data: { deliveryId: delivery.id, status: PaymentStatus.PENDING, method: 'PayMongo', amount: SHIPPING_FEE, transactionRef: 'cs_idempotent' } });

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
