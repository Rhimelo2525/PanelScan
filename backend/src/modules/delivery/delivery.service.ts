import { DeliveryApprovalStatus, NotificationType, OrderStatus, Prisma, UserRole } from '@prisma/client';

import { prisma } from '../../config/database';
import { createNotification } from '../notifications/notification.service';
import { AppError } from '../../utils/AppError';
import { deliveryInclude } from './delivery.types';
import type { DeliveryFilters, DeliveryWithOrder, PaginatedDeliveries } from './delivery.types';
import type { CreateDeliveryInput, UpdateDeliveryInput } from './delivery.validation';
import { lalamoveProvider } from './providers/lalamove.provider';

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
}

export const deliveryService = new DeliveryService();
