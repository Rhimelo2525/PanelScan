import { createHmac } from 'node:crypto';

import { DeliveryApprovalStatus, OrderStatus, PaymentStatus } from '@prisma/client';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '../../src/config/database';
import { lalamoveProvider } from '../../src/modules/delivery/providers/lalamove.provider';
import { authHeader, createCustomer, createModerator, createTestOrder, createTestPayment } from '../helpers/factories';
import app from '../helpers/testApp';

/**
 * The shipping fee is part of the order total and paid in the same PayMongo
 * payment as the products (see payment.test.ts / order-delivery-workflow.test.ts).
 * Booking Lalamove creates no separate shipping-fee charge, and there is no
 * shipping-fee payment endpoint. The PayMongo webhook tests at the bottom
 * cover only the legacy handler that settles separate shipping-fee sessions
 * opened under an earlier flow.
 */

vi.mock('../../src/modules/delivery/providers/lalamove.provider', () => ({
  lalamoveProvider: { placeDeliveryOrder: vi.fn(), getQuotation: vi.fn() },
}));
const mockProvider = lalamoveProvider as unknown as { placeDeliveryOrder: ReturnType<typeof vi.fn>; getQuotation: ReturnType<typeof vi.fn> };

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

beforeEach(() => {
  mockProvider.placeDeliveryOrder.mockReset();
  mockProvider.getQuotation.mockReset();
});

describe('Shipping fee is part of the order payment', () => {
  describe('No separate shipping-fee payment', () => {
    /** A paid order (products + quoted shipping) with the moderator's vehicle and a live quotation - ready to book. */
    async function readyToBook(customerId: string, moderatorId: string) {
      const { order, delivery } = await bookedDelivery(customerId, moderatorId, { lalamoveOrderId: null, shippingFee: null, deliveryStatus: 'READY_TO_BOOK' });
      await prisma.order.update({ where: { id: order.id }, data: { shippingFee: 180, totalAmount: Number(order.subtotal) + 180 } });
      await createTestPayment({ orderId: order.id, status: PaymentStatus.PAID, amount: Number(order.subtotal) + 180 });
      const quotation = {
        quotationId: 'quo_fee_1',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        amount: 180,
        currency: 'PHP',
        serviceType: 'VAN',
        stops: [{ stopId: 'stop_pickup' }, { stopId: 'stop_dropoff' }],
      };
      await prisma.delivery.update({ where: { id: delivery.id }, data: { quotedAt: new Date(), providerMetadata: { pendingQuotation: quotation } } });
      return { order, delivery };
    }

    it('booking records no shipping-fee charge, calls no PayMongo, and never asks the customer to pay the rider', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order, delivery } = await readyToBook(customer.user.id, moderator.user.id);
      mockProvider.placeDeliveryOrder.mockResolvedValue({ orderId: `llm_fee_${Date.now()}`, status: 'ASSIGNING_DRIVER', shareLink: null, priceBreakdown: { total: 180, currency: 'PHP' }, driverId: null });
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      const response = await request(app).post(`/api/delivery/orders/${order.id}/book`).set(authHeader(moderator.token));
      vi.unstubAllGlobals();

      expectApiSuccess(response, 200);
      expect(response.body.data.delivery.deliveryPayment).toBeNull();
      expect(await prisma.deliveryPayment.findUnique({ where: { deliveryId: delivery.id } })).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled(); // no PayMongo session
      const messages = (await prisma.notification.findMany({ where: { userId: customer.user.id } })).map((notification) => notification.message).join(' ');
      expect(messages).not.toMatch(/rider|cash on delivery/i);
    });

    it('leaves a shipping fee already PAID under an old separate payment as it was', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order, delivery } = await readyToBook(customer.user.id, moderator.user.id);
      await prisma.deliveryPayment.create({ data: { deliveryId: delivery.id, status: PaymentStatus.PAID, method: 'PayMongo', amount: 180, transactionRef: 'cs_legacy_paid', paidAt: new Date() } });
      mockProvider.placeDeliveryOrder.mockResolvedValue({ orderId: `llm_fee_legacy_${Date.now()}`, status: 'ASSIGNING_DRIVER', shareLink: null, priceBreakdown: { total: 180, currency: 'PHP' }, driverId: null });

      expectApiSuccess(await request(app).post(`/api/delivery/orders/${order.id}/book`).set(authHeader(moderator.token)), 200);

      const feePayment = await prisma.deliveryPayment.findUniqueOrThrow({ where: { deliveryId: delivery.id } });
      expect(feePayment.status).toBe(PaymentStatus.PAID);
      expect(feePayment.method).toBe('PayMongo');
    });

    it('has no shipping-fee payment endpoints (online or cash)', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const { order } = await bookedDelivery(customer.user.id, moderator.user.id);

      expect((await request(app).post(`/api/delivery/orders/${order.id}/fee/gcash`).set(authHeader(customer.token))).status).toBe(404);
      expect((await request(app).post(`/api/delivery/orders/${order.id}/fee/cash`).set(authHeader(customer.token))).status).toBe(404);
    });
  });

  // ---------------------------------------------------------------- webhook routing

  describe('POST /api/payments/webhook - legacy delivery-fee sessions (routed via the "delivery:" reference_number prefix)', () => {
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
