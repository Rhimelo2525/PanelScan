import { NotificationType, OrderStatus, PaymentStatus, Prisma, UserRole } from '@prisma/client';

import { env } from '../../config/env';
import { prisma } from '../../config/database';
import { createNotification } from '../notifications/notification.service';
import { describeError, notifyStaff, notifySystemIssue } from '../notifications/notification.triggers';
import { AppError } from '../../utils/AppError';
import { deliveryService } from '../delivery/delivery.service';
import { ORDER_WORKFLOW_STATUSES } from '../delivery/utils/lalamove-status';
import { mirrorOrderToBackup } from '../order/order-backup';
import { DELIVERY_FEE_REFERENCE_PREFIX, createPaymongoCheckoutSession, paymongoMode, verifyPaymongoSignature } from './paymongo.client';
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

/** The amount PayMongo actually collected, in centavos, when the event carries it. */
const extractPaidCentavos = (event: PaymongoWebhookEvent): number | undefined => {
  const amount = event.data?.attributes?.data?.attributes?.amount;
  return typeof amount === 'number' && Number.isFinite(amount) ? amount : undefined;
};

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
   *    redelivered webhook for an already-PAID payment is a silent no-op),
   *    advances a still-PENDING Order to PROCESSING, and moves the order's
   *    delivery to "Ready to book" so the moderator can book Lalamove. This
   *    webhook is the ONLY thing that marks an order paid - returning from
   *    PayMongo's checkout page proves nothing.
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
    if (eventType !== 'payment.paid' && eventType !== 'payment.failed') {
      return;
    }

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
      await deliveryService.handleDeliveryFeeWebhook(deliveryId, eventType, eventPaymentId);
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

    if (eventType === 'payment.paid') {
      if (payment.status === PaymentStatus.PAID) {
        return;
      }

      // Record what PayMongo actually collected. It can differ from the order
      // total only if the customer completed an older checkout opened before
      // the shipping fee was re-quoted - staff are alerted below.
      const paidCentavos = extractPaidCentavos(event);
      const paidAmount = paidCentavos !== undefined ? new Prisma.Decimal(paidCentavos).div(100) : payment.amount;

      const paidOrder = await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.PAID,
            paidAt: new Date(),
            amount: paidAmount,
            transactionRef: eventPaymentId ?? payment.transactionRef,
          },
        });

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
