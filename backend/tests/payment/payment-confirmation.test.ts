import { createHmac } from 'node:crypto';

import { OrderStatus, PaymentStatus } from '@prisma/client';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '../../src/config/database';
import { createCustomer, createTestOrder, createTestPayment, createTestProduct } from '../helpers/factories';
import app from '../helpers/testApp';

/**
 * How an order gets marked paid with PayMongo Checkout:
 *  - the `checkout_session.payment.paid` webhook, which names our Checkout
 *    Session (cs_...) and carries the order id as reference_number;
 *  - or, while the payment page waits, reading that same session straight
 *    from PayMongo's API (for a webhook that is late, missed or can't reach
 *    the server).
 * A real `payment.paid` event describes the PayMongo payment (pay_...) and
 * carries no order reference, so on its own it can't be matched.
 */

const WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET ?? 'whsec_fake_test_secret_for_testing_only';

const sign = (rawBody: string): string => {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac('sha256', WEBHOOK_SECRET).update(`${timestamp}.${rawBody}`).digest('hex');
  return `t=${timestamp},te=${signature}`;
};
const postWebhook = (rawBody: string) =>
  request(app).post('/api/payments/webhook').set('Content-Type', 'application/json').set('Paymongo-Signature', sign(rawBody)).send(rawBody);

/** A Checkout Session as PayMongo returns it (API) or embeds it (webhook). */
const checkoutSession = (id: string, orderId: string, { paid = true, amount = 99400, livemode = false } = {}) => ({
  id,
  type: 'checkout_session',
  attributes: {
    checkout_url: `https://checkout.paymongo.com/${id}`,
    status: 'active',
    livemode,
    reference_number: orderId,
    payments: paid ? [{ id: 'pay_test_real_shape', type: 'payment', attributes: { status: 'paid', amount, source: { type: 'gcash' } } }] : [],
  },
});

const stubPaymongoSession = (session: unknown, ok = true) => {
  const fetchMock = vi.fn().mockResolvedValue({ ok, status: ok ? 200 : 404, json: async () => ({ data: session }) });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

/** A customer's PENDING order (total 800 + 194 shipping) with a PENDING payment on Checkout Session `sessionId`. */
const setupPendingPayment = async (sessionId: string) => {
  const customer = await createCustomer();
  const product = await createTestProduct({ price: 200 });
  const order = await createTestOrder({
    customerId: customer.user.id,
    status: OrderStatus.PENDING,
    items: [{ productId: product.id, quantity: 4, unitPrice: 200 }],
    shippingQuote: 194,
  });
  const payment = await createTestPayment({ orderId: order.id, amount: 994, status: PaymentStatus.PENDING, transactionRef: sessionId });
  return { customer, order, payment };
};

const getPayment = (paymentId: string, token: string) => request(app).get(`/api/payments/${paymentId}`).set('Authorization', `Bearer ${token}`);
const successNotifications = (userId: string) => prisma.notification.count({ where: { userId, title: 'Payment successful' } });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Payment confirmation - checkout_session.payment.paid webhook', () => {
  it('marks the payment PAID and the order PROCESSING, keeping the session id', async () => {
    const { order, payment } = await setupPendingPayment('cs_test_webhook_1');
    const rawBody = JSON.stringify({
      data: { id: 'evt_test_1', type: 'event', attributes: { type: 'checkout_session.payment.paid', livemode: false, data: checkoutSession('cs_test_webhook_1', order.id) } },
    });

    const response = await postWebhook(rawBody);

    expect(response.status).toBe(200);
    const dbPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(dbPayment.status).toBe(PaymentStatus.PAID);
    expect(dbPayment.paidAt).not.toBeNull();
    expect(Number(dbPayment.amount)).toBe(994);
    expect(dbPayment.transactionRef).toBe('cs_test_webhook_1');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(OrderStatus.PROCESSING);
  });

  it('ignores a live-mode event while running on a test key', async () => {
    const { order, payment } = await setupPendingPayment('cs_test_webhook_live');
    const rawBody = JSON.stringify({
      data: { id: 'evt_test_2', type: 'event', attributes: { type: 'checkout_session.payment.paid', livemode: true, data: checkoutSession('cs_test_webhook_live', order.id, { livemode: true }) } },
    });
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect((await postWebhook(rawBody)).status).toBe(200);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe(PaymentStatus.PENDING);
  });

  it('a real-shaped payment.paid event (pay_ id, no order reference) is acknowledged and changes nothing', async () => {
    const { payment } = await setupPendingPayment('cs_test_webhook_plain');
    const rawBody = JSON.stringify({
      data: { id: 'evt_test_3', type: 'event', attributes: { type: 'payment.paid', livemode: false, data: { id: 'pay_unrelated', type: 'payment', attributes: { amount: 99400, external_reference_number: null } } } },
    });

    expect((await postWebhook(rawBody)).status).toBe(200);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe(PaymentStatus.PENDING);
  });
});

describe('Payment confirmation - reading the session from PayMongo while the page waits', () => {
  it('marks a paid session PAID when the payment is read, even with no webhook', async () => {
    const { customer, order, payment } = await setupPendingPayment('cs_test_poll_paid');
    const fetchMock = stubPaymongoSession(checkoutSession('cs_test_poll_paid', order.id));

    const response = await getPayment(payment.id, customer.token);

    expect(response.status).toBe(200);
    expect(response.body.data.payment.status).toBe(PaymentStatus.PAID);
    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/\/checkout_sessions\/cs_test_poll_paid$/);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(OrderStatus.PROCESSING);
    expect(await successNotifications(customer.user.id)).toBe(1);
  });

  it('leaves it PENDING while the session has no paid payment', async () => {
    const { customer, order, payment } = await setupPendingPayment('cs_test_poll_unpaid');
    stubPaymongoSession(checkoutSession('cs_test_poll_unpaid', order.id, { paid: false }));

    const response = await getPayment(payment.id, customer.token);

    expect(response.body.data.payment.status).toBe(PaymentStatus.PENDING);
  });

  it("never trusts a session that belongs to another order", async () => {
    const { customer, payment } = await setupPendingPayment('cs_test_poll_other');
    stubPaymongoSession(checkoutSession('cs_test_poll_other', '00000000-0000-4000-8000-000000000000'));

    expect((await getPayment(payment.id, customer.token)).body.data.payment.status).toBe(PaymentStatus.PENDING);
  });

  it('never accepts a live session while running on a test key', async () => {
    const { customer, order, payment } = await setupPendingPayment('cs_test_poll_live');
    stubPaymongoSession(checkoutSession('cs_test_poll_live', order.id, { livemode: true }));

    expect((await getPayment(payment.id, customer.token)).body.data.payment.status).toBe(PaymentStatus.PENDING);
  });

  it('a PayMongo error or outage just keeps it PENDING (the page keeps waiting)', async () => {
    const { customer, payment } = await setupPendingPayment('cs_test_poll_down');
    stubPaymongoSession(null, false);
    expect((await getPayment(payment.id, customer.token)).body.data.payment.status).toBe(PaymentStatus.PENDING);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));
    const response = await getPayment(payment.id, customer.token);
    expect(response.status).toBe(200);
    expect(response.body.data.payment.status).toBe(PaymentStatus.PENDING);
  });

  it('does not ask PayMongo about a payment that is already settled', async () => {
    const { customer, payment } = await setupPendingPayment('cs_test_poll_settled');
    await prisma.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.PAID, paidAt: new Date() } });
    const fetchMock = stubPaymongoSession(null, false);

    await getPayment(payment.id, customer.token);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('webhook and page arriving together mark it paid and notify only once', async () => {
    const { customer, order, payment } = await setupPendingPayment('cs_test_race');
    stubPaymongoSession(checkoutSession('cs_test_race', order.id));
    const rawBody = JSON.stringify({
      data: { id: 'evt_test_race', type: 'event', attributes: { type: 'checkout_session.payment.paid', livemode: false, data: checkoutSession('cs_test_race', order.id) } },
    });

    await Promise.all([postWebhook(rawBody), getPayment(payment.id, customer.token), getPayment(payment.id, customer.token)]);

    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe(PaymentStatus.PAID);
    expect(await successNotifications(customer.user.id)).toBe(1);
  });
});
