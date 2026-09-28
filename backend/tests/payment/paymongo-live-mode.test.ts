import { createHmac } from 'node:crypto';

import { PaymentStatus } from '@prisma/client';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { env } from '../../src/config/env';
import { prisma } from '../../src/config/database';
import { paymongoConfigSummary, paymongoMode, paymongoProductionWarnings, verifyPaymongoSignature } from '../../src/modules/payment/paymongo.client';
import { createCustomer, createTestOrder, createTestPayment } from '../helpers/factories';
import app from '../helpers/testApp';

/**
 * LIVE PayMongo safeguards: the mode comes from the secret key's prefix
 * (never exposing the key), live deployments only trust live-signed,
 * live-mode webhook events, and production refuses unverifiable webhooks.
 */

const original = { key: env.PAYMONGO_SECRET_KEY, secret: env.PAYMONGO_WEBHOOK_SECRET, nodeEnv: env.NODE_ENV, success: env.PAYMENT_SUCCESS_URL, cancel: env.PAYMENT_CANCEL_URL };
const FAKE_LIVE_KEY = 'sk_live_fake_key_for_testing_only';
const SECRET = 'whsk_fake_live_webhook_secret';

afterEach(() => {
  env.PAYMONGO_SECRET_KEY = original.key;
  env.PAYMONGO_WEBHOOK_SECRET = original.secret;
  env.NODE_ENV = original.nodeEnv;
  env.PAYMENT_SUCCESS_URL = original.success;
  env.PAYMENT_CANCEL_URL = original.cancel;
});

const sign = (rawBody: string, field: 'li' | 'te') => {
  const t = Math.floor(Date.now() / 1000).toString();
  return `t=${t},${field}=${createHmac('sha256', SECRET).update(`${t}.${rawBody}`).digest('hex')}`;
};

const paidEvent = (orderId: string, livemode: boolean) =>
  JSON.stringify({ data: { id: `evt_${Date.now()}`, type: 'event', attributes: { type: 'payment.paid', livemode, data: { id: `pay_${Date.now()}`, type: 'payment', attributes: { reference_number: orderId, amount: 99400 } } } } });

const postWebhook = (rawBody: string, signature?: string) => {
  const req = request(app).post('/api/payments/webhook').set('Content-Type', 'application/json');
  if (signature) req.set('Paymongo-Signature', signature);
  return req.send(rawBody);
};

async function pendingPayment() {
  const customer = await createCustomer();
  const order = await createTestOrder({ customerId: customer.user.id, shippingQuote: 194 });
  const payment = await createTestPayment({ orderId: order.id, status: PaymentStatus.PENDING, amount: Number(order.totalAmount) });
  return { order, payment };
}

describe('PayMongo live mode', () => {
  it('derives the mode from the key prefix only', () => {
    expect(paymongoMode('sk_live_abc')).toBe('live');
    expect(paymongoMode('sk_test_abc')).toBe('test');
    expect(paymongoMode('')).toBe('unconfigured');
    expect(paymongoMode('pk_live_abc')).toBe('unconfigured'); // a public key is never a server key
  });

  it('accepts only the live signature with a live key, and only the test signature with a test key', () => {
    const body = Buffer.from('{"a":1}');
    const live = sign('{"a":1}', 'li');
    const test = sign('{"a":1}', 'te');
    expect(verifyPaymongoSignature(body, live, SECRET, 'live')).toBe(true);
    expect(verifyPaymongoSignature(body, test, SECRET, 'live')).toBe(false);
    expect(verifyPaymongoSignature(body, test, SECRET, 'test')).toBe(true);
    expect(verifyPaymongoSignature(body, live, SECRET, 'test')).toBe(false);
  });

  it('with a live key, a live-signed live-mode payment.paid marks the order paid', async () => {
    env.PAYMONGO_SECRET_KEY = FAKE_LIVE_KEY;
    env.PAYMONGO_WEBHOOK_SECRET = SECRET;
    const { order, payment } = await pendingPayment();
    const body = paidEvent(order.id, true);

    expect((await postWebhook(body, sign(body, 'li'))).status).toBe(200);

    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe(PaymentStatus.PAID);
  });

  it('with a live key, a test-mode event never marks an order paid', async () => {
    env.PAYMONGO_SECRET_KEY = FAKE_LIVE_KEY;
    env.PAYMONGO_WEBHOOK_SECRET = SECRET;
    const { order, payment } = await pendingPayment();
    const body = paidEvent(order.id, false);

    expect((await postWebhook(body, sign(body, 'te'))).status).toBe(400); // test signature refused outright
    expect((await postWebhook(body, sign(body, 'li'))).status).toBe(200); // acknowledged, but ignored: livemode=false

    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe(PaymentStatus.PENDING);
  });

  it('in production, refuses every webhook when no webhook secret is configured', async () => {
    env.NODE_ENV = 'production';
    env.PAYMONGO_SECRET_KEY = FAKE_LIVE_KEY;
    env.PAYMONGO_WEBHOOK_SECRET = undefined;
    const { order, payment } = await pendingPayment();

    expect((await postWebhook(paidEvent(order.id, true))).status).toBe(500);

    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe(PaymentStatus.PENDING);
  });

  it('warns about a test key, a missing webhook secret and localhost return URLs in production - and nothing when correct', () => {
    env.NODE_ENV = 'production';
    env.PAYMONGO_SECRET_KEY = 'sk_test_fake';
    env.PAYMONGO_WEBHOOK_SECRET = undefined;
    env.PAYMENT_SUCCESS_URL = 'http://localhost:5173/payment/success';
    env.PAYMENT_CANCEL_URL = 'http://localhost:5173/payment/cancel';
    expect(paymongoProductionWarnings()).toHaveLength(4);

    env.PAYMONGO_SECRET_KEY = FAKE_LIVE_KEY;
    env.PAYMONGO_WEBHOOK_SECRET = SECRET;
    env.PAYMENT_SUCCESS_URL = 'https://panel-scan-8d8z.vercel.app/payment/success';
    env.PAYMENT_CANCEL_URL = 'https://panel-scan-8d8z.vercel.app/payment/cancel';
    expect(paymongoProductionWarnings()).toEqual([]);
  });

  it('GET /health reports the payment mode without ever including a key', async () => {
    env.PAYMONGO_SECRET_KEY = FAKE_LIVE_KEY;
    env.PAYMONGO_WEBHOOK_SECRET = SECRET;

    const response = await request(app).get('/health');

    expect(response.body.payments).toMatchObject({ mode: 'live', webhookVerification: true });
    expect(JSON.stringify(response.body)).not.toContain(FAKE_LIVE_KEY);
    expect(JSON.stringify(response.body)).not.toContain(SECRET);
    expect(paymongoConfigSummary()).not.toHaveProperty('secretKey');
  });
});
