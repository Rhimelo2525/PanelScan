import { createHmac, timingSafeEqual } from 'node:crypto';

import { OrderStatus, PaymentStatus, Prisma, UserRole } from '@prisma/client';

import { env } from '../../config/env';
import { prisma } from '../../config/database';
import { AppError } from '../../utils/AppError';
import {
  paymentInclude,
  type CreatePaymentResult,
  type PaginatedPayments,
  type PaymentFilters,
  type PaymentWithOrder,
  type PaymongoCheckoutSessionRequest,
  type PaymongoCheckoutSessionResponse,
  type PaymongoCheckoutSessionResponseData,
  type PaymongoErrorResponse,
  type PaymongoWebhookEvent,
} from './payment.types';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const PAYMENT_METHOD = 'PayMongo';

/**
 * PayMongo signs webhook requests with a `Paymongo-Signature` header shaped
 * like `t=<unix_timestamp>,te=<test_signature>,li=<live_signature>`, where
 * each signature is HMAC-SHA256(webhook_secret, `${t}.${rawBody}`) in hex.
 * Accepts a match on either `te` or `li` since this integration doesn't yet
 * separate test/live webhook secrets. `timingSafeEqual` avoids leaking
 * signature bytes through response-time comparisons.
 */
const verifyPaymongoSignature = (rawBody: Buffer, signatureHeader: string | undefined, secret: string): boolean => {
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

/** Pulls our own correlation id back out of a webhook payload's nested payment/checkout-session data. */
const extractReferenceNumber = (event: PaymongoWebhookEvent): string | undefined => {
  const attrs = event.data?.attributes?.data?.attributes;
  if (!attrs) return undefined;
  if (typeof attrs.reference_number === 'string') return attrs.reference_number;
  return undefined;
};

export class PaymentService {
  async createPayment(customerId: string, orderId: string): Promise<CreatePaymentResult> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        payment: true,
        customer: { select: { firstName: true, lastName: true, email: true, phone: true } },
      },
    });

    if (!order) {
      throw new AppError('Order not found.', 404);
    }
    if (order.customerId !== customerId) {
      throw new AppError('You do not have permission to pay for this order.', 403);
    }
    if (order.status === OrderStatus.CANCELLED) {
      throw new AppError('This order has been cancelled and cannot be paid.', 400);
    }
    if (order.payment && (order.payment.status === PaymentStatus.PAID || order.payment.status === PaymentStatus.REFUNDED)) {
      throw new AppError('This order has already been paid.', 400);
    }

    const checkoutSession = await this.createPaymongoCheckoutSession(order, order.customer);

    const payment = await prisma.payment.upsert({
      where: { orderId: order.id },
      update: {
        status: PaymentStatus.PENDING,
        method: PAYMENT_METHOD,
        amount: order.totalAmount,
        transactionRef: checkoutSession.id,
      },
      create: {
        orderId: order.id,
        status: PaymentStatus.PENDING,
        method: PAYMENT_METHOD,
        amount: order.totalAmount,
        transactionRef: checkoutSession.id,
      },
      include: paymentInclude,
    });

    return { payment, checkoutUrl: checkoutSession.attributes.checkout_url };
  }

  async getPaymentById(paymentId: string, requesterId: string, requesterRole: UserRole): Promise<PaymentWithOrder> {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId }, include: paymentInclude });
    if (!payment) {
      throw new AppError('Payment not found.', 404);
    }
    if (requesterRole === UserRole.CUSTOMER && payment.order.customerId !== requesterId) {
      throw new AppError('Payment not found.', 404);
    }
    return payment;
  }

  /** CUSTOMER's own payments. */
  async getPaymentsForCustomer(customerId: string, filters: PaymentFilters): Promise<PaginatedPayments> {
    return this.listPayments(filters, { order: { customerId } });
  }

  /** MODERATOR/OWNER view of every payment. */
  async getAllPayments(filters: PaymentFilters): Promise<PaginatedPayments> {
    return this.listPayments(filters, {});
  }

  private async listPayments(filters: PaymentFilters, where: Prisma.PaymentWhereInput): Promise<PaginatedPayments> {
    const page = filters.page ?? DEFAULT_PAGE;
    const limit = filters.limit ?? DEFAULT_LIMIT;

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: paymentInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.payment.count({ where }),
    ]);

    return { payments, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  }

  /**
   * Verifies the webhook signature, then handles two event types:
   *  - `payment.paid`: marks the matching Payment PAID (idempotent - a
   *    redelivered webhook for an already-PAID payment is a silent no-op)
   *    and, if the related Order is still PENDING, advances it to
   *    PROCESSING.
   *  - `payment.failed`: marks the matching Payment FAILED. The Order is
   *    deliberately left untouched - a failed payment doesn't cancel the
   *    order, it just means the customer needs to retry via
   *    POST /api/payments/create again (upsert reuses the same Payment row).
   * Any other event type, or an event that can't be correlated to a known
   * Payment, is acknowledged without error so PayMongo doesn't retry
   * indefinitely for something this module doesn't act on.
   */
  async handleWebhook(rawBody: Buffer, signatureHeader: string | undefined): Promise<void> {
    if (env.PAYMONGO_WEBHOOK_SECRET) {
      const isValid = verifyPaymongoSignature(rawBody, signatureHeader, env.PAYMONGO_WEBHOOK_SECRET);
      if (!isValid) {
        throw new AppError('Invalid webhook signature.', 400);
      }
    }

    let event: PaymongoWebhookEvent;
    try {
      event = JSON.parse(rawBody.toString('utf8')) as PaymongoWebhookEvent;
    } catch {
      throw new AppError('Invalid webhook payload.', 400);
    }

    const eventType = event.data?.attributes?.type;
    if (eventType !== 'payment.paid' && eventType !== 'payment.failed') {
      return;
    }

    const referenceNumber = extractReferenceNumber(event);
    const eventPaymentId = event.data?.attributes?.data?.id;

    const payment = await prisma.payment.findFirst({
      where: {
        OR: [
          ...(referenceNumber ? [{ orderId: referenceNumber }] : []),
          ...(eventPaymentId ? [{ transactionRef: eventPaymentId }] : []),
        ],
      },
    });

    if (!payment) {
      return;
    }

    if (eventType === 'payment.paid') {
      if (payment.status === PaymentStatus.PAID) {
        return;
      }

      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.PAID,
            paidAt: new Date(),
            transactionRef: eventPaymentId ?? payment.transactionRef,
          },
        });

        const order = await tx.order.findUnique({ where: { id: payment.orderId } });
        if (order && order.status === OrderStatus.PENDING) {
          await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.PROCESSING } });
        }
      });
      return;
    }

    // payment.failed - only downgrade a still-pending payment; never overwrite
    // an already-PAID/FAILED/REFUNDED payment based on a (possibly late or
    // redelivered) failure event.
    if (payment.status === PaymentStatus.PENDING) {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.FAILED, transactionRef: eventPaymentId ?? payment.transactionRef },
      });
    }
  }

  private async createPaymongoCheckoutSession(
    order: { id: string; orderNumber: string; totalAmount: Prisma.Decimal },
    customer: { firstName: string; lastName: string; email: string; phone: string | null },
  ): Promise<PaymongoCheckoutSessionResponseData> {
    if (!env.PAYMONGO_SECRET_KEY) {
      throw new AppError('Payment provider is not configured.', 500);
    }

    const amountInCentavos = Math.round(Number(order.totalAmount) * 100);

    const requestBody: PaymongoCheckoutSessionRequest = {
      data: {
        attributes: {
          billing: {
            name: `${customer.firstName} ${customer.lastName}`,
            email: customer.email,
            ...(customer.phone ? { phone: customer.phone } : {}),
          },
          send_email_receipt: false,
          show_description: true,
          show_line_items: true,
          cancel_url: env.PAYMENT_CANCEL_URL,
          success_url: env.PAYMENT_SUCCESS_URL,
          description: `Payment for order ${order.orderNumber}`,
          reference_number: order.id,
          line_items: [
            {
              currency: 'PHP',
              amount: amountInCentavos,
              description: `PanelScan order ${order.orderNumber}`,
              name: `Order ${order.orderNumber}`,
              quantity: 1,
            },
          ],
          payment_method_types: ['gcash', 'card', 'paymaya', 'grab_pay'],
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
}

export const paymentService = new PaymentService();
