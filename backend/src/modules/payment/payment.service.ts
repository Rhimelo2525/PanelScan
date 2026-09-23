import { NotificationType, OrderStatus, PaymentStatus, Prisma, UserRole } from '@prisma/client';

import { env } from '../../config/env';
import { prisma } from '../../config/database';
import { createNotification } from '../notifications/notification.service';
import { AppError } from '../../utils/AppError';
import { deliveryService } from '../delivery/delivery.service';
import { DELIVERY_FEE_REFERENCE_PREFIX, createPaymongoCheckoutSession, verifyPaymongoSignature } from './paymongo.client';
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
    if (!order.moderatorApproved) {
      throw new AppError('This order is awaiting moderator approval before payment can proceed.', 400);
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

    await createNotification({
      userId: customerId,
      type: NotificationType.PAYMENT,
      title: 'Payment initiated',
      message: `A payment for order ${order.orderNumber} has been initiated.`,
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

    // A delivery-fee Checkout Session's reference_number carries the
    // "delivery:" prefix (see paymongo.client.ts) - route it to the
    // delivery module entirely and stop here. Everything below this point
    // is unchanged, pre-existing product-order Payment handling.
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

        if (order) {
          await createNotification(
            {
              userId: order.customerId,
              type: NotificationType.PAYMENT,
              title: 'Payment successful',
              message: `Your payment for order ${order.orderNumber} was successful.`,
              metadata: { paymentId: payment.id, orderId: order.id },
            },
            tx,
          );
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

  /** Product/order-total charge only - see paymongo.client.ts for the shared PayMongo mechanics, and delivery.service.ts for the separate delivery-fee charge. */
  private async createPaymongoCheckoutSession(
    order: { id: string; orderNumber: string; totalAmount: Prisma.Decimal },
    customer: { firstName: string; lastName: string; email: string; phone: string | null },
  ): Promise<PaymongoCheckoutSessionResponseData> {
    const amountInCentavos = Math.round(Number(order.totalAmount) * 100);

    return createPaymongoCheckoutSession({
      referenceNumber: order.id,
      description: `Payment for order ${order.orderNumber}`,
      amountInCentavos,
      lineItemName: `Order ${order.orderNumber}`,
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
