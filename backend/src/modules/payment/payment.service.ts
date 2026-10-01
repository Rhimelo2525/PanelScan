import { NotificationType, OrderStatus, PaymentStatus, Prisma, UserRole } from '@prisma/client';
import type { Payment } from '@prisma/client';

import { env } from '../../config/env';
import { prisma } from '../../config/database';
import { createNotification } from '../notifications/notification.service';
import { describeError, notifyStaff, notifySystemIssue } from '../notifications/notification.triggers';
import { AppError } from '../../utils/AppError';
import { deliveryService } from '../delivery/delivery.service';
import { ORDER_WORKFLOW_STATUSES } from '../delivery/utils/lalamove-status';
import { mirrorOrderToBackup } from '../order/order-backup';
import { DELIVERY_FEE_REFERENCE_PREFIX, createPaymongoCheckoutSession, paymongoMode, retrievePaymongoCheckoutSession, verifyPaymongoSignature } from './paymongo.client';
import {
  paymentInclude,
  type CreatePaymentResult,
  type PaginatedPayments,
  type PaymentFilters,
  type PaymentWithOrder,
  type PaymongoCheckoutSessionResponseData,
  type PaymongoWebhookEvent,
} from './payment.types';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const PAYMENT_METHOD = 'PayMongo';

const AWAITING_SHIPPING_FEE_MESSAGE = 'Your order has been approved. We are calculating your delivery fee. Payment will be available once the estimated shipping fee is ready.';

/** Pulls our own correlation id back out of a webhook payload's nested payment/checkout-session data. */
const extractReferenceNumber = (event: PaymongoWebhookEvent): string | undefined => {
  const attrs = event.data?.attributes?.data?.attributes;
  if (!attrs) return undefined;
  if (typeof attrs.reference_number === 'string') return attrs.reference_number;
  return undefined;
};

/**
 * The paid amount, in centavos, from a Checkout Session's `payments` list -
 * a session carries its payments rather than an amount of its own.
 */
const paidCentavosFromSessionPayments = (payments: unknown): number | undefined => {
  if (!Array.isArray(payments)) return undefined;
  for (const entry of payments as { attributes?: { status?: unknown; amount?: unknown } }[]) {
    const amount = entry?.attributes?.amount;
    if (entry?.attributes?.status === 'paid' && typeof amount === 'number' && Number.isFinite(amount)) return amount;
  }
  return undefined;
};

/** The amount PayMongo actually collected, in centavos, when the event carries it (a payment's amount, or a checkout session's paid payment). */
const extractPaidCentavos = (event: PaymongoWebhookEvent): number | undefined => {
  const attrs = event.data?.attributes?.data?.attributes;
  const amount = attrs?.amount;
  if (typeof amount === 'number' && Number.isFinite(amount)) return amount;
  return paidCentavosFromSessionPayments(attrs?.payments);
};

/**
 * Webhook event types that mean "paid". A `payment.paid` event describes the
 * PayMongo payment (pay_...), which does not carry our order reference; the
 * `checkout_session.payment.paid` event describes the Checkout Session we
 * opened (cs_..., the id stored on the Payment) and carries the order id as
 * its reference_number, so that is the one that can be matched.
 */
const PAID_EVENT_TYPES = new Set(['payment.paid', 'checkout_session.payment.paid']);

const toCentavos = (amount: Prisma.Decimal | number): number => Math.round(Number(amount) * 100);

const formatPeso = (amount: Prisma.Decimal | number): string =>
  `₱${Number(amount).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export class PaymentService {
  /**
   * CUSTOMER pays their order: products + shipping fee in ONE PayMongo GCash
   * checkout. The amount is computed here from the order's own server-side
   * subtotal and the moderator's shipping quote - nothing the browser sends
   * is trusted, it only names the order. Payment opens only once the
   * shipping fee has been quoted, so the customer never pays a total that
   * is missing its delivery fee.
   */
  async createPayment(customerId: string, orderId: string): Promise<CreatePaymentResult> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        payment: true,
        delivery: { select: { quotedAt: true, deliveryStatus: true, vehicleType: true, providerMetadata: true } },
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
    if (!order.moderatorApproved) {
      throw new AppError('This order is awaiting moderator approval before payment can proceed.', 400);
    }
    if (order.payment && (order.payment.status === PaymentStatus.PAID || order.payment.status === PaymentStatus.REFUNDED)) {
      throw new AppError('This order has already been paid.', 400);
    }
    if (!order.delivery?.quotedAt) {
      throw new AppError(AWAITING_SHIPPING_FEE_MESSAGE, 400);
    }

    // Products + shipping, from the order's own server-side values.
    const amountDue = order.subtotal.add(order.shippingFee);

    let checkoutSession: PaymongoCheckoutSessionResponseData;
    try {
      checkoutSession = await this.createPaymongoCheckoutSession({ ...order, amountDue }, order.customer);
    } catch (error) {
      // Configuration/validation problems (4xx AppErrors) are not provider outages - only alert staff for the rest.
      if (!(error instanceof AppError) || error.statusCode >= 500) {
        await notifySystemIssue({
          title: 'Payment API error',
          message: `PayMongo checkout could not be created: ${describeError(error)}`,
          event: 'PAYMENT_API_ERROR',
          metadata: { orderId: order.id },
        });
      }
      throw error;
    }

    const paymentData = {
      status: PaymentStatus.PENDING,
      method: PAYMENT_METHOD,
      amount: amountDue,
      transactionRef: checkoutSession.id,
    };
    const payment = await prisma.payment.upsert({
      where: { orderId: order.id },
      update: paymentData,
      create: { orderId: order.id, ...paymentData },
      include: paymentInclude,
    });
    await mirrorOrderToBackup(order.id, customerId, 'payment started');

    await createNotification({
      userId: customerId,
      type: NotificationType.PAYMENT,
      title: 'Payment initiated',
      message: `A GCash payment of ${formatPeso(amountDue)} for order ${order.orderNumber} (products + shipping) has been initiated.`,
      metadata: { paymentId: payment.id, orderId: order.id },
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
    if (payment.status === PaymentStatus.PENDING && (await this.reconcileWithPaymongo(payment))) {
      return prisma.payment.findUniqueOrThrow({ where: { id: paymentId }, include: paymentInclude });
    }
    return payment;
  }

  /**
   * Asks PayMongo directly whether a still-PENDING payment's Checkout Session
   * has been paid, and records it if so. The payment page polls this while
   * it waits, so an order is marked paid even when the webhook is late, was
   * missed, or can't reach this server at all (e.g. a local backend). True
   * when the payment was just marked PAID. Any problem: false, keep waiting.
   */
  private async reconcileWithPaymongo(payment: Payment): Promise<boolean> {
    if (!payment.transactionRef?.startsWith('cs_')) return false;

    const session = await retrievePaymongoCheckoutSession(payment.transactionRef);
    // Same rules as the webhook: this order's session, and the configured mode.
    const mode = paymongoMode();
    const livemode = session?.attributes.livemode;
    if (!session || session.attributes.reference_number !== payment.orderId) return false;
    if ((mode === 'live' && livemode !== true) || (mode === 'test' && livemode === true)) return false;

    const paidCentavos = paidCentavosFromSessionPayments(session.attributes.payments);
    if (paidCentavos === undefined) return false;

    await this.markPaymentPaid(payment, new Prisma.Decimal(paidCentavos).div(100), payment.transactionRef);
    return true;
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
   * Verifies the webhook signature, then handles:
   *  - `checkout_session.payment.paid` / `payment.paid`: marks the matching
   *    Payment PAID (see markPaymentPaid). Only the checkout-session event
   *    can be matched to our Payment (cs_ id + order reference); the plain
   *    payment event is still accepted for anything that does match. Only
   *    PayMongo itself marks an order paid - this webhook, or the same
   *    answer read straight from PayMongo's API (reconcileWithPaymongo).
   *    Returning from PayMongo's checkout page proves nothing.
   *  - `payment.failed`: marks the matching Payment FAILED. The Order is
   *    deliberately left untouched - a failed payment doesn't cancel the
   *    order, it just means the customer needs to retry via
   *    POST /api/payments/create again (upsert reuses the same Payment row).
   * Any other event type, or an event that can't be correlated to a known
   * Payment, is acknowledged without error so PayMongo doesn't retry
   * indefinitely for something this module doesn't act on.
   */
  async handleWebhook(rawBody: Buffer, signatureHeader: string | undefined): Promise<void> {
    const mode = paymongoMode();
    if (env.PAYMONGO_WEBHOOK_SECRET) {
      const isValid = verifyPaymongoSignature(rawBody, signatureHeader, env.PAYMONGO_WEBHOOK_SECRET, mode);
      if (!isValid) {
        throw new AppError('Invalid webhook signature.', 400);
      }
    } else if (env.NODE_ENV === 'production') {
      // Fail closed: in production an unverifiable webhook must never mark an
      // order paid. 500 so PayMongo retries once the secret is configured.
      console.error('[payment] Webhook rejected: PAYMONGO_WEBHOOK_SECRET is not configured.');
      throw new AppError('Payment webhook verification is not configured.', 500);
    }

    let event: PaymongoWebhookEvent;
    try {
      event = JSON.parse(rawBody.toString('utf8')) as PaymongoWebhookEvent;
    } catch {
      throw new AppError('Invalid webhook payload.', 400);
    }

    const eventType = event.data?.attributes?.type;
    if (!PAID_EVENT_TYPES.has(eventType) && eventType !== 'payment.failed') {
      return;
    }
    const outcome = PAID_EVENT_TYPES.has(eventType) ? 'payment.paid' : 'payment.failed';

    // A live deployment only acts on live-mode events (and a test one only on
    // test events), so a test payment can never mark a real order paid.
    const livemode = event.data?.attributes?.livemode;
    if ((mode === 'live' && livemode !== true) || (mode === 'test' && livemode === true)) {
      console.warn(`[payment] Ignored ${eventType} event ${event.data?.id ?? ''}: livemode=${String(livemode)} does not match the ${mode} PayMongo key.`);
      return;
    }

    const referenceNumber = extractReferenceNumber(event);
    const eventPaymentId = event.data?.attributes?.data?.id;

    // A legacy separate delivery-fee Checkout Session's reference_number
    // carries the "delivery:" prefix (see paymongo.client.ts) - route it to
    // the delivery module entirely and stop here.
    if (referenceNumber?.startsWith(DELIVERY_FEE_REFERENCE_PREFIX)) {
      const deliveryId = referenceNumber.slice(DELIVERY_FEE_REFERENCE_PREFIX.length);
      await deliveryService.handleDeliveryFeeWebhook(deliveryId, outcome, eventPaymentId);
      return;
    }

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

    if (outcome === 'payment.paid') {
      // Record what PayMongo actually collected. It can differ from the order
      // total only if the customer completed an older checkout opened before
      // the shipping fee was re-quoted - staff are alerted in markPaymentPaid.
      const paidCentavos = extractPaidCentavos(event);
      await this.markPaymentPaid(payment, paidCentavos !== undefined ? new Prisma.Decimal(paidCentavos).div(100) : payment.amount, eventPaymentId ?? payment.transactionRef);
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
      await mirrorOrderToBackup(payment.orderId, null, 'payment failed');

      const order = await prisma.order.findUnique({ where: { id: payment.orderId }, select: { id: true, orderNumber: true, customerId: true } });
      if (order) {
        await createNotification({
          userId: order.customerId,
          type: NotificationType.PAYMENT,
          title: 'Payment failed',
          message: `Your payment for order ${order.orderNumber} did not go through. You can try paying again from your order.`,
          metadata: { paymentId: payment.id, orderId: order.id, event: 'PAYMENT_FAILED' },
        });
        await notifyStaff({
          type: NotificationType.PAYMENT,
          title: 'Payment failed',
          message: `A GCash payment for order ${order.orderNumber} failed.`,
          metadata: { paymentId: payment.id, orderId: order.id, event: 'PAYMENT_FAILED' },
          roles: [UserRole.MODERATOR],
        });
      }
    }
  }

  /**
   * Marks a Payment PAID once PayMongo has confirmed it (webhook or API read):
   * advances a still-PENDING Order to PROCESSING, moves its delivery to
   * "Ready to book" so the moderator can book Lalamove, and notifies the
   * customer and staff. A payment that is already PAID is left alone.
   */
  private async markPaymentPaid(payment: Payment, paidAmount: Prisma.Decimal, transactionRef: string | null): Promise<void> {
    if (payment.status === PaymentStatus.PAID) return;

    const paidOrder = await prisma.$transaction(async (tx) => {
      // Conditional, so the webhook and a status check arriving together can
      // only mark it paid (and notify everyone) once.
      const { count } = await tx.payment.updateMany({
        where: { id: payment.id, status: { not: PaymentStatus.PAID } },
        data: { status: PaymentStatus.PAID, paidAt: new Date(), amount: paidAmount, transactionRef },
      });
      if (count === 0) return null;

      const order = await tx.order.findUnique({ where: { id: payment.orderId }, include: { delivery: true } });
      if (order && order.status === OrderStatus.PENDING) {
        await tx.order.update({ where: { id: order.id }, data: { status: OrderStatus.PROCESSING } });
      }
      // Paid -> ready for the moderator to book Lalamove.
      if (order?.delivery && !order.delivery.lalamoveOrderId && order.status !== OrderStatus.CANCELLED) {
        await tx.delivery.update({
          where: { id: order.delivery.id },
          data: { deliveryStatus: ORDER_WORKFLOW_STATUSES.READY_TO_BOOK, bookingError: null, bookingFailedAt: null },
        });
      }

      if (order) {
        await createNotification(
          {
            userId: order.customerId,
            type: NotificationType.PAYMENT,
            title: 'Payment successful',
            message: `Payment successful. Your payment of ${formatPeso(paidAmount)} for order ${order.orderNumber} was confirmed. Your delivery is being prepared.`,
            metadata: { paymentId: payment.id, orderId: order.id, event: 'PAYMENT_RECEIVED' },
          },
          tx,
        );
      }
      return order;
    });

    if (paidOrder) {
      await mirrorOrderToBackup(paidOrder.id, null, 'payment confirmed');

      const shipping = paidOrder.delivery?.quotedAt ? ` incl. ${formatPeso(paidOrder.shippingFee)} shipping` : '';
      const deliveryPointer = paidOrder.delivery ? { deliveryId: paidOrder.delivery.id } : {};
      await notifyStaff({
        type: NotificationType.PAYMENT,
        title: 'Payment received',
        message: `GCash payment of ${formatPeso(paidAmount)}${shipping} received for order ${paidOrder.orderNumber}.`,
        metadata: { paymentId: payment.id, orderId: paidOrder.id, ...deliveryPointer, event: 'PAYMENT_RECEIVED' },
        byRole: {
          [UserRole.MODERATOR]: {
            title: 'Paid - ready to book',
            message: `Order ${paidOrder.orderNumber} is paid (${formatPeso(paidAmount)}${shipping}). Select the Lalamove vehicle and book the delivery.`,
          },
        },
      });

      if (toCentavos(paidAmount) !== toCentavos(paidOrder.totalAmount)) {
        await notifyStaff({
          type: NotificationType.PAYMENT,
          title: 'Payment amount differs from order total',
          message: `Order ${paidOrder.orderNumber} was paid ${formatPeso(paidAmount)}, but its current total is ${formatPeso(paidOrder.totalAmount)}. Review the order before booking.`,
          metadata: { paymentId: payment.id, orderId: paidOrder.id, ...deliveryPointer, event: 'PAYMENT_AMOUNT_MISMATCH' },
        });
      }
    }
  }

  /**
   * One PayMongo GCash Checkout Session for the whole amount due, itemised as
   * products + shipping fee on PayMongo's page (see paymongo.client.ts for
   * the shared PayMongo mechanics).
   */
  private async createPaymongoCheckoutSession(
    order: {
      id: string;
      orderNumber: string;
      subtotal: Prisma.Decimal;
      shippingFee: Prisma.Decimal;
      amountDue: Prisma.Decimal;
      delivery: { vehicleType: string | null; providerMetadata: Prisma.JsonValue } | null;
    },
    customer: { firstName: string; lastName: string; email: string; phone: string | null },
  ): Promise<PaymongoCheckoutSessionResponseData> {
    const metadata = order.delivery?.providerMetadata as Prisma.JsonObject | null;
    const vehicleLabel = typeof metadata?.vehicleLabel === 'string' ? metadata.vehicleLabel : order.delivery?.vehicleType;
    const shippingCentavos = toCentavos(order.shippingFee);

    return createPaymongoCheckoutSession({
      referenceNumber: order.id,
      description: `Payment for order ${order.orderNumber} (products + shipping)`,
      amountInCentavos: toCentavos(order.amountDue),
      lineItemName: `Order ${order.orderNumber}`,
      lineItems: [
        { name: `Products - order ${order.orderNumber}`, amountInCentavos: toCentavos(order.subtotal) },
        ...(shippingCentavos > 0 ? [{ name: `Shipping fee - Lalamove${vehicleLabel ? ` ${vehicleLabel}` : ''}`, amountInCentavos: shippingCentavos }] : []),
      ],
      billing: {
        name: `${customer.firstName} ${customer.lastName}`,
        email: customer.email,
        phone: customer.phone ?? undefined,
      },
      successUrl: env.PAYMENT_SUCCESS_URL,
      cancelUrl: env.PAYMENT_CANCEL_URL,
      paymentMethodTypes: ['gcash'],
    });
  }
}

export const paymentService = new PaymentService();
