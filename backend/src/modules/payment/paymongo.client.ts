import { createHmac, timingSafeEqual } from 'node:crypto';

import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';
import type {
  PaymongoCheckoutSessionRequest,
  PaymongoCheckoutSessionResponse,
  PaymongoCheckoutSessionResponseData,
  PaymongoErrorResponse,
} from './payment.types';

/**
 * The PayMongo client itself: opens Checkout Sessions and verifies webhook
 * signatures for the order payment (payment.service.ts), which covers the
 * products and the shipping fee in one transaction. One PayMongo secret key
 * (server-side only), one signing scheme, one place to fix if PayMongo ever
 * changes a field name - see payment.types.ts for the same caveat about
 * these shapes not being verified against live PayMongo docs.
 */

/**
 * Which PayMongo environment the configured secret key belongs to. PayMongo
 * uses the same API host for both - the key alone decides whether a
 * checkout is a real (live) charge or a test one. Derived from the key's
 * prefix only; the key itself is never returned, logged or displayed.
 */
export type PaymongoMode = 'live' | 'test' | 'unconfigured';

export const paymongoMode = (secretKey: string | undefined = env.PAYMONGO_SECRET_KEY): PaymongoMode => {
  if (secretKey?.startsWith('sk_live_')) return 'live';
  if (secretKey?.startsWith('sk_test_')) return 'test';
  return 'unconfigured';
};

/**
 * Safe, non-secret summary of the payment configuration for GET /health:
 * the mode, whether webhook verification is configured, and the public
 * return URLs PayMongo sends the customer back to. Never includes a key.
 */
export const paymongoConfigSummary = () => ({
  mode: paymongoMode(),
  webhookVerification: Boolean(env.PAYMONGO_WEBHOOK_SECRET),
  successUrl: env.PAYMENT_SUCCESS_URL,
  cancelUrl: env.PAYMENT_CANCEL_URL,
});

/**
 * Production misconfigurations that would break (or fake) real payments,
 * as plain warnings - never including a key. Empty when all is well.
 */
export const paymongoProductionWarnings = (): string[] => {
  if (env.NODE_ENV !== 'production') return [];
  const warnings: string[] = [];
  const mode = paymongoMode();
  if (mode !== 'live') warnings.push(`PAYMONGO_SECRET_KEY is ${mode === 'test' ? 'a TEST key' : 'not set'} - production checkouts will not take real payments.`);
  if (!env.PAYMONGO_WEBHOOK_SECRET) warnings.push('PAYMONGO_WEBHOOK_SECRET is not set - payment webhooks will be rejected, so no order can be marked paid.');
  for (const [name, url] of [['PAYMENT_SUCCESS_URL', env.PAYMENT_SUCCESS_URL], ['PAYMENT_CANCEL_URL', env.PAYMENT_CANCEL_URL]] as const) {
    if (/localhost|127\.0\.0\.1/.test(url)) warnings.push(`${name} points to localhost - customers returning from PayMongo will not reach PanelScan.`);
  }
  return warnings;
};

/**
 * PayMongo signs webhook requests with a `Paymongo-Signature` header shaped
 * like `t=<unix_timestamp>,te=<test_signature>,li=<live_signature>`, where
 * each signature is HMAC-SHA256(webhook_secret, `${t}.${rawBody}`) in hex.
 * PayMongo fills `li` for live-mode events and `te` for test-mode ones, so
 * with a live key only `li` is accepted and with a test key only `te`
 * (either, when the mode is unknown). `timingSafeEqual` avoids leaking
 * signature bytes through response-time comparisons.
 */
export const verifyPaymongoSignature = (rawBody: Buffer, signatureHeader: string | undefined, secret: string, mode: PaymongoMode = 'unconfigured'): boolean => {
  if (!signatureHeader) return false;

  const parts = new Map<string, string>();
  for (const segment of signatureHeader.split(',')) {
    const [key, value] = segment.split('=');
    if (key && value) parts.set(key.trim(), value.trim());
  }

  const timestamp = parts.get('t');
  const accepted = mode === 'live' ? [parts.get('li')] : mode === 'test' ? [parts.get('te')] : [parts.get('li'), parts.get('te')];
  const candidates = accepted.filter((value): value is string => Boolean(value));
  if (!timestamp || candidates.length === 0) return false;

  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody.toString('utf8')}`).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'utf8');

  return candidates.some((candidate) => {
    const candidateBuffer = Buffer.from(candidate, 'utf8');
    return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
  });
};

/**
 * Prefix used on `reference_number` for a separate delivery-fee Checkout
 * Session. Legacy: the shipping fee is now part of the order payment and no
 * new delivery-fee session is ever created; kept so the ONE PayMongo
 * webhook endpoint (payment.service.ts#handleWebhook) can tell a
 * delivery-fee event apart from a product-order event and route it to the
 * right table, without needing a second webhook endpoint or a second
 * signature-verification code path. A bare order id (no prefix) is always
 * a product Payment - unchanged, pre-existing behavior.
 */
export const DELIVERY_FEE_REFERENCE_PREFIX = 'delivery:';

export interface CreateCheckoutSessionParams {
  /** Our own correlation id, round-tripped by PayMongo and read back off the webhook event to match it to the right record - see extractReferenceNumber() in payment.service.ts. */
  referenceNumber: string;
  description: string;
  /** Smallest currency unit - centavos for PHP. */
  amountInCentavos: number;
  lineItemName: string;
  /**
   * Optional breakdown shown on PayMongo's checkout page (e.g. products and
   * shipping fee). Still ONE session and ONE payment; the items must add up
   * to exactly `amountInCentavos`, or nothing is sent to PayMongo.
   */
  lineItems?: { name: string; amountInCentavos: number }[];
  billing: { name: string; email: string; phone?: string };
  successUrl: string;
  cancelUrl: string;
  paymentMethodTypes: string[];
}

/** Opens one PayMongo Checkout Session for exactly the given amount - never the caller's job to decide what else to bill. */
export async function createPaymongoCheckoutSession(params: CreateCheckoutSessionParams): Promise<PaymongoCheckoutSessionResponseData> {
  if (!env.PAYMONGO_SECRET_KEY) {
    throw new AppError('Payment provider is not configured.', 500);
  }

  const lineItems = params.lineItems?.length
    ? params.lineItems.map((item) => ({ currency: 'PHP', amount: item.amountInCentavos, description: params.description, name: item.name, quantity: 1 }))
    : [{ currency: 'PHP', amount: params.amountInCentavos, description: params.description, name: params.lineItemName, quantity: 1 }];
  if (lineItems.reduce((sum, item) => sum + item.amount, 0) !== params.amountInCentavos) {
    throw new AppError('Payment line items do not add up to the amount due.', 500);
  }

  const requestBody: PaymongoCheckoutSessionRequest = {
    data: {
      attributes: {
        billing: {
          name: params.billing.name,
          email: params.billing.email,
          ...(params.billing.phone ? { phone: params.billing.phone } : {}),
        },
        send_email_receipt: false,
        show_description: true,
        show_line_items: true,
        cancel_url: params.cancelUrl,
        success_url: params.successUrl,
        description: params.description,
        reference_number: params.referenceNumber,
        line_items: lineItems,
        payment_method_types: params.paymentMethodTypes,
      },
    },
  };

  const authHeader = `Basic ${Buffer.from(`${env.PAYMONGO_SECRET_KEY}:`).toString('base64')}`;

  let response: Response;
  try {
    response = await fetch(`${env.PAYMONGO_API_URL}/checkout_sessions`, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });
  } catch {
    throw new AppError('Could not reach the payment provider. Please try again later.', 500);
  }

  if (!response.ok) {
    let detail = 'Failed to create a checkout session with the payment provider.';
    try {
      const errorBody = (await response.json()) as PaymongoErrorResponse;
      detail = errorBody.errors?.[0]?.detail ?? detail;
    } catch {
      // Response wasn't JSON - fall back to the generic message.
    }
    throw new AppError(detail, 500);
  }

  const body = (await response.json()) as PaymongoCheckoutSessionResponse;
  return body.data;
}

/**
 * Reads a Checkout Session back from PayMongo (it lists the session's
 * payments and their status). Null whenever that isn't possible - no key, a
 * session from the other mode, a network error or a timeout - so callers can
 * simply carry on waiting for the webhook.
 */
export async function retrievePaymongoCheckoutSession(sessionId: string): Promise<PaymongoCheckoutSessionResponseData | null> {
  if (!env.PAYMONGO_SECRET_KEY) return null;

  try {
    const response = await fetch(`${env.PAYMONGO_API_URL}/checkout_sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Basic ${Buffer.from(`${env.PAYMONGO_SECRET_KEY}:`).toString('base64')}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return null;
    return ((await response.json()) as PaymongoCheckoutSessionResponse).data;
  } catch {
    return null;
  }
}
