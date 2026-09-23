import { DeliveryApprovalStatus, NotificationType, OrderStatus, PaymentStatus, Prisma, UserRole } from '@prisma/client';

import { env } from '../../config/env';
import { prisma } from '../../config/database';
import { createNotification } from '../notifications/notification.service';
import { ActivityAction, buildActivityLogData, type RequestAuditContext } from '../../utils/activityLog';
import { AppError } from '../../utils/AppError';
import { DELIVERY_FEE_REFERENCE_PREFIX, createPaymongoCheckoutSession } from '../payment/paymongo.client';
import type { DeliveryLocation, DeliveryQuoteRequest, LalamoveServiceType } from './delivery.domain';
import { deliveryInclude } from './delivery.types';
import type { DeliveryFilters, DeliveryWithOrder, PaginatedDeliveries } from './delivery.types';
import type { CreateDeliveryInput, UpdateDeliveryInput } from './delivery.validation';
import { isWarehouseConfigured, lalamoveConfig } from './providers/lalamove.config';
import { lalamoveProvider } from './providers/lalamove.provider';
import { deliveryStatusesForGroup, getDeliveryStatusLabel } from './utils/lalamove-status';
import { normalizePhilippinePhone } from './utils/phone-normalizer';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

const buildOrderBy = (
  sortBy: DeliveryFilters['sortBy'],
  sortOrder: DeliveryFilters['sortOrder'],
): Prisma.DeliveryOrderByWithRelationInput => {
  const direction = sortOrder ?? 'desc';
  if (sortBy === 'scheduledDate') return { scheduledDate: direction };
  return { createdAt: direction };
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
      ...(filters.deliveryState ? { deliveryStatus: { in: deliveryStatusesForGroup(filters.deliveryState) } } : {}),
      ...(filters.search
        ? {
            OR: [
              { trackingNumber: { contains: filters.search, mode: 'insensitive' } },
              { courierName: { contains: filters.search, mode: 'insensitive' } },
              { address: { contains: filters.search, mode: 'insensitive' } },
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
    return prisma.$transaction(async (tx) => {
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
  }

  /**
   * Arranges delivery for an order by authorized staff (MODERATOR/OWNER).
   * Strictly enforces business rules:
   * 1. Order must exist and not be CANCELLED.
   * 2. Order must have been approved by Moderator (moderatorApproved = true).
   * 3. Order must be fully paid (payment.status = PAID).
   * 4. Prepares Lalamove delivery stop and integration metadata.
   */
  async arrangeDeliveryForOrder(orderId: string, actorId: string, actorRole: UserRole): Promise<DeliveryWithOrder> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { delivery: true, payment: true, customer: true },
    });

    if (!order) {
      throw new AppError('Order not found.', 404);
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new AppError('Cannot arrange delivery for a cancelled order.', 409);
    }

    if (!order.moderatorApproved) {
      throw new AppError('Order must be approved by a moderator before arranging delivery.', 400);
    }

    if (!order.payment || order.payment.status !== 'PAID') {
      throw new AppError('Order must be fully paid before arranging delivery.', 400);
    }

    if (order.delivery && order.delivery.approvalStatus !== DeliveryApprovalStatus.APPROVED) {
      throw new AppError('Delivery request must be approved by PanelScan staff before arranging delivery.', 400);
    }

    if (order.delivery && order.delivery.deliveredAt) {
      throw new AppError('Order has already been delivered.', 409);
    }

    // Prepare delivery stop details for Lalamove readiness
    let destinationStop: any = null;
    if (order.deliveryLocation && typeof order.deliveryLocation === 'object') {
      try {
        const loc = order.deliveryLocation as any;
        destinationStop = lalamoveProvider.buildDeliveryStop({
          ...loc,
          recipientName: loc.recipientName || `${order.customer.firstName} ${order.customer.lastName}`,
          recipientPhone: loc.recipientPhone || order.customer.phone || undefined,
        });
      } catch (err) {
        // Fall back gracefully if structured location fails formatting
      }
    }

    // Log provider action safely server-side
    lalamoveProvider.logProviderAction('DELIVERY_ARRANGED', order.id, {
      actorId,
      actorRole,
      hasStructuredLocation: Boolean(destinationStop),
      shippingAddress: order.shippingAddress,
    });

    const deliveryData = {
      courierName: 'Lalamove',
      deliveryProvider: 'LALAMOVE',
      deliveryStatus: 'PREPARING',
      address: order.shippingAddress,
      providerMetadata: {
        provider: 'LALAMOVE',
        arrangedBy: actorId,
        arrangedAt: new Date().toISOString(),
        destinationStop: destinationStop || undefined,
      },
    };

    let deliveryRecord: DeliveryWithOrder;
    if (order.delivery) {
      deliveryRecord = await prisma.delivery.update({
        where: { id: order.delivery.id },
        data: deliveryData,
        include: deliveryInclude,
      });
    } else {
      deliveryRecord = await prisma.delivery.create({
        data: {
          orderId: order.id,
          ...deliveryData,
        },
        include: deliveryInclude,
      });
    }

    await createNotification({
      userId: order.customerId,
      type: NotificationType.SYSTEM,
      title: 'Delivery is being prepared',
      message: `Your order ${order.orderNumber} is being prepared for Lalamove courier dispatch.`,
      metadata: { deliveryId: deliveryRecord.id, orderId: order.id, event: 'DELIVERY_PREPARING' },
    });

    return deliveryRecord;
  }

  /**
   * CUSTOMER action: Requests delivery for an order.
   * Enforces:
   * 1. Order exists and belongs to the authenticated customer.
   * 2. Order is not cancelled.
   * 3. No conflicting delivery request already exists (PENDING_APPROVAL or APPROVED).
   * 4. If previously DECLINED, customer can re-request (resets to PENDING_APPROVAL).
   * 5. Does NOT create a Lalamove booking.
   */
  async requestDelivery(orderId: string, customerId: string): Promise<DeliveryWithOrder> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { delivery: true },
    });

    if (!order) {
      throw new AppError('Order not found.', 404);
    }

    if (order.customerId !== customerId) {
      throw new AppError('You do not have permission to request delivery for this order.', 403);
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new AppError('Cannot request delivery for a cancelled order.', 400);
    }

    if (order.delivery) {
      if (order.delivery.approvalStatus === DeliveryApprovalStatus.PENDING_APPROVAL) {
        throw new AppError('A delivery request for this order is already awaiting approval.', 409);
      }
      if (order.delivery.approvalStatus === DeliveryApprovalStatus.APPROVED) {
        throw new AppError('Delivery request has already been approved for this order.', 409);
      }
      if (order.delivery.deliveredAt) {
        throw new AppError('This order has already been delivered.', 409);
      }

      // Re-requesting after decline or transition from NOT_REQUESTED
      const updated = await prisma.delivery.update({
        where: { id: order.delivery.id },
        data: {
          approvalStatus: DeliveryApprovalStatus.PENDING_APPROVAL,
          requestedAt: new Date(),
          approvedAt: null,
          approvedById: null,
          declinedAt: null,
          declineReason: null,
        },
        include: deliveryInclude,
      });

      await createNotification({
        userId: order.customerId,
        type: NotificationType.ORDER,
        title: 'Delivery request submitted',
        message: `Your delivery request for order ${order.orderNumber} has been submitted and is awaiting approval.`,
        metadata: { deliveryId: updated.id, orderId: order.id, event: 'DELIVERY_REQUESTED' },
      });

      return updated;
    }

    const delivery = await prisma.delivery.create({
      data: {
        orderId: order.id,
        address: order.shippingAddress,
        approvalStatus: DeliveryApprovalStatus.PENDING_APPROVAL,
        requestedAt: new Date(),
        deliveryStatus: 'NOT_SCHEDULED',
        deliveryProvider: 'LALAMOVE',
      },
      include: deliveryInclude,
    });

    await createNotification({
      userId: order.customerId,
      type: NotificationType.ORDER,
      title: 'Delivery request submitted',
      message: `Your delivery request for order ${order.orderNumber} has been submitted and is awaiting approval.`,
      metadata: { deliveryId: delivery.id, orderId: order.id, event: 'DELIVERY_REQUESTED' },
    });

    return delivery;
  }

  /**
   * MODERATOR / OWNER action: Approves a customer's delivery request.
   * Enforces:
   * 1. Order exists and is not cancelled.
   * 2. Delivery record exists and is in PENDING_APPROVAL status.
   * 3. Records approved timestamp and approver ID.
   * 4. DOES NOT automatically create a Lalamove booking.
   */
  async approveDeliveryRequest(orderId: string, actorId: string): Promise<DeliveryWithOrder> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { delivery: true },
    });

    if (!order) {
      throw new AppError('Order not found.', 404);
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new AppError('Cannot approve delivery for a cancelled order.', 400);
    }

    if (!order.delivery) {
      throw new AppError('No delivery request exists for this order.', 404);
    }

    if (order.delivery.approvalStatus === DeliveryApprovalStatus.APPROVED) {
      throw new AppError('Delivery request has already been approved.', 400);
    }

    if (order.delivery.approvalStatus !== DeliveryApprovalStatus.PENDING_APPROVAL) {
      throw new AppError('Delivery request must be in pending approval state.', 400);
    }

    const updated = await prisma.delivery.update({
      where: { id: order.delivery.id },
      data: {
        approvalStatus: DeliveryApprovalStatus.APPROVED,
        approvedAt: new Date(),
        approvedById: actorId,
        declinedAt: null,
        declineReason: null,
      },
      include: deliveryInclude,
    });

    await createNotification({
      userId: order.customerId,
      type: NotificationType.ORDER,
      title: 'Delivery request approved',
      message: `Your delivery request for order ${order.orderNumber} has been approved by PanelScan. You may now proceed with delivery.`,
      metadata: { deliveryId: updated.id, orderId: order.id, event: 'DELIVERY_REQUEST_APPROVED' },
    });

    return updated;
  }

  /**
   * MODERATOR / OWNER action: Declines a customer's delivery request with optional reason.
   */
  async declineDeliveryRequest(orderId: string, actorId: string, reason?: string): Promise<DeliveryWithOrder> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { delivery: true },
    });

    if (!order) {
      throw new AppError('Order not found.', 404);
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new AppError('Cannot decline delivery for a cancelled order.', 400);
    }

    if (!order.delivery) {
      throw new AppError('No delivery request exists for this order.', 404);
    }

    if (order.delivery.approvalStatus === DeliveryApprovalStatus.DECLINED) {
      throw new AppError('Delivery request has already been declined.', 400);
    }

    if (order.delivery.approvalStatus !== DeliveryApprovalStatus.PENDING_APPROVAL) {
      throw new AppError('Delivery request must be in pending approval state to decline.', 400);
    }

    const trimmedReason = reason?.trim() || null;

    const updated = await prisma.delivery.update({
      where: { id: order.delivery.id },
      data: {
        approvalStatus: DeliveryApprovalStatus.DECLINED,
        declinedAt: new Date(),
        declineReason: trimmedReason,
      },
      include: deliveryInclude,
    });

    await createNotification({
      userId: order.customerId,
      type: NotificationType.ORDER,
      title: 'Delivery request declined',
      message: `Your delivery request for order ${order.orderNumber} was not approved.${trimmedReason ? ` Reason: ${trimmedReason}` : ''}`,
      metadata: { deliveryId: updated.id, orderId: order.id, declinedById: actorId, event: 'DELIVERY_REQUEST_DECLINED' },
    });

    return updated;
  }

  /**
   * CUSTOMER action: Proceed with delivery after approval.
   * STRICT BACKEND RULE: Blocked if approvalStatus !== APPROVED.
   * Prepares context for future Lalamove quotation and booking.
   */
  async proceedWithDelivery(
    orderId: string,
    customerId: string,
  ): Promise<{ success: boolean; message: string; orderId: string; delivery: DeliveryWithOrder }> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { delivery: { include: deliveryInclude }, customer: true },
    });

    if (!order) {
      throw new AppError('Order not found.', 404);
    }

    if (order.customerId !== customerId) {
      throw new AppError('You do not have permission to proceed with delivery for this order.', 403);
    }

    if (order.status === OrderStatus.CANCELLED) {
      throw new AppError('This order has been cancelled and cannot proceed with delivery.', 400);
    }

    if (!order.delivery || order.delivery.approvalStatus !== DeliveryApprovalStatus.APPROVED) {
      throw new AppError('Delivery request must be approved by PanelScan staff before proceeding.', 400);
    }

    return {
      success: true,
      message: 'Delivery proceeding authorized. Ready for Lalamove integration.',
      orderId: order.id,
      delivery: order.delivery,
    };
  }

  // ================================================================
  // LIVE LALAMOVE INTEGRATION
  //
  // All of this still sits behind the same approval gate as before:
  // requestDelivery -> approveDeliveryRequest are unchanged prerequisites.
  // Only once approvalStatus === APPROVED can a quotation be requested, and
  // only a still-valid quotation can be turned into a real booking.
  // ================================================================

  /** The warehouse as a DeliveryLocation, for building a Lalamove pickup stop. Throws if it isn't fully configured yet - never a fabricated pickup point. */
  private warehouseAsDeliveryLocation(): DeliveryLocation {
    if (!isWarehouseConfigured()) {
      throw new AppError(
        'The delivery pickup location has not been configured yet. Set the PANELSCAN_WAREHOUSE_* environment variables before requesting a quotation.',
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

  /** Live vehicle lineup for the quotation UI. Falls back to a small static PH list if the provider call fails, so the dropdown is never empty - the fallback is clearly marked as such in the log, never silently passed off as live data. */
  async getAvailableVehicleTypes(): Promise<LalamoveServiceType[]> {
    try {
      const services = await lalamoveProvider.getAvailableServices();
      if (services.length > 0) return services;
    } catch (error) {
      console.error('[delivery] Could not fetch live Lalamove vehicle types, using fallback list:', error);
    }
    return [
      { key: 'MOTORCYCLE', description: 'Motorcycle', maxWeightKg: 20, dimensionsMeters: null },
      { key: 'SEDAN', description: 'Sedan', maxWeightKg: 200, dimensionsMeters: null },
      { key: 'MPV', description: 'MPV', maxWeightKg: 300, dimensionsMeters: null },
      { key: 'VAN', description: 'Van', maxWeightKg: 700, dimensionsMeters: null },
      { key: 'TRUCK550', description: 'Truck (small)', maxWeightKg: 1000, dimensionsMeters: null },
    ];
  }

  private ownsOrderOrIsStaff(order: { customerId: string }, requesterId: string, requesterRole: UserRole): void {
    if (requesterRole === UserRole.CUSTOMER && order.customerId !== requesterId) {
      throw new AppError('You do not have permission to manage delivery for this order.', 403);
    }
  }

  /**
   * Requests a live, free, non-committal quotation from Lalamove and stores
   * it (with the provider's stop ids) on the delivery record so a later
   * confirmBooking() call can redeem it without trusting anything the client
   * sends back. Returns only the safe summary a customer should see.
   */
  async requestQuotation(
    orderId: string,
    requesterId: string,
    requesterRole: UserRole,
    serviceType: string,
    context: RequestAuditContext,
  ): Promise<{ amount: number; currency: string; serviceType: string; expiresAt: string; quotationId: string }> {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { delivery: true, customer: true } });
    if (!order) {
      throw new AppError('Order not found.', 404);
    }
    this.ownsOrderOrIsStaff(order, requesterId, requesterRole);

    if (order.status === OrderStatus.CANCELLED) {
      throw new AppError('Cannot request a quotation for a cancelled order.', 400);
    }
    if (!order.delivery || order.delivery.approvalStatus !== DeliveryApprovalStatus.APPROVED) {
      throw new AppError('Delivery request must be approved by PanelScan staff before requesting a quotation.', 400);
    }

    const dropoffLocation = order.deliveryLocation as unknown as DeliveryLocation | null;
    if (!dropoffLocation?.latitude || !dropoffLocation?.longitude) {
      throw new AppError(
        'Delivery coordinates for this order have not been set yet. A PanelScan staff member needs to set them before a quotation can be requested.',
        400,
      );
    }

    const quoteRequest: DeliveryQuoteRequest = {
      pickup: this.warehouseAsDeliveryLocation(),
      dropoff: {
        ...dropoffLocation,
        recipientName: dropoffLocation.recipientName || `${order.customer.firstName} ${order.customer.lastName}`,
        recipientPhone: normalizePhilippinePhone(dropoffLocation.recipientPhone || order.customer.phone || ''),
      },
      serviceType,
      scheduleAt: null,
      specialRequests: [],
    };

    try {
      const quotation = await lalamoveProvider.getQuotation(quoteRequest);

      await prisma.delivery.update({
        where: { id: order.delivery.id },
        data: {
          providerMetadata: {
            ...(order.delivery.providerMetadata as Prisma.JsonObject | null),
            pendingQuotation: quotation as unknown as Prisma.JsonObject,
          },
        },
      });

      await prisma.activityLog.create({
        data: buildActivityLogData(requesterId, ActivityAction.LALAMOVE_QUOTATION_REQUESTED, context, {
          orderId: order.id,
          deliveryId: order.delivery.id,
          serviceType,
          amount: quotation.amount,
        }),
      });

      return { amount: quotation.amount, currency: quotation.currency, serviceType: quotation.serviceType, expiresAt: quotation.expiresAt, quotationId: quotation.quotationId };
    } catch (error) {
      await prisma.activityLog.create({
        data: buildActivityLogData(requesterId, ActivityAction.LALAMOVE_QUOTATION_FAILED, context, {
          orderId: order.id,
          deliveryId: order.delivery.id,
          serviceType,
          error: error instanceof AppError ? error.message : 'Unknown error',
        }),
      });
      throw error;
    }
  }

  // ================================================================
  // DELIVERY-FEE PAYMENT
  //
  // Charges the customer for the delivery fee itself (DeliveryPayment) -
  // entirely separate from the product/order-total Payment in
  // payment.service.ts. Same PayMongo Checkout Session mechanism, reused
  // via paymongo.client.ts, but a second charge with its own record.
  // confirmBooking() below refuses to run until one of these has been
  // satisfied - see its own comment.
  // ================================================================

  /**
   * Shared precondition-loader for both fee-payment endpoints below: the
   * exact same "does a still-valid quotation exist" check confirmBooking()
   * itself makes, so a fee payment can never be started for a
   * quotation-less or already-expired delivery.
   */
  private async loadPendingQuotationForFee(orderId: string, requesterId: string, requesterRole: UserRole) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { delivery: { include: { deliveryPayment: true } }, customer: true },
    });
    if (!order) {
      throw new AppError('Order not found.', 404);
    }
    this.ownsOrderOrIsStaff(order, requesterId, requesterRole);

    if (!order.delivery || order.delivery.approvalStatus !== DeliveryApprovalStatus.APPROVED) {
      throw new AppError('Delivery request must be approved by PanelScan staff before paying the delivery fee.', 400);
    }
    if (order.delivery.lalamoveOrderId) {
      throw new AppError('This order has already been booked with the delivery provider.', 409);
    }

    const metadata = (order.delivery.providerMetadata as Prisma.JsonObject | null) ?? {};
    const pendingQuotation = metadata.pendingQuotation as
      | { quotationId: string; expiresAt: string; amount: number; currency: string; serviceType: string }
      | undefined;

    if (!pendingQuotation) {
      throw new AppError('No quotation is on file for this order. Please request a quotation first.', 400);
    }
    if (new Date(pendingQuotation.expiresAt).getTime() <= Date.now()) {
      throw new AppError('This quotation has expired. Please request a new one.', 400);
    }

    return { order, delivery: order.delivery, quotation: pendingQuotation };
  }

  /**
   * Opens a PayMongo GCash checkout session for exactly the delivery fee
   * shown in the still-valid quotation - never the product price, never a
   * value taken from the request body. Upserts a PENDING DeliveryPayment so
   * confirmBooking()'s gate has something to find once PayMongo confirms it
   * (see handleDeliveryFeeWebhook below).
   */
  async createFeeGcashCheckout(orderId: string, requesterId: string, requesterRole: UserRole, context: RequestAuditContext): Promise<{ checkoutUrl: string }> {
    const { order, delivery, quotation } = await this.loadPendingQuotationForFee(orderId, requesterId, requesterRole);
    const amountInCentavos = Math.round(quotation.amount * 100);

    const checkoutSession = await createPaymongoCheckoutSession({
      referenceNumber: `${DELIVERY_FEE_REFERENCE_PREFIX}${delivery.id}`,
      description: `Delivery fee for order ${order.orderNumber}`,
      amountInCentavos,
      lineItemName: `Delivery fee - ${quotation.serviceType}`,
      billing: {
        name: `${order.customer.firstName} ${order.customer.lastName}`,
        email: order.customer.email,
        phone: order.customer.phone ?? undefined,
      },
      successUrl: env.DELIVERY_PAYMENT_SUCCESS_URL,
      cancelUrl: env.DELIVERY_PAYMENT_CANCEL_URL,
      paymentMethodTypes: ['gcash'],
    });

    await prisma.deliveryPayment.upsert({
      where: { deliveryId: delivery.id },
      update: { status: PaymentStatus.PENDING, method: 'PayMongo', amount: quotation.amount, transactionRef: checkoutSession.id },
      create: { deliveryId: delivery.id, status: PaymentStatus.PENDING, method: 'PayMongo', amount: quotation.amount, transactionRef: checkoutSession.id },
    });

    await prisma.activityLog.create({
      data: buildActivityLogData(requesterId, ActivityAction.DELIVERY_FEE_CHECKOUT_CREATED, context, { orderId: order.id, deliveryId: delivery.id, amount: quotation.amount }),
    });

    return { checkoutUrl: checkoutSession.attributes.checkout_url };
  }

  /**
   * Records Cash on Delivery for the delivery fee - the rider collects it in
   * person at drop-off (see the wallet/COD explanation given earlier); no
   * PayMongo session, nothing charged now. Still gates confirmBooking() the
   * same way a PAID GCash fee does - a real choice was made, not skipped.
   */
  async selectFeeCash(orderId: string, requesterId: string, requesterRole: UserRole, context: RequestAuditContext): Promise<{ amount: number }> {
    const { order, delivery, quotation } = await this.loadPendingQuotationForFee(orderId, requesterId, requesterRole);

    await prisma.deliveryPayment.upsert({
      where: { deliveryId: delivery.id },
      update: { status: PaymentStatus.PENDING, method: 'Cash', amount: quotation.amount, transactionRef: null },
      create: { deliveryId: delivery.id, status: PaymentStatus.PENDING, method: 'Cash', amount: quotation.amount },
    });

    await prisma.activityLog.create({
      data: buildActivityLogData(requesterId, ActivityAction.DELIVERY_FEE_CASH_SELECTED, context, { orderId: order.id, deliveryId: delivery.id, amount: quotation.amount }),
    });

    return { amount: quotation.amount };
  }

  /**
   * Applies one PayMongo webhook event for a delivery-fee Checkout Session -
   * routed here by payment.service.ts#handleWebhook via the "delivery:"
   * reference_number prefix (see paymongo.client.ts). Idempotent, matching
   * the product-payment webhook's own pattern. Deliberately does NOT place
   * the Lalamove booking itself - the customer still clicks "Book vehicle"
   * after being redirected back (see the web delivery-fee result page), so
   * a real, billable Lalamove order is never placed from an unattended
   * webhook call with no one there to see a failure.
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
        message: `Your delivery fee for order ${deliveryPayment.delivery.order.orderNumber} has been paid. You can now confirm your booking.`,
        metadata: { deliveryId, orderId: deliveryPayment.delivery.order.id, event: 'DELIVERY_FEE_PAID' },
      });

      await prisma.activityLog.create({
        data: buildActivityLogData(null, ActivityAction.DELIVERY_FEE_PAID, { ipAddress: null, userAgent: null }, { deliveryId, transactionRef: eventPaymentId }),
      });
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
    }
  }

  /**
   * Redeems a still-valid stored quotation into a real Lalamove booking.
   * Nothing about the stops or fee is taken from the request body - both
   * come from the quotation this service itself stored moments earlier.
   * Hard-gated on the delivery fee itself: refuses to run unless a
   * DeliveryPayment exists that is either Cash (any status - rider collects
   * in person) or PayMongo AND already PAID. This is enforced here, not
   * just hidden in the frontend, so a customer cannot reach a real,
   * billable Lalamove booking by calling this endpoint directly without
   * having paid or chosen Cash on Delivery.
   */
  async confirmBooking(orderId: string, requesterId: string, requesterRole: UserRole, context: RequestAuditContext): Promise<DeliveryWithOrder> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { delivery: { include: { deliveryPayment: true } }, customer: true },
    });
    if (!order) {
      throw new AppError('Order not found.', 404);
    }
    this.ownsOrderOrIsStaff(order, requesterId, requesterRole);

    if (!order.delivery || order.delivery.approvalStatus !== DeliveryApprovalStatus.APPROVED) {
      throw new AppError('Delivery request must be approved by PanelScan staff before booking.', 400);
    }
    if (order.delivery.lalamoveOrderId) {
      throw new AppError('This order has already been booked with the delivery provider.', 409);
    }

    const feePayment = order.delivery.deliveryPayment;
    if (!feePayment) {
      throw new AppError('The delivery fee must be paid via GCash, or Cash on Delivery selected, before booking.', 400);
    }
    if (feePayment.method !== 'Cash' && feePayment.status !== PaymentStatus.PAID) {
      throw new AppError('The delivery fee payment has not been confirmed yet. Please complete GCash payment first.', 400);
    }

    const metadata = (order.delivery.providerMetadata as Prisma.JsonObject | null) ?? {};
    const pendingQuotation = metadata.pendingQuotation as
      | { quotationId: string; expiresAt: string; stops: { stopId: string }[]; serviceType: string; amount: number; currency: string }
      | undefined;

    if (!pendingQuotation) {
      throw new AppError('No quotation is on file for this order. Please request a quotation first.', 400);
    }
    if (new Date(pendingQuotation.expiresAt).getTime() <= Date.now()) {
      throw new AppError('This quotation has expired. Please request a new one.', 400);
    }
    // The fee payment must match THIS quotation, not just any past one - a
    // customer who paid for a cheap vehicle, then requested a pricier one
    // (overwriting pendingQuotation) without paying again, must not be able
    // to book the pricier vehicle off the old payment. 1 centavo tolerance
    // for decimal rounding between the stored quotation and the Decimal
    // amount PayMongo/Cash recorded from it.
    if (Math.abs(Number(feePayment.amount) - pendingQuotation.amount) > 0.01) {
      throw new AppError('The delivery fee payment does not match the current quotation. Please pay the delivery fee again for this vehicle.', 400);
    }

    const dropoffLocation = order.deliveryLocation as unknown as DeliveryLocation | null;
    const recipientName = dropoffLocation?.recipientName || `${order.customer.firstName} ${order.customer.lastName}`;
    const recipientPhone = normalizePhilippinePhone(dropoffLocation?.recipientPhone || order.customer.phone || '');
    const [pickupStop, dropoffStop] = pendingQuotation.stops;
    if (!pickupStop || !dropoffStop) {
      throw new AppError('The stored quotation is missing stop information. Please request a new quotation.', 400);
    }

    try {
      const result = await lalamoveProvider.placeDeliveryOrder(pendingQuotation.quotationId, pickupStop.stopId, { stopId: dropoffStop.stopId, name: recipientName, phone: recipientPhone }, order.id);

      const updated = await prisma.delivery.update({
        where: { id: order.delivery.id },
        data: {
          lalamoveOrderId: result.orderId,
          deliveryStatus: result.status,
          courierName: 'Lalamove',
          providerMetadata: {
            ...metadata,
            pendingQuotation: undefined,
            bookingId: result.orderId,
            vehicleType: pendingQuotation.serviceType,
            trackingUrl: result.shareLink ?? undefined,
            bookedAt: new Date().toISOString(),
            bookedBy: requesterId,
            lastSyncedAt: new Date().toISOString(),
          } as unknown as Prisma.JsonObject,
        },
        include: deliveryInclude,
      });

      await prisma.activityLog.create({
        data: buildActivityLogData(requesterId, ActivityAction.LALAMOVE_ORDER_PLACED, context, { orderId: order.id, deliveryId: order.delivery.id, lalamoveOrderId: result.orderId }),
      });

      await createNotification({
        userId: order.customerId,
        type: NotificationType.ORDER,
        title: 'Delivery booked',
        message: `Your delivery for order ${order.orderNumber} has been booked with Lalamove. You can now track it live.`,
        metadata: { deliveryId: updated.id, orderId: order.id, lalamoveOrderId: result.orderId, event: 'DELIVERY_BOOKED' },
      });

      return updated;
    } catch (error) {
      await prisma.activityLog.create({
        data: buildActivityLogData(requesterId, ActivityAction.LALAMOVE_ORDER_PLACE_FAILED, context, {
          orderId: order.id,
          deliveryId: order.delivery.id,
          error: error instanceof AppError ? error.message : 'Unknown error',
        }),
      });
      throw error;
    }
  }

  /** Pulls live status (and, once assigned, driver details) from Lalamove and syncs them onto the delivery record. Read-only against Lalamove - safe to call as often as needed. */
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

      const updated = await prisma.delivery.update({
        where: { id: deliveryId },
        data: {
          deliveryStatus: result.status,
          deliveredAt: result.status === 'COMPLETED' && !delivery.deliveredAt ? new Date() : delivery.deliveredAt,
          providerMetadata: { ...metadata, ...driverPatch, trackingUrl: result.shareLink ?? metadata.trackingUrl, lastSyncedAt: new Date().toISOString() } as unknown as Prisma.JsonObject,
        },
        include: deliveryInclude,
      });

      await prisma.activityLog.create({
        data: buildActivityLogData(requesterId, ActivityAction.LALAMOVE_STATUS_REFRESHED, context, { deliveryId, lalamoveOrderId: delivery.lalamoveOrderId, status: result.status }),
      });

      if (previousStatus !== result.status) {
        await createNotification({
          userId: delivery.order.customerId,
          type: NotificationType.ORDER,
          title: 'Delivery status updated',
          message: `Your delivery for order ${delivery.order.orderNumber} is now: ${getDeliveryStatusLabel(result.status)}.`,
          metadata: { deliveryId, orderId: delivery.orderId, status: result.status, event: 'DELIVERY_STATUS_CHANGED' },
        });
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
      throw error;
    }
  }

  /** MODERATOR-only (matching every other mutating action in this module - OWNER stays read-only). Cancels the real Lalamove order; Lalamove itself rejects this once a driver has picked up, and that rejection surfaces to the caller unchanged. */
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

      await createNotification({
        userId: delivery.order.customerId,
        type: NotificationType.ORDER,
        title: 'Delivery cancelled',
        message: `The delivery for order ${delivery.order.orderNumber} has been cancelled.`,
        metadata: { deliveryId, orderId: delivery.orderId, event: 'DELIVERY_CANCELLED' },
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
      throw error;
    }
  }

  /**
   * MODERATOR/OWNER-only interim bridge: manually sets an order's dropoff
   * coordinates until a real geocoding provider is wired into
   * geocoding.service.ts. Written into Order.deliveryLocation (the single
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

    await prisma.order.update({ where: { id: orderId }, data: { deliveryLocation: nextLocation } });

    await prisma.activityLog.create({
      data: buildActivityLogData(requesterId, ActivityAction.DELIVERY_COORDINATES_SET, context, { orderId, latitude, longitude }),
    });
  }

  /** Admin visibility into failed provider calls (create/quotation/booking/refresh/cancel) - what the spec calls "Failed API requests." */
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
   * the same event just re-applies the same status/driver fields. An event
   * for an order this system doesn't recognize is acknowledged (not
   * errored), matching the webhook module's own guidance to avoid endless
   * retries for something this system can't act on.
   */
  async handleLalamoveWebhook(eventType: string, lalamoveOrderId: string | undefined, data: Record<string, unknown>): Promise<void> {
    if (!lalamoveOrderId) {
      await prisma.activityLog.create({ data: buildActivityLogData(null, ActivityAction.LALAMOVE_WEBHOOK_RECEIVED, { ipAddress: null, userAgent: null }, { eventType, unrecognized: true }) });
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
        providerMetadata: { ...metadata, ...driverPatch, lastWebhookEvent: eventType, lastSyncedAt: new Date().toISOString() } as unknown as Prisma.JsonObject,
      },
    });

    await prisma.activityLog.create({
      data: buildActivityLogData(null, ActivityAction.LALAMOVE_WEBHOOK_RECEIVED, { ipAddress: null, userAgent: null }, { eventType, lalamoveOrderId, deliveryId: delivery.id }),
    });

    if (nextStatus && nextStatus !== previousStatus) {
      await createNotification({
        userId: delivery.order.customerId,
        type: NotificationType.ORDER,
        title: 'Delivery status updated',
        message: `Your delivery for order ${delivery.order.orderNumber} is now: ${getDeliveryStatusLabel(nextStatus)}.`,
        metadata: { deliveryId: delivery.id, orderId: delivery.orderId, status: nextStatus, event: 'DELIVERY_STATUS_CHANGED' },
      });
    }
  }
}

export const deliveryService = new DeliveryService();
