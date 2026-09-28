import { NotificationType, OrderStatus, PaymentStatus, Prisma, UserRole } from '@prisma/client';

import { prisma } from '../../config/database';
import { createNotification } from '../notifications/notification.service';
import { describeError, notifyStaff, notifySystemIssue } from '../notifications/notification.triggers';
import { ActivityAction, buildActivityLogData, type RequestAuditContext } from '../../utils/activityLog';
import { AppError } from '../../utils/AppError';
import { deleteRecordFromBackup } from '../../utils/backupSync';
import { mirrorOrderToBackup } from '../order/order-backup';
import type { DeliveryLocation, DeliveryQuotationSnapshot, DeliveryQuoteRequest, LalamoveServiceType } from './delivery.domain';
import { deliveryInclude } from './delivery.types';
import type { DeliveryFilters, DeliveryWithOrder, PaginatedDeliveries } from './delivery.types';
import type { CreateDeliveryInput, UpdateDeliveryInput } from './delivery.validation';
import { isWarehouseConfigured, lalamoveConfig } from './providers/lalamove.config';
import { lalamoveProvider } from './providers/lalamove.provider';
import { parseDateSearch } from './utils/date-search';
import { ORDER_WORKFLOW_STATUSES, TO_BOOK_DELIVERY_STATUSES, deliveryStatusesForGroup, getDeliveryStatusLabel } from './utils/lalamove-status';
import { normalizePhilippinePhone } from './utils/phone-normalizer';
import { vehicleDisplayName } from './utils/vehicle-label';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

/** A BOOKING lock older than this is treated as abandoned (e.g. the server restarted mid-call), so the moderator can retry. */
const STALE_BOOKING_LOCK_MS = 2 * 60 * 1000;

/** A stored quotation this close to expiring is re-quoted before booking rather than risk Lalamove rejecting it. */
const QUOTATION_EXPIRY_MARGIN_MS = 30 * 1000;

/** Deliveries at these statuses can't be booked (again) from PanelScan. */
const NOT_BOOKABLE_MESSAGE = 'This delivery has already been booked with Lalamove.';

const SYSTEM_CONTEXT: RequestAuditContext = { ipAddress: null, userAgent: null };

type StoredQuotation = Pick<DeliveryQuotationSnapshot, 'quotationId' | 'expiresAt' | 'amount' | 'currency' | 'serviceType' | 'stops'>;

const formatPeso = (amount: number): string => `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const customerName = (customer: { firstName: string; lastName: string }): string => `${customer.firstName} ${customer.lastName}`.trim();

/**
 * Staff alert for a failed call to an external provider. Only 5xx/unknown
 * failures count as an "API error" - a 4xx is the provider rejecting this
 * particular request (bad input), which the caller already sees directly.
 */
const alertProviderError = async (title: 'Delivery API error' | 'Payment API error', operation: string, error: unknown, metadata: Prisma.JsonObject): Promise<void> => {
  if (error instanceof AppError && error.statusCode < 500) return;
  await notifySystemIssue({
    title,
    message: `${operation} failed: ${describeError(error)}`,
    event: title === 'Delivery API error' ? 'DELIVERY_API_ERROR' : 'PAYMENT_API_ERROR',
    metadata,
  });
};

/** Every delivery step mirrors its whole order (order, payment, delivery) to the backup - see order-backup.ts. */
const mirrorDeliveryToBackup = (delivery: { orderId: string }, actorId: string | null, reason: string): Promise<void> => mirrorOrderToBackup(delivery.orderId, actorId, reason);

/**
 * Delivery status changes as the customer, moderators and the owner see
 * them. The customer gets the milestone wording from the delivery spec
 * ("on the way", "delivered"); staff get one uniform status-change alert.
 */
const notifyDeliveryStatusChange = async (
  delivery: { id: string; orderId: string; order: { orderNumber: string; customerId: string } },
  status: string,
): Promise<void> => {
  const { orderNumber, customerId } = delivery.order;
  const metadata = { deliveryId: delivery.id, orderId: delivery.orderId, status };

  if (status === 'PICKED_UP') {
    await createNotification({
      userId: customerId,
      type: NotificationType.ORDER,
      title: 'Delivery on the way',
      message: `Your delivery for order ${orderNumber} is on the way.`,
      metadata: { ...metadata, event: 'DELIVERY_IN_TRANSIT' },
    });
  } else if (status === 'COMPLETED') {
    await createNotification({
      userId: customerId,
      type: NotificationType.ORDER,
      title: 'Order delivered',
      message: `Your order ${orderNumber} has been delivered.`,
      metadata: { ...metadata, event: 'DELIVERY_COMPLETED' },
    });
  } else {
    await createNotification({
      userId: customerId,
      type: NotificationType.ORDER,
      title: 'Delivery status updated',
      message: `Your delivery for order ${orderNumber} is now: ${getDeliveryStatusLabel(status)}.`,
      metadata: { ...metadata, event: 'DELIVERY_STATUS_CHANGED' },
    });
  }

  await notifyStaff({
    type: NotificationType.ORDER,
    title: 'Delivery status changed',
    message: `Delivery for order ${orderNumber} is now: ${getDeliveryStatusLabel(status)}.`,
    metadata: { ...metadata, event: status === 'COMPLETED' ? 'DELIVERY_COMPLETED' : 'DELIVERY_STATUS_CHANGED' },
  });
};

const buildOrderBy = (
  sortBy: DeliveryFilters['sortBy'],
  sortOrder: DeliveryFilters['sortOrder'],
): Prisma.DeliveryOrderByWithRelationInput => {
  const direction = sortOrder ?? 'desc';
  if (sortBy === 'scheduledDate') return { scheduledDate: direction };
  return { createdAt: direction };
};

/**
 * A search that reads as a date ("Sep 19", "2026-09-19", "09/19/2026", "19")
 * also matches the order date the Deliveries table shows for each row. Days
 * are Manila calendar days (see date-search.ts).
 */
const dateSearchWhere = (search: string): Prisma.DeliveryWhereInput[] => parseDateSearch(search).map((range) => ({ order: { createdAt: range } }));

/** The moderator's work queues on the Deliveries page, one per workflow stage. */
const deliveryStateWhere = (state: DeliveryFilters['deliveryState']): Prisma.DeliveryWhereInput => {
  if (!state) return {};
  if (state === 'awaiting_approval') return { deliveryStatus: ORDER_WORKFLOW_STATUSES.AWAITING_ORDER_APPROVAL };
  if (state === 'awaiting_quote') return { deliveryStatus: ORDER_WORKFLOW_STATUSES.AWAITING_QUOTE };
  if (state === 'awaiting_payment') return { deliveryStatus: ORDER_WORKFLOW_STATUSES.AWAITING_PAYMENT };
  if (state === 'to_book') return { lalamoveOrderId: null, deliveryStatus: { in: TO_BOOK_DELIVERY_STATUSES } };
  return { deliveryStatus: { in: deliveryStatusesForGroup(state) } };
};

export class DeliveryService {
  /**
   * "Order not found" -> 404. "Order already has a delivery" and "order is
   * CANCELLED" are both conflicts with the order's current state rather
   * than malformed input, so both use 409 - the same 400-vs-409 split
   * (validation vs. state conflict) established by the Request Approval
   * module.
   */
  async createDelivery(input: CreateDeliveryInput): Promise<DeliveryWithOrder> {
    const order = await prisma.order.findUnique({ where: { id: input.orderId }, include: { delivery: true } });
    if (!order) {
      throw new AppError('Order not found.', 404);
    }
    if (order.delivery) {
      throw new AppError('This order already has a delivery.', 409);
    }
    if (order.status === OrderStatus.CANCELLED) {
      throw new AppError('Cannot create a delivery for a cancelled order.', 409);
    }

    const delivery = await prisma.delivery.create({
      data: {
        orderId: input.orderId,
        address: input.address,
        scheduledDate: input.scheduledDate,
        courierName: input.courierName,
        trackingNumber: input.trackingNumber,
      },
      include: deliveryInclude,
    });
    await mirrorDeliveryToBackup(delivery, null, 'manual delivery creation');

    await createNotification({
      userId: order.customerId,
      type: NotificationType.SYSTEM,
      title: 'Delivery created',
      message: `A delivery has been created for your order ${order.orderNumber}.`,
      metadata: { deliveryId: delivery.id, orderId: order.id, event: 'DELIVERY_CREATED' },
    });

    return delivery;
  }

  /** CUSTOMER: deliveries for their own orders only. */
  async getMyDeliveries(customerId: string, filters: DeliveryFilters): Promise<PaginatedDeliveries> {
    return this.listDeliveries({ ...filters, customerId });
  }

  /** MODERATOR/OWNER: every delivery. */
  async getAllDeliveries(filters: DeliveryFilters): Promise<PaginatedDeliveries> {
    return this.listDeliveries(filters);
  }

  private async listDeliveries(filters: DeliveryFilters): Promise<PaginatedDeliveries> {
    const page = filters.page ?? DEFAULT_PAGE;
    const limit = filters.limit ?? DEFAULT_LIMIT;

    const where: Prisma.DeliveryWhereInput = {
      ...(filters.customerId ? { order: { customerId: filters.customerId } } : {}),
      ...(filters.status === 'delivered' ? { deliveredAt: { not: null } } : {}),
      ...(filters.status === 'scheduled' ? { deliveredAt: null } : {}),
      ...deliveryStateWhere(filters.deliveryState),
      ...(filters.search
        ? {
            OR: [
              { trackingNumber: { contains: filters.search, mode: 'insensitive' } },
              { courierName: { contains: filters.search, mode: 'insensitive' } },
              { address: { contains: filters.search, mode: 'insensitive' } },
              { lalamoveOrderId: { contains: filters.search, mode: 'insensitive' } },
              { order: { orderNumber: { contains: filters.search, mode: 'insensitive' } } },
              { order: { customer: { firstName: { contains: filters.search, mode: 'insensitive' } } } },
              { order: { customer: { lastName: { contains: filters.search, mode: 'insensitive' } } } },
              ...dateSearchWhere(filters.search),
            ],
          }
        : {}),
    };

    const [deliveries, total] = await Promise.all([
      prisma.delivery.findMany({
        where,
        include: deliveryInclude,
        orderBy: buildOrderBy(filters.sortBy, filters.sortOrder),
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.delivery.count({ where }),
    ]);

    return { deliveries, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  }

  async getDeliveryById(deliveryId: string, requesterId: string, requesterRole: UserRole): Promise<DeliveryWithOrder> {
    const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId }, include: deliveryInclude });
    if (!delivery) {
      throw new AppError('Delivery not found.', 404);
    }
    if (requesterRole === UserRole.CUSTOMER && delivery.order.customerId !== requesterId) {
      throw new AppError('Delivery not found.', 404);
    }
    return delivery;
  }

  /**
   * MODERATOR-only (enforced at the route level). `orderId` is never
   * accepted here - only courierName/trackingNumber/address/scheduledDate
   * are updatable, per the spec's explicit "Cannot change: orderId."
   * Fires a "Tracking number updated" notification when trackingNumber is
   * part of the request, and a "Delivery scheduled" notification when
   * scheduledDate is part of the request - both can fire from the same
   * call if both fields are included.
   */
  async updateDelivery(deliveryId: string, input: UpdateDeliveryInput): Promise<DeliveryWithOrder> {
    const existing = await prisma.delivery.findUnique({ where: { id: deliveryId }, include: deliveryInclude });
    if (!existing) {
      throw new AppError('Delivery not found.', 404);
    }

    const updated = await prisma.delivery.update({
      where: { id: deliveryId },
      data: {
        address: input.address,
        scheduledDate: input.scheduledDate,
        courierName: input.courierName,
        trackingNumber: input.trackingNumber,
      },
      include: deliveryInclude,
    });
    await mirrorDeliveryToBackup(updated, null, 'manual delivery update');

    if (input.trackingNumber !== undefined) {
      await createNotification({
        userId: existing.order.customerId,
        type: NotificationType.SYSTEM,
        title: 'Tracking number updated',
        message: `The tracking number for your order ${existing.order.orderNumber} has been updated.`,
        metadata: { deliveryId: updated.id, orderId: existing.order.id, event: 'TRACKING_NUMBER_UPDATED' },
      });
    }

    if (input.scheduledDate !== undefined) {
      await createNotification({
        userId: existing.order.customerId,
        type: NotificationType.SYSTEM,
        title: 'Delivery scheduled',
        message: `Your delivery for order ${existing.order.orderNumber} has been scheduled.`,
        metadata: { deliveryId: updated.id, orderId: existing.order.id, event: 'DELIVERY_SCHEDULED' },
      });
    }

    return updated;
  }

  async markDelivered(deliveryId: string): Promise<DeliveryWithOrder> {
    const delivered = await prisma.$transaction(async (tx) => {
      const delivery = await tx.delivery.findUnique({ where: { id: deliveryId }, include: deliveryInclude });
      if (!delivery) {
        throw new AppError('Delivery not found.', 404);
      }
      if (delivery.deliveredAt) {
        throw new AppError('This delivery has already been marked as delivered.', 409);
      }

      const updated = await tx.delivery.update({ where: { id: deliveryId }, data: { deliveredAt: new Date() }, include: deliveryInclude });

      await createNotification(
        {
          userId: delivery.order.customerId,
          type: NotificationType.SYSTEM,
          title: 'Delivery marked delivered',
          message: `Your order ${delivery.order.orderNumber} has been delivered.`,
          metadata: { deliveryId: updated.id, orderId: delivery.order.id, event: 'DELIVERY_MARKED_DELIVERED' },
        },
        tx,
      );

      return updated;
    });
    await mirrorDeliveryToBackup(delivered, null, 'marked delivered');
    return delivered;
  }

  /** MODERATOR-only. A delivered delivery is a completed record - deleting it is a 409 conflict, not a validation error. */
  async deleteDelivery(deliveryId: string): Promise<void> {
    const existing = await prisma.delivery.findUnique({ where: { id: deliveryId } });
    if (!existing) {
      throw new AppError('Delivery not found.', 404);
    }
    if (existing.deliveredAt) {
      throw new AppError('Cannot delete a delivery that has already been marked as delivered.', 409);
    }

    await prisma.delivery.delete({ where: { id: deliveryId } });
    // delivery_payments rows cascade with the delivery in the backup schema too.
    if (!(await deleteRecordFromBackup('deliveries', deliveryId))) {
      console.error(`[delivery] Backup delete of delivery ${deliveryId} failed; the next backup sync will not remove it.`);
    }
  }

  // ================================================================
  // DELIVERY WORKFLOW - part of the order lifecycle
  //
  //   CUSTOMER   places the order         (delivery record created with it)
  //   MODERATOR  approves the order       (order.service.ts#approveOrder)
  //   MODERATOR  selectVehicle            (shipping quote -> order total)
  //   CUSTOMER   pays products + shipping (ONE PayMongo GCash payment)
  //   PAYMONGO   webhook confirms payment (payment.service.ts -> "Ready to book")
  //   MODERATOR  selectVehicle / bookDelivery (real Lalamove order)
  //   LALAMOVE   webhook / refresh        (driver, in transit, delivered)
  //
  // The customer never requests delivery, picks a vehicle or books.
  // Route-level role checks live in delivery.routes.ts; every method below
  // re-checks the state it depends on, so calling an endpoint out of order
  // is refused rather than trusted.
  // ================================================================

  // ================================================================
  // LALAMOVE: VEHICLE SELECTION + BOOKING (moderator)
  // ================================================================

  /** The warehouse as a DeliveryLocation, for building a Lalamove pickup stop. Throws if it isn't fully configured yet - never a fabricated pickup point. */
  private warehouseAsDeliveryLocation(): DeliveryLocation {
    if (!isWarehouseConfigured()) {
      throw new AppError(
        'The delivery pickup location has not been configured yet. Set the PANELSCAN_WAREHOUSE_* environment variables before booking a delivery.',
        503,
      );
    }
    const w = lalamoveConfig.pickupLocation;
    return {
      addressLine1: w.addressLine1!,
      regionCode: '',
      regionName: '',
      provinceCode: null,
      provinceName: w.province,
      cityMunicipalityCode: '',
      cityMunicipalityName: w.city!,
      barangayCode: '',
      barangayName: w.barangay ?? '',
      postalCode: w.postalCode ?? '',
      formattedAddress: [w.addressLine1, w.barangay, w.city, w.province, w.postalCode, 'Philippines'].filter(Boolean).join(', '),
      recipientName: w.contactName,
      recipientPhone: normalizePhilippinePhone(w.contactPhone),
      latitude: w.latitude,
      longitude: w.longitude,
      geocodingStatus: 'not_required',
    };
  }

  /**
   * MODERATOR: the live Lalamove vehicle lineup for PanelScan's service
   * area. No made-up fallback list - if Lalamove can't be reached the
   * moderator is told so, because a vehicle key Lalamove doesn't offer
   * could never be booked anyway.
   */
  async getAvailableVehicleTypes(): Promise<LalamoveServiceType[]> {
    let services: LalamoveServiceType[];
    try {
      services = await lalamoveProvider.getAvailableServices();
    } catch (error) {
      await alertProviderError('Delivery API error', 'Lalamove vehicle list', error, {});
      if (error instanceof AppError) throw error;
      throw new AppError('Lalamove vehicle types could not be loaded. Please try again.', 503);
    }
    if (services.length === 0) {
      throw new AppError("Lalamove returned no vehicle types for PanelScan's delivery area.", 503);
    }
    return services;
  }

  /** The dropoff (the order's address snapshot with its map-pin coordinates) - never a guessed point. */
  private dropoffFor(order: { deliveryLocation: Prisma.JsonValue | null; customer: { firstName: string; lastName: string; phone: string | null } }): DeliveryLocation {
    const dropoff = order.deliveryLocation as unknown as DeliveryLocation | null;
    if (dropoff?.latitude == null || dropoff?.longitude == null) {
      throw new AppError('This order has no delivery coordinates yet. Set the dropoff coordinates before selecting a vehicle.', 400);
    }
    return {
      ...dropoff,
      recipientName: dropoff.recipientName || customerName(order.customer),
      recipientPhone: normalizePhilippinePhone(dropoff.recipientPhone || order.customer.phone || ''),
    };
  }

  private buildQuoteRequest(dropoff: DeliveryLocation, serviceType: string): DeliveryQuoteRequest {
    return { pickup: this.warehouseAsDeliveryLocation(), dropoff, serviceType, scheduleAt: null, specialRequests: [] };
  }

  /**
   * MODERATOR: gets a live, free Lalamove quotation for the chosen vehicle.
   *
   * Before the customer has paid, this IS the shipping quote: the fee
   * becomes the order's estimated shipping fee (Order.shippingFee), the
   * order total becomes products + shipping - the one amount PayMongo will
   * charge - and the customer is told payment is ready. It can be re-quoted
   * (e.g. a different vehicle) until the customer pays.
   *
   * After payment it only changes the vehicle to book: the amount the
   * customer paid is never changed here and nobody is charged again. Books
   * nothing and charges nothing either way.
   */
  async selectVehicle(
    orderId: string,
    actorId: string,
    serviceType: string,
    context: RequestAuditContext,
  ): Promise<{ delivery: DeliveryWithOrder; quotation: { amount: number; currency: string; serviceType: string; expiresAt: string; quotationId: string } }> {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { delivery: true, customer: true } });
    if (!order) {
      throw new AppError('Order not found.', 404);
    }
    if (order.status === OrderStatus.CANCELLED) {
      throw new AppError('Cannot arrange delivery for a cancelled order.', 400);
    }
    if (!order.moderatorApproved) {
      throw new AppError('Approve the order before getting a shipping quote.', 400);
    }
    if (!order.delivery) {
      throw new AppError('This order has no delivery record.', 404);
    }
    if (order.delivery.lalamoveOrderId) {
      throw new AppError(NOT_BOOKABLE_MESSAGE, 409);
    }
    if (order.delivery.deliveryStatus === 'BOOKING') {
      throw new AppError('A Lalamove booking for this delivery is in progress.', 409);
    }
    const deliveryId = order.delivery.id;

    const dropoff = this.dropoffFor(order);
    const quoteRequest = this.buildQuoteRequest(dropoff, serviceType);

    const services = await this.getAvailableVehicleTypes();
    const vehicle = services.find((service) => service.key === serviceType);
    if (!vehicle) {
      throw new AppError('That vehicle type is not offered by Lalamove in PanelScan\'s delivery area.', 400);
    }

    let quotation: DeliveryQuotationSnapshot;
    try {
      quotation = await lalamoveProvider.getQuotation(quoteRequest);
    } catch (error) {
      await prisma.activityLog.create({
        data: buildActivityLogData(actorId, ActivityAction.LALAMOVE_QUOTATION_FAILED, context, {
          orderId: order.id,
          deliveryId,
          serviceType,
          error: error instanceof AppError ? error.message : 'Unknown error',
        }),
      });
      await alertProviderError('Delivery API error', 'Lalamove quotation', error, { orderId: order.id, deliveryId });
      throw error;
    }

    const vehicleLabel = vehicleDisplayName(vehicle);
    const quotedFee = new Prisma.Decimal(quotation.amount.toFixed(2));
    const wasQuoted = Boolean(order.delivery.quotedAt);

    // The payment is re-read inside the transaction so a PayMongo webhook
    // landing mid-quote can never leave a paid order "awaiting payment" with
    // a changed total.
    const { updated, isPaid } = await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.findUnique({ where: { orderId: order.id }, select: { status: true } });
      const paid = payment?.status === PaymentStatus.PAID || payment?.status === PaymentStatus.REFUNDED;
      const current = await tx.delivery.findUniqueOrThrow({ where: { id: deliveryId } });
      const metadata = (current.providerMetadata as Prisma.JsonObject | null) ?? {};

      if (!paid) {
        await tx.order.update({ where: { id: order.id }, data: { shippingFee: quotedFee, totalAmount: order.subtotal.add(quotedFee) } });
      }
      const delivery = await tx.delivery.update({
        where: { id: deliveryId },
        data: {
          vehicleType: serviceType,
          deliveryStatus: paid ? ORDER_WORKFLOW_STATUSES.READY_TO_BOOK : ORDER_WORKFLOW_STATUSES.AWAITING_PAYMENT,
          ...(paid ? {} : { quotedAt: new Date() }),
          bookingError: null,
          bookingFailedAt: null,
          providerMetadata: {
            ...metadata,
            vehicleType: serviceType,
            vehicleLabel,
            vehicleSelectedAt: new Date().toISOString(),
            vehicleSelectedBy: actorId,
            pendingQuotation: quotation as unknown as Prisma.JsonObject,
          } as unknown as Prisma.JsonObject,
        },
        include: deliveryInclude,
      });
      return { updated: delivery, isPaid: paid };
    });

    await prisma.activityLog.createMany({
      data: [
        buildActivityLogData(actorId, ActivityAction.LALAMOVE_QUOTATION_REQUESTED, context, { orderId: order.id, deliveryId, serviceType, amount: quotation.amount, paid: isPaid }),
        buildActivityLogData(actorId, ActivityAction.DELIVERY_VEHICLE_SELECTED, context, { orderId: order.id, deliveryId, serviceType }),
      ],
    });
    await mirrorDeliveryToBackup(updated, actorId, isPaid ? 'vehicle selection' : 'shipping quote');

    const metadata = { deliveryId, orderId: order.id, serviceType };
    if (isPaid) {
      await notifyStaff({
        type: NotificationType.ORDER,
        title: 'Vehicle selected',
        message: `${vehicleLabel} selected for order ${order.orderNumber} (current Lalamove quote ${formatPeso(quotation.amount)}).`,
        metadata: { ...metadata, event: 'DELIVERY_VEHICLE_SELECTED' },
        excludeUserIds: [actorId],
      });
    } else {
      const total = formatPeso(Number(order.subtotal.add(quotedFee)));
      await createNotification({
        userId: order.customerId,
        type: NotificationType.PAYMENT,
        title: wasQuoted ? 'Shipping fee updated - payment required' : 'Shipping fee ready - payment required',
        message: `Your estimated shipping fee for order ${order.orderNumber} is ${formatPeso(quotation.amount)}. Your total is ${total} (products ${formatPeso(Number(order.subtotal))} + shipping). Pay with GCash from your order to continue.`,
        metadata: { ...metadata, shippingFee: quotation.amount, event: 'SHIPPING_FEE_AVAILABLE' },
      });
      await notifyStaff({
        type: NotificationType.ORDER,
        title: 'Shipping quote ready',
        message: `Order ${order.orderNumber}: ${vehicleLabel}, estimated shipping fee ${formatPeso(quotation.amount)} (total ${total}). Waiting for the customer's GCash payment.`,
        metadata: { ...metadata, event: 'SHIPPING_QUOTE_READY' },
        excludeUserIds: [actorId],
      });
    }

    return {
      delivery: updated,
      quotation: { amount: quotation.amount, currency: quotation.currency, serviceType: quotation.serviceType, expiresAt: quotation.expiresAt, quotationId: quotation.quotationId },
    };
  }

  /**
   * MODERATOR: places the real, billable Lalamove booking for the vehicle
   * chosen in selectVehicle(), once the customer has paid products +
   * shipping. Uses the stored quotation while it's still valid, and
   * otherwise re-quotes the SAME vehicle first (Lalamove quotations only
   * live a few minutes). The final fee Lalamove returns is saved as
   * Delivery.shippingFee; the estimate the customer already paid
   * (Order.shippingFee) is never changed, and if the two differ staff are
   * told - the customer is never charged again.
   *
   * Guarded by a BOOKING status lock so two clicks (or two moderators)
   * can't place two Lalamove orders. On any failure the delivery is left
   * unbooked (status BOOKING_FAILED, no fee, no tracking link) and the
   * moderator can retry.
   */
  async bookDelivery(orderId: string, actorId: string, context: RequestAuditContext): Promise<DeliveryWithOrder> {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { delivery: true, customer: true, payment: true } });
    if (!order) {
      throw new AppError('Order not found.', 404);
    }
    if (order.status === OrderStatus.CANCELLED) {
      throw new AppError('Cannot book delivery for a cancelled order.', 400);
    }
    if (!order.moderatorApproved) {
      throw new AppError('Approve the order before booking.', 400);
    }
    if (!order.delivery) {
      throw new AppError('This order has no delivery record.', 404);
    }
    if (order.delivery.lalamoveOrderId) {
      throw new AppError(NOT_BOOKABLE_MESSAGE, 409);
    }
    if (order.payment?.status !== PaymentStatus.PAID) {
      throw new AppError('The customer has not paid this order yet. Book Lalamove once the payment (products + shipping) is confirmed.', 400);
    }
    const vehicleType = order.delivery.vehicleType;
    if (!vehicleType) {
      throw new AppError('Select a Lalamove vehicle before booking.', 400);
    }
    const dropoff = this.dropoffFor(order);
    const quoteRequest = this.buildQuoteRequest(dropoff, vehicleType);
    const deliveryId = order.delivery.id;

    const lock = await prisma.delivery.updateMany({
      where: {
        id: deliveryId,
        lalamoveOrderId: null,
        OR: [{ deliveryStatus: null }, { deliveryStatus: { not: 'BOOKING' } }, { updatedAt: { lt: new Date(Date.now() - STALE_BOOKING_LOCK_MS) } }],
      },
      data: { deliveryStatus: 'BOOKING' },
    });
    if (lock.count === 0) {
      throw new AppError('A Lalamove booking for this delivery is already in progress.', 409);
    }

    const metadata = (order.delivery.providerMetadata as Prisma.JsonObject | null) ?? {};
    const stored = metadata.pendingQuotation as unknown as StoredQuotation | undefined;
    const storedIsUsable = Boolean(stored && stored.serviceType === vehicleType && new Date(stored.expiresAt).getTime() - QUOTATION_EXPIRY_MARGIN_MS > Date.now());

    let placedLalamoveOrderId: string | null = null;
    try {
      const quotation: StoredQuotation = storedIsUsable ? stored! : await lalamoveProvider.getQuotation(quoteRequest);
      const [pickupStop, dropoffStop] = quotation.stops;
      if (!pickupStop || !dropoffStop) {
        throw new AppError('The Lalamove quotation is missing stop information.', 502);
      }

      const result = await lalamoveProvider.placeDeliveryOrder(
        quotation.quotationId,
        pickupStop.stopId,
        { stopId: dropoffStop.stopId, name: dropoff.recipientName!, phone: dropoff.recipientPhone! },
        order.id,
      );
      placedLalamoveOrderId = result.orderId;

      const shippingFee = result.priceBreakdown && result.priceBreakdown.total > 0 ? result.priceBreakdown.total : quotation.amount;
      const bookedAt = new Date();
      const vehicleLabel = typeof metadata.vehicleLabel === 'string' ? metadata.vehicleLabel : vehicleType;

      // The estimate the customer paid, when the fee was part of their payment
      // (orders paid before that change have none).
      const paidEstimate = order.delivery.quotedAt ? Number(order.shippingFee) : null;

      const { pendingQuotation: _usedQuotation, ...remainingMetadata } = metadata;
      await prisma.delivery.update({
        where: { id: deliveryId },
        data: {
          lalamoveOrderId: result.orderId,
          deliveryStatus: result.status,
          courierName: 'Lalamove',
          shippingFee,
          trackingUrl: result.shareLink,
          bookedAt,
          bookedById: actorId,
          bookingError: null,
          bookingFailedAt: null,
          providerMetadata: {
            ...remainingMetadata,
            bookingId: result.orderId,
            vehicleType,
            trackingUrl: result.shareLink ?? undefined,
            quotedAmount: quotation.amount,
            estimatedShippingFee: paidEstimate ?? undefined,
            feeCurrency: result.priceBreakdown?.currency ?? quotation.currency,
            bookedAt: bookedAt.toISOString(),
            bookedBy: actorId,
            lastSyncedAt: bookedAt.toISOString(),
          } as unknown as Prisma.JsonObject,
        },
      });

      const updated = await prisma.delivery.findUniqueOrThrow({ where: { id: deliveryId }, include: deliveryInclude });

      await prisma.activityLog.create({
        data: buildActivityLogData(actorId, ActivityAction.LALAMOVE_ORDER_PLACED, context, { orderId: order.id, deliveryId, lalamoveOrderId: result.orderId, shippingFee }),
      });
      await mirrorDeliveryToBackup(order.delivery, actorId, 'Lalamove booking');

      const baseMetadata = { deliveryId, orderId: order.id, lalamoveOrderId: result.orderId };
      await createNotification({
        userId: order.customerId,
        type: NotificationType.ORDER,
        title: 'Delivery booked',
        message: `Your delivery for order ${order.orderNumber} has been booked with Lalamove (${vehicleLabel}). You can track it from your order.`,
        metadata: { ...baseMetadata, event: 'DELIVERY_BOOKED' },
      });
      await notifyStaff({
        type: NotificationType.ORDER,
        title: 'Lalamove booking successful',
        message: `Order ${order.orderNumber} was booked with Lalamove (${vehicleLabel}, final fee ${formatPeso(shippingFee)}).`,
        metadata: { ...baseMetadata, event: 'DELIVERY_BOOKED' },
        excludeUserIds: [actorId],
      });
      if (paidEstimate !== null && Math.abs(shippingFee - paidEstimate) >= 0.005) {
        const difference = shippingFee - paidEstimate;
        await notifyStaff({
          type: NotificationType.PAYMENT,
          title: 'Final shipping fee differs from estimate',
          message: `Lalamove charged ${formatPeso(shippingFee)} for order ${order.orderNumber}; the customer paid an estimated ${formatPeso(paidEstimate)} (${difference > 0 ? 'PanelScan covers' : 'PanelScan keeps'} ${formatPeso(Math.abs(difference))}). The customer is not charged again.`,
          metadata: { ...baseMetadata, estimatedShippingFee: paidEstimate, finalShippingFee: shippingFee, event: 'SHIPPING_FEE_DIFFERENCE' },
        });
      }

      return updated;
    } catch (error) {
      if (placedLalamoveOrderId) {
        // Lalamove accepted the order but saving it here failed. Never mark
        // it BOOKING_FAILED - a retry would place a second, duplicate order.
        console.error(`[delivery] Lalamove order ${placedLalamoveOrderId} was placed but could not be saved for delivery ${deliveryId}:`, error);
        await prisma.delivery
          .update({ where: { id: deliveryId }, data: { lalamoveOrderId: placedLalamoveOrderId, deliveryStatus: 'ASSIGNING_DRIVER', bookedAt: new Date(), bookedById: actorId } })
          .catch((saveError: unknown) => console.error('[delivery] Fallback save of the Lalamove order id also failed:', saveError));
        throw new AppError(`The delivery was booked with Lalamove (booking ${placedLalamoveOrderId}), but saving the details failed. Use "Refresh status" to load the fee and tracking.`, 500);
      }
      const detail = error instanceof AppError ? error.message : 'Unknown error';
      // The stored quotation may be what Lalamove rejected - drop it so a
      // retry always re-quotes. vehicleType stays: the moderator's choice.
      const { pendingQuotation: _failedQuotation, ...remainingMetadata } = metadata;
      await prisma.delivery.update({
        where: { id: deliveryId },
        data: {
          deliveryStatus: 'BOOKING_FAILED',
          bookingError: detail,
          bookingFailedAt: new Date(),
          providerMetadata: remainingMetadata as Prisma.JsonObject,
        },
      });
      await prisma.activityLog.create({
        data: buildActivityLogData(actorId, ActivityAction.LALAMOVE_ORDER_PLACE_FAILED, context, { orderId: order.id, deliveryId, error: detail }),
      });
      await mirrorDeliveryToBackup(order.delivery, actorId, 'Lalamove booking failure');
      await alertProviderError('Delivery API error', 'Lalamove booking', error, { orderId: order.id, deliveryId });
      await notifyStaff({
        type: NotificationType.SYSTEM,
        title: 'Lalamove booking failed',
        message: `Lalamove booking for order ${order.orderNumber} failed: ${detail}`,
        metadata: { deliveryId, orderId: order.id, event: 'DELIVERY_BOOKING_FAILED' },
      });

      const statusCode = error instanceof AppError ? error.statusCode : 502;
      throw new AppError(`Lalamove booking failed. Please try again. (${detail})`, statusCode);
    }
  }

  // ================================================================
  // LEGACY SEPARATE SHIPPING-FEE PAYMENTS
  //
  // The shipping fee is part of the order total and paid in the same
  // PayMongo payment as the products (see selectVehicle). The handler below
  // only settles separate shipping-fee sessions opened under an earlier
  // flow, so an old checkout that still completes is recorded instead of
  // silently lost. No new session can reach it.
  // ================================================================

  /**
   * Applies one PayMongo webhook event for a delivery-fee Checkout Session -
   * routed here by payment.service.ts#handleWebhook via the "delivery:"
   * reference_number prefix (see paymongo.client.ts). Idempotent, matching
   * the product-payment webhook's own pattern. Legacy only.
   */
  async handleDeliveryFeeWebhook(deliveryId: string, eventType: 'payment.paid' | 'payment.failed', eventPaymentId: string | undefined): Promise<void> {
    const deliveryPayment = await prisma.deliveryPayment.findUnique({
      where: { deliveryId },
      include: { delivery: { include: deliveryInclude } },
    });
    if (!deliveryPayment) {
      return; // Not one of ours (or already deleted) - ack without error, per the product-payment webhook's established pattern.
    }

    if (eventType === 'payment.paid') {
      if (deliveryPayment.status === PaymentStatus.PAID) {
        return;
      }

      await prisma.deliveryPayment.update({
        where: { id: deliveryPayment.id },
        data: { status: PaymentStatus.PAID, paidAt: new Date(), transactionRef: eventPaymentId ?? deliveryPayment.transactionRef },
      });

      await createNotification({
        userId: deliveryPayment.delivery.order.customerId,
        type: NotificationType.PAYMENT,
        title: 'Delivery fee paid',
        message: `Your delivery fee for order ${deliveryPayment.delivery.order.orderNumber} has been paid.`,
        metadata: { deliveryId, orderId: deliveryPayment.delivery.order.id, event: 'DELIVERY_FEE_PAID' },
      });
      await notifyStaff({
        type: NotificationType.PAYMENT,
        title: 'Delivery fee paid',
        message: `GCash delivery fee received for order ${deliveryPayment.delivery.order.orderNumber}.`,
        metadata: { deliveryId, orderId: deliveryPayment.delivery.order.id, event: 'DELIVERY_FEE_PAID' },
      });

      await prisma.activityLog.create({
        data: buildActivityLogData(null, ActivityAction.DELIVERY_FEE_PAID, { ipAddress: null, userAgent: null }, { deliveryId, transactionRef: eventPaymentId }),
      });
      await mirrorDeliveryToBackup(deliveryPayment.delivery, null, 'shipping-fee payment confirmed');
      return;
    }

    // payment.failed - only downgrade a still-pending fee payment; never
    // overwrite an already-PAID one based on a possibly late/redelivered event.
    if (deliveryPayment.status === PaymentStatus.PENDING) {
      await prisma.deliveryPayment.update({
        where: { id: deliveryPayment.id },
        data: { status: PaymentStatus.FAILED, transactionRef: eventPaymentId ?? deliveryPayment.transactionRef },
      });

      await prisma.activityLog.create({
        data: buildActivityLogData(null, ActivityAction.DELIVERY_FEE_PAYMENT_FAILED, { ipAddress: null, userAgent: null }, { deliveryId }),
      });
      await mirrorDeliveryToBackup(deliveryPayment.delivery, null, 'shipping-fee payment failed');

      const { order } = deliveryPayment.delivery;
      await createNotification({
        userId: order.customerId,
        type: NotificationType.PAYMENT,
        title: 'Delivery fee payment failed',
        message: `Your delivery fee payment for order ${order.orderNumber} did not go through. You can try again from your order.`,
        metadata: { deliveryId, orderId: order.id, event: 'DELIVERY_FEE_PAYMENT_FAILED' },
      });
      await notifyStaff({
        type: NotificationType.PAYMENT,
        title: 'Payment failed',
        message: `A GCash delivery-fee payment for order ${order.orderNumber} failed.`,
        metadata: { deliveryId, orderId: order.id, event: 'DELIVERY_FEE_PAYMENT_FAILED' },
        roles: [UserRole.MODERATOR],
      });
    }
  }

  /**
   * Pulls live status, driver details and the share link from Lalamove and
   * syncs them onto the record. Read-only against Lalamove, so OWNER may
   * call it too. A missing share link is not an error - tracking often
   * appears a little after the booking.
   */
  async refreshDeliveryStatus(deliveryId: string, requesterId: string, requesterRole: UserRole, context: RequestAuditContext): Promise<DeliveryWithOrder> {
    const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId }, include: deliveryInclude });
    if (!delivery) {
      throw new AppError('Delivery not found.', 404);
    }
    if (requesterRole === UserRole.CUSTOMER && delivery.order.customerId !== requesterId) {
      throw new AppError('Delivery not found.', 404);
    }
    if (!delivery.lalamoveOrderId) {
      throw new AppError('This delivery has not been booked with the delivery provider yet.', 400);
    }

    try {
      const result = await lalamoveProvider.getOrder(delivery.lalamoveOrderId);
      const metadata = (delivery.providerMetadata as Prisma.JsonObject | null) ?? {};
      const previousStatus = delivery.deliveryStatus;

      let driverPatch: Record<string, unknown> = {};
      if (result.driverId) {
        try {
          const driver = await lalamoveProvider.getDriverDetails(delivery.lalamoveOrderId, result.driverId);
          driverPatch = { driverId: driver.driverId, driverName: driver.name, driverPhone: driver.phone, driverPlateNumber: driver.plateNumber, driverPhotoUrl: driver.photoUrl };
        } catch (driverError) {
          console.error('[delivery] Booked driver assigned, but driver details could not be fetched:', driverError);
        }
      }

      const trackingUrl = result.shareLink ?? delivery.trackingUrl;
      // Backfills the fee for a booking saved without one (e.g. bookDelivery's fallback save).
      const shippingFee = delivery.shippingFee === null && result.priceBreakdown && result.priceBreakdown.total > 0 ? result.priceBreakdown.total : undefined;
      const updated = await prisma.delivery.update({
        where: { id: deliveryId },
        data: {
          deliveryStatus: result.status,
          deliveredAt: result.status === 'COMPLETED' && !delivery.deliveredAt ? new Date() : delivery.deliveredAt,
          trackingUrl,
          ...(shippingFee !== undefined ? { shippingFee } : {}),
          providerMetadata: { ...metadata, ...driverPatch, trackingUrl: trackingUrl ?? undefined, lastSyncedAt: new Date().toISOString() } as unknown as Prisma.JsonObject,
        },
        include: deliveryInclude,
      });

      await prisma.activityLog.create({
        data: buildActivityLogData(requesterId, ActivityAction.LALAMOVE_STATUS_REFRESHED, context, { deliveryId, lalamoveOrderId: delivery.lalamoveOrderId, status: result.status }),
      });
      await mirrorDeliveryToBackup(delivery, requesterId, 'Lalamove status refresh');

      if (previousStatus !== result.status) {
        await notifyDeliveryStatusChange(delivery, result.status);
      }

      return updated;
    } catch (error) {
      await prisma.activityLog.create({
        data: buildActivityLogData(requesterId, ActivityAction.LALAMOVE_STATUS_REFRESH_FAILED, context, {
          deliveryId,
          lalamoveOrderId: delivery.lalamoveOrderId,
          error: error instanceof AppError ? error.message : 'Unknown error',
        }),
      });
      await alertProviderError('Delivery API error', 'Lalamove status refresh', error, { deliveryId });
      throw error;
    }
  }

  /** MODERATOR-only (OWNER stays view-only). Cancels the real Lalamove order; Lalamove itself rejects this once a driver has picked up, and that rejection surfaces to the caller unchanged. */
  async cancelLalamoveBooking(deliveryId: string, requesterId: string, context: RequestAuditContext): Promise<DeliveryWithOrder> {
    const delivery = await prisma.delivery.findUnique({ where: { id: deliveryId }, include: deliveryInclude });
    if (!delivery) {
      throw new AppError('Delivery not found.', 404);
    }
    if (!delivery.lalamoveOrderId) {
      throw new AppError('This delivery has not been booked with the delivery provider yet.', 400);
    }
    if (delivery.deliveryStatus === 'COMPLETED') {
      throw new AppError('This delivery has already been completed and cannot be cancelled.', 409);
    }

    try {
      await lalamoveProvider.cancelOrder(delivery.lalamoveOrderId);

      const updated = await prisma.delivery.update({ where: { id: deliveryId }, data: { deliveryStatus: 'CANCELED' }, include: deliveryInclude });

      await prisma.activityLog.create({
        data: buildActivityLogData(requesterId, ActivityAction.LALAMOVE_ORDER_CANCELLED, context, { deliveryId, lalamoveOrderId: delivery.lalamoveOrderId }),
      });
      await mirrorDeliveryToBackup(delivery, requesterId, 'Lalamove booking cancellation');

      await createNotification({
        userId: delivery.order.customerId,
        type: NotificationType.ORDER,
        title: 'Delivery cancelled',
        message: `The delivery for order ${delivery.order.orderNumber} has been cancelled.`,
        metadata: { deliveryId, orderId: delivery.orderId, event: 'DELIVERY_CANCELLED' },
      });
      await notifyStaff({
        type: NotificationType.ORDER,
        title: 'Delivery cancelled',
        message: `The Lalamove booking for order ${delivery.order.orderNumber} was cancelled.`,
        metadata: { deliveryId, orderId: delivery.orderId, event: 'DELIVERY_CANCELLED' },
        excludeUserIds: [requesterId],
      });

      return updated;
    } catch (error) {
      await prisma.activityLog.create({
        data: buildActivityLogData(requesterId, ActivityAction.LALAMOVE_ORDER_CANCEL_FAILED, context, {
          deliveryId,
          lalamoveOrderId: delivery.lalamoveOrderId,
          error: error instanceof AppError ? error.message : 'Unknown error',
        }),
      });
      await alertProviderError('Delivery API error', 'Lalamove cancellation', error, { deliveryId });
      throw error;
    }
  }

  /**
   * MODERATOR-only fallback: manually sets the dropoff coordinates of an
   * older order placed before saved-address map pins existed (new orders
   * carry the customer's own pin - see order.service.ts#snapshotSavedAddress). Written into Order.deliveryLocation (the single
   * place this system already keeps a customer's structured delivery
   * address), not a separate field, so every other read path picks it up
   * automatically.
   */
  async setDeliveryCoordinates(orderId: string, requesterId: string, latitude: number, longitude: number, context: RequestAuditContext): Promise<void> {
    const order = await prisma.order.findUnique({ where: { id: orderId }, select: { id: true, deliveryLocation: true } });
    if (!order) {
      throw new AppError('Order not found.', 404);
    }
    if (!order.deliveryLocation || typeof order.deliveryLocation !== 'object') {
      throw new AppError('This order has no structured delivery address to attach coordinates to.', 400);
    }

    const nextLocation = {
      ...(order.deliveryLocation as Prisma.JsonObject),
      latitude,
      longitude,
      geocodingStatus: 'completed',
      geocodingProvider: 'manual',
    } as unknown as Prisma.JsonObject;

    const updatedOrder = await prisma.order.update({ where: { id: orderId }, data: { deliveryLocation: nextLocation } });

    await prisma.activityLog.create({
      data: buildActivityLogData(requesterId, ActivityAction.DELIVERY_COORDINATES_SET, context, { orderId, latitude, longitude }),
    });

    await mirrorOrderToBackup(updatedOrder.id, requesterId, 'manual delivery-coordinates fix');
  }

  /** Admin visibility into failed provider calls (quotation/booking/refresh/cancel) - what the spec calls "Failed API requests." */
  async getFailedProviderRequests(filters: { page?: number; limit?: number }) {
    const page = filters.page ?? DEFAULT_PAGE;
    const limit = filters.limit ?? DEFAULT_LIMIT;
    const where: Prisma.ActivityLogWhereInput = { action: { startsWith: 'LALAMOVE_', endsWith: '_FAILED' } };

    const [logs, total] = await Promise.all([
      prisma.activityLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.activityLog.count({ where }),
    ]);

    return { logs, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  }

  /**
   * Applies one Lalamove webhook event. Idempotent by design: re-delivering
   * the same event just re-applies the same status/driver fields, and only
   * an actual status change notifies anyone. An event for an order this
   * system doesn't recognize is acknowledged (not errored), so Lalamove
   * doesn't retry something this system can't act on.
   */
  async handleLalamoveWebhook(eventType: string, lalamoveOrderId: string | undefined, data: Record<string, unknown>): Promise<void> {
    if (!lalamoveOrderId) {
      await prisma.activityLog.create({ data: buildActivityLogData(null, ActivityAction.LALAMOVE_WEBHOOK_RECEIVED, SYSTEM_CONTEXT, { eventType, unrecognized: true }) });
      return;
    }

    const delivery = await prisma.delivery.findUnique({ where: { lalamoveOrderId }, include: deliveryInclude });
    if (!delivery) {
      return; // Not one of ours (or already deleted) - ack without error, per PayMongo's established pattern.
    }

    const previousStatus = delivery.deliveryStatus;
    const metadata = (delivery.providerMetadata as Prisma.JsonObject | null) ?? {};
    // `data` is the webhook's whole `data` object - order fields (including
    // `status`) may be nested under `data.order` or, for some event types,
    // sit at the top level; `driver` is always a sibling of `order`, not
    // nested inside it (see delivery.controller.ts#webhook).
    const orderInfo = (data.order as Record<string, unknown> | undefined) ?? data;
    const nextStatus = typeof orderInfo.status === 'string' ? orderInfo.status : previousStatus;
    const shareLink = typeof orderInfo.shareLink === 'string' && orderInfo.shareLink ? orderInfo.shareLink : null;
    const trackingUrl = shareLink ?? delivery.trackingUrl;

    const driverData = data.driver as Record<string, unknown> | undefined;
    const driverPatch = driverData
      ? {
          driverId: typeof driverData.driverId === 'string' ? driverData.driverId : metadata.driverId,
          driverName: typeof driverData.name === 'string' ? driverData.name : metadata.driverName,
          driverPhone: typeof driverData.phone === 'string' ? driverData.phone : metadata.driverPhone,
          driverPlateNumber: typeof driverData.plateNumber === 'string' ? driverData.plateNumber : metadata.driverPlateNumber,
        }
      : {};

    await prisma.delivery.update({
      where: { id: delivery.id },
      data: {
        deliveryStatus: nextStatus,
        deliveredAt: nextStatus === 'COMPLETED' && !delivery.deliveredAt ? new Date() : delivery.deliveredAt,
        trackingUrl,
        providerMetadata: { ...metadata, ...driverPatch, trackingUrl: trackingUrl ?? undefined, lastWebhookEvent: eventType, lastSyncedAt: new Date().toISOString() } as unknown as Prisma.JsonObject,
      },
    });

    await prisma.activityLog.create({
      data: buildActivityLogData(null, ActivityAction.LALAMOVE_WEBHOOK_RECEIVED, SYSTEM_CONTEXT, { eventType, lalamoveOrderId, deliveryId: delivery.id }),
    });
    await mirrorDeliveryToBackup(delivery, null, 'Lalamove webhook');

    if (nextStatus && nextStatus !== previousStatus) {
      await notifyDeliveryStatusChange(delivery, nextStatus);
    }
  }
}

export const deliveryService = new DeliveryService();
