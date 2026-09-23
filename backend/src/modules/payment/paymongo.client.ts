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
 * The PayMongo client itself, shared by every module that needs to open a
 * Checkout Session or verify a webhook signature - currently the product
 * payment (payment.service.ts) and the Lalamove delivery-fee payment
 * (delivery.service.ts). One PayMongo secret key, one signing scheme, one
 * place to fix if PayMongo ever changes a field name - see payment.types.ts
 * for the same caveat about these shapes not being verified against live
 * PayMongo docs.
 */

/**
 * PayMongo signs webhook requests with a `Paymongo-Signature` header shaped
 * like `t=<unix_timestamp>,te=<test_signature>,li=<live_signature>`, where
 * each signature is HMAC-SHA256(webhook_secret, `${t}.${rawBody}`) in hex.
 * Accepts a match on either `te` or `li` since this integration doesn't yet
 * separate test/live webhook secrets. `timingSafeEqual` avoids leaking
 * signature bytes through response-time comparisons.
 */
export const verifyPaymongoSignature = (rawBody: Buffer, signatureHeader: string | undefined, secret: string): boolean => {
  if (!signatureHeader) return false;

  const parts = new Map<string, string>();
  for (const segment of signatureHeader.split(',')) {
    const [key, value] = segment.split('=');
    if (key && value) parts.set(key.trim(), value.trim());
  }

  const timestamp = parts.get('t');
  const candidates = [parts.get('li'), parts.get('te')].filter((value): value is string => Boolean(value));
  if (!timestamp || candidates.length === 0) return false;

  const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody.toString('utf8')}`).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'utf8');

  return candidates.some((candidate) => {
    const candidateBuffer = Buffer.from(candidate, 'utf8');
    return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
  });
};

/**
 * Prefix used on `reference_number` for a delivery-fee Checkout Session
 * (see delivery.service.ts's createFeeGcashCheckout), so the ONE PayMongo
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
        line_items: [
          {
            currency: 'PHP',
            amount: params.amountInCentavos,
            description: params.description,
            name: params.lineItemName,
            quantity: 1,
          },
        ],
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
