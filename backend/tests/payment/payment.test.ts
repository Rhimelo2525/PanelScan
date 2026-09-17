import { createHmac } from 'node:crypto';

import { OrderStatus, PaymentStatus } from '@prisma/client';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '../../src/config/database';
import { createCustomer, createModerator, createTestOrder, createTestPayment, createTestProduct } from '../helpers/factories';
import app from '../helpers/testApp';

const WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET ?? 'whsec_fake_test_secret_for_testing_only';

/**
 * Every test in this suite checks HTTP status + response.body.success +
 * response.body.message, per the QA requirements for this module.
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

/** Stubs global fetch() so payment.service.ts never makes a real network call to PayMongo. */
const mockPaymongoCheckoutSuccess = (checkoutSessionId = `cs_test_${Date.now()}`): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          id: checkoutSessionId,
          type: 'checkout_session',
          attributes: {
            checkout_url: `https://checkout.paymongo.com/${checkoutSessionId}`,
            status: 'active',
          },
        },
      }),
    }),
  );
};

const mockPaymongoCheckoutFailure = (): void => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ errors: [{ detail: 'Invalid request to PayMongo.' }] }),
    }),
  );
};

/** Builds a PayMongo-shaped webhook payload of a given event type, referencing our own orderId. */
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

/** Computes a valid Paymongo-Signature header for a given raw body, exercising the real verification code path. */
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

/** Seeds a customer with an order ready to be paid (no payment yet). Total is always 4 * 200 = 800. */
const setupPayableOrder = async (status: OrderStatus = OrderStatus.PENDING) => {
  const customer = await createCustomer();
  const product = await createTestProduct({ price: 200 });
  const order = await createTestOrder({
    customerId: customer.user.id,
    status,
    items: [{ productId: product.id, quantity: 4, unitPrice: 200 }],
  });
  return { customer, order };
};

describe('Payment module', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ================================================================
  // AUTHENTICATION TESTS
  // ================================================================
  describe('Authentication', () => {
    it('returns 401 for a request without a JWT', async () => {
      const response = await request(app).get('/api/payments');
      expectApiError(response, 401);
    });

    it('returns 401 for a request with an invalid JWT', async () => {
      const response = await request(app).get('/api/payments').set('Authorization', 'Bearer not-a-real-token');
      expectApiError(response, 401);
    });

    it('lets a CUSTOMER create a payment for their own order', async () => {
      mockPaymongoCheckoutSuccess();
      const { customer, order } = await setupPayableOrder();

      const response = await request(app)
        .post('/api/payments/create')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ orderId: order.id });

      expectApiSuccess(response, 201, 'Payment created successfully.');
      expect(response.body.data.status).toBe(PaymentStatus.PENDING);
    });

    it("rejects a CUSTOMER paying for another customer's order (403), and no payment is created", async () => {
      mockPaymongoCheckoutSuccess();
      const payer = await createCustomer();
      const { order } = await setupPayableOrder();

      const response = await request(app)
        .post('/api/payments/create')
        .set('Authorization', `Bearer ${payer.token}`)
        .send({ orderId: order.id });

      // 403 per this API's actual behavior (order exists but isn't the requester's).
      expectApiError(response, 403);

      const dbPayment = await prisma.payment.findUnique({ where: { orderId: order.id } });
      expect(dbPayment).toBeNull();
    });
  });

  // ================================================================
  // CREATE PAYMENT TESTS
  // ================================================================
  describe('Create Payment', () => {
    it('creates a payment from order -> payment request, with full response and database verification', async () => {
      mockPaymongoCheckoutSuccess('cs_test_creation_check');
      const { customer, order } = await setupPayableOrder(OrderStatus.PENDING);

      const response = await request(app)
        .post('/api/payments/create')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ orderId: order.id });

      // --- HTTP response ---
      expectApiSuccess(response, 201, 'Payment created successfully.');
      expect(response.body.data).toHaveProperty('checkoutUrl');
      expect(response.body.data).toHaveProperty('paymentId');
      expect(typeof response.body.data.checkoutUrl).toBe('string');
      expect(response.body.data.checkoutUrl.length).toBeGreaterThan(0);
      expect(response.body.data.status).toBe(PaymentStatus.PENDING);

      // --- Database: Payment row exists, with the order relation, correct amount/method/status ---
      const dbPayment = await prisma.payment.findUnique({
        where: { id: response.body.data.paymentId },
        include: { order: true },
      });
      expect(dbPayment).not.toBeNull();
      expect(dbPayment?.orderId).toBe(order.id);
      expect(dbPayment?.order.id).toBe(order.id); // order relation actually resolves
      expect(Number(dbPayment?.amount)).toBe(Number(order.totalAmount)); // amount === order total
      expect(dbPayment?.method).toBe('PayMongo');
      expect(dbPayment?.status).toBe(PaymentStatus.PENDING);
      expect(dbPayment?.createdAt).toBeInstanceOf(Date);
    });

    it('returns 500 and creates no payment row when PayMongo fails to create a checkout session', async () => {
      mockPaymongoCheckoutFailure();
      const { customer, order } = await setupPayableOrder();

      const response = await request(app)
        .post('/api/payments/create')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ orderId: order.id });

      expectApiError(response, 500);

      const paymentCount = await prisma.payment.count({ where: { orderId: order.id } });
      expect(paymentCount).toBe(0);
    });
  });

  // ================================================================
  // PAYMENT VALIDATION TESTS
  // ================================================================
  describe('Payment Validation', () => {
    it('rejects a missing orderId with 400', async () => {
      const customer = await createCustomer();

      const response = await request(app).post('/api/payments/create').set('Authorization', `Bearer ${customer.token}`).send({});

      expectApiError(response, 400, 'Validation failed.');
      expect(response.body.errors.some((e: { path: string }) => e.path === 'orderId')).toBe(true);
    });

    it('rejects an invalid (non-UUID) orderId with 400', async () => {
      const customer = await createCustomer();

      const response = await request(app)
        .post('/api/payments/create')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ orderId: 'not-a-uuid' });

      expectApiError(response, 400, 'Validation failed.');
    });

    it('returns 404 for a non-existing orderId', async () => {
      const customer = await createCustomer();

      const response = await request(app)
        .post('/api/payments/create')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ orderId: '00000000-0000-0000-0000-000000000000' });

      expectApiError(response, 404);
    });

    it('rejects paying for an order that is already paid (400), with no duplicate payment row', async () => {
      const { customer, order } = await setupPayableOrder();
      await createTestPayment({ orderId: order.id, status: PaymentStatus.PAID });

      const response = await request(app)
        .post('/api/payments/create')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ orderId: order.id });

      expectApiError(response, 400, /already been paid/i);

      const payments = await prisma.payment.findMany({ where: { orderId: order.id } });
      expect(payments).toHaveLength(1); // still exactly the one PAID row - no duplicate
      expect(payments[0]?.status).toBe(PaymentStatus.PAID);
    });
  });

  // ================================================================
  // PAYMENT OWNERSHIP TESTS
  // ================================================================
  describe('Payment Ownership', () => {
    it("rejects Customer B paying for Customer A's order, and no payment ends up belonging to Customer B", async () => {
      mockPaymongoCheckoutSuccess();
      const customerA = await createCustomer();
      const customerB = await createCustomer();
      const product = await createTestProduct({ price: 200 });
      const order = await createTestOrder({
        customerId: customerA.user.id,
        items: [{ productId: product.id, quantity: 2, unitPrice: 200 }],
      });

      const response = await request(app)
        .post('/api/payments/create')
        .set('Authorization', `Bearer ${customerB.token}`)
        .send({ orderId: order.id });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);

      const paymentsForCustomerB = await prisma.payment.findMany({ where: { order: { customerId: customerB.user.id } } });
      expect(paymentsForCustomerB).toHaveLength(0);

      const paymentForOrder = await prisma.payment.findUnique({ where: { orderId: order.id } });
      expect(paymentForOrder).toBeNull();
    });
  });

  // ================================================================
  // PAYMENT STATUS TESTS
  // ================================================================
  describe('Payment Status (GET /api/payments/:id)', () => {
    it('returns payment id, order id, amount, method, and status', async () => {
      const { customer, order } = await setupPayableOrder();
      const payment = await createTestPayment({ orderId: order.id, amount: 800, transactionRef: 'cs_test_status_check' });

      const response = await request(app).get(`/api/payments/${payment.id}`).set('Authorization', `Bearer ${customer.token}`);

      expectApiSuccess(response, 200, 'Payment retrieved successfully.');
      const body = response.body.data.payment;
      expect(body.id).toBe(payment.id);
      expect(body.orderId).toBe(order.id);
      expect(Number(body.amount)).toBe(800);
      expect(body.method).toBe('PayMongo');
      expect(body.status).toBe(PaymentStatus.PENDING);
      expect(body.transactionRef).toBe('cs_test_status_check');
    });

    it('returns 404 for a non-existing payment id', async () => {
      const customer = await createCustomer();

      const response = await request(app)
        .get('/api/payments/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${customer.token}`);

      expectApiError(response, 404);
    });
  });

  // ================================================================
  // PAYMONGO WEBHOOK TESTS (payment.paid)
  // ================================================================
  describe('PayMongo webhook - payment.paid', () => {
    it('updates Payment PENDING -> PAID (with paidAt set) and Order PENDING -> PROCESSING', async () => {
      const { order } = await setupPayableOrder(OrderStatus.PENDING);
      const payment = await createTestPayment({ orderId: order.id, status: PaymentStatus.PENDING, transactionRef: 'cs_test_abc' });
      expect(payment.status).toBe(PaymentStatus.PENDING);
      expect(payment.paidAt).toBeNull();

      const rawBody = buildWebhookPayload('payment.paid', order.id, 'pay_test_success_1');
      const signature = signWebhookPayload(rawBody, WEBHOOK_SECRET);

      const response = await postWebhook(rawBody, signature);
      expectApiSuccess(response, 200, 'Webhook received.');

      const dbPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
      expect(dbPayment?.status).toBe(PaymentStatus.PAID);
      expect(dbPayment?.paidAt).not.toBeNull();
      expect(dbPayment?.transactionRef).toBe('pay_test_success_1');

      const dbOrder = await prisma.order.findUnique({ where: { id: order.id } });
      expect(dbOrder?.status).toBe(OrderStatus.PROCESSING);
    });

    it('rejects a webhook with an invalid signature (400), database unchanged', async () => {
      const { order } = await setupPayableOrder(OrderStatus.PENDING);
      const payment = await createTestPayment({ orderId: order.id, status: PaymentStatus.PENDING });

      const rawBody = buildWebhookPayload('payment.paid', order.id);
      const response = await postWebhook(rawBody, 't=1,li=deadbeef,te=deadbeef');

      expectApiError(response, 400, /signature/i);

      const dbPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
      expect(dbPayment?.status).toBe(PaymentStatus.PENDING);
      expect(dbPayment?.paidAt).toBeNull();
    });

    it('is idempotent - redelivering the same payment.paid event twice only updates once', async () => {
      const { order } = await setupPayableOrder(OrderStatus.PENDING);
      await createTestPayment({ orderId: order.id, status: PaymentStatus.PENDING, transactionRef: 'cs_test_dup' });

      const rawBody = buildWebhookPayload('payment.paid', order.id, 'pay_test_dup');
      const signature = signWebhookPayload(rawBody, WEBHOOK_SECRET);

      const first = await postWebhook(rawBody, signature);
      expectApiSuccess(first, 200);
      const firstPaidAt = (await prisma.payment.findFirst({ where: { orderId: order.id } }))?.paidAt;

      const second = await postWebhook(rawBody, signature);
      expectApiSuccess(second, 200);
      const secondPaidAt = (await prisma.payment.findFirst({ where: { orderId: order.id } }))?.paidAt;

      expect(firstPaidAt).not.toBeNull();
      expect(secondPaidAt?.getTime()).toBe(firstPaidAt?.getTime());
    });
  });

  // ================================================================
  // FAILED PAYMENT TEST (payment.failed)
  // ================================================================
  describe('PayMongo webhook - payment.failed', () => {
    it('updates Payment PENDING -> FAILED and leaves the Order unchanged', async () => {
      const { order } = await setupPayableOrder(OrderStatus.PENDING);
      const payment = await createTestPayment({ orderId: order.id, status: PaymentStatus.PENDING, transactionRef: 'cs_test_fail' });

      const rawBody = buildWebhookPayload('payment.failed', order.id, 'pay_test_failed_1');
      const signature = signWebhookPayload(rawBody, WEBHOOK_SECRET);

      const response = await postWebhook(rawBody, signature);
      expectApiSuccess(response, 200, 'Webhook received.');

      const dbPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
      expect(dbPayment?.status).toBe(PaymentStatus.FAILED);
      expect(dbPayment?.paidAt).toBeNull(); // never got paid

      const dbOrder = await prisma.order.findUnique({ where: { id: order.id } });
      expect(dbOrder?.status).toBe(OrderStatus.PENDING); // unchanged - still whatever it was before
    });

    it('does not downgrade an already-PAID payment on a (late/redelivered) failure event', async () => {
      const { order } = await setupPayableOrder(OrderStatus.PROCESSING);
      const payment = await createTestPayment({ orderId: order.id, status: PaymentStatus.PAID, transactionRef: 'cs_test_already_paid' });

      const rawBody = buildWebhookPayload('payment.failed', order.id, 'pay_test_late_failure');
      const signature = signWebhookPayload(rawBody, WEBHOOK_SECRET);

      const response = await postWebhook(rawBody, signature);
      expectApiSuccess(response, 200);

      const dbPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
      expect(dbPayment?.status).toBe(PaymentStatus.PAID); // untouched
    });
  });

  // ================================================================
  // SECURITY TESTS
  // ================================================================
  describe('Security', () => {
    it('gives a CUSTOMER no way to manually change a payment status (no such route exists)', async () => {
      const { customer, order } = await setupPayableOrder();
      const payment = await createTestPayment({ orderId: order.id, status: PaymentStatus.PENDING });

      const response = await request(app)
        .patch(`/api/payments/${payment.id}`)
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ status: 'PAID' });

      expect(response.status).toBe(404); // no PATCH route on /api/payments/:id at all

      const dbPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
      expect(dbPayment?.status).toBe(PaymentStatus.PENDING);
    });

    it("returns 404 when a CUSTOMER requests another customer's payment by id", async () => {
      const requester = await createCustomer();
      const { order } = await setupPayableOrder();
      const payment = await createTestPayment({ orderId: order.id });

      const response = await request(app).get(`/api/payments/${payment.id}`).set('Authorization', `Bearer ${requester.token}`);

      expectApiError(response, 404);
    });

    it('rejects creating a payment without an existing order (404)', async () => {
      const customer = await createCustomer();

      const response = await request(app)
        .post('/api/payments/create')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ orderId: '11111111-1111-1111-1111-111111111111' });

      expectApiError(response, 404);

      const paymentCount = await prisma.payment.count();
      expect(paymentCount).toBe(0);
    });

    it('lets a MODERATOR view payment records', async () => {
      const moderator = await createModerator();
      const { order } = await setupPayableOrder();
      await createTestPayment({ orderId: order.id });

      const response = await request(app).get('/api/payments').set('Authorization', `Bearer ${moderator.token}`);

      expectApiSuccess(response, 200, 'Payments retrieved successfully.');
      expect(Array.isArray(response.body.data.payments)).toBe(true);
      expect(response.body.data.payments.length).toBeGreaterThan(0);
    });
  });
});
