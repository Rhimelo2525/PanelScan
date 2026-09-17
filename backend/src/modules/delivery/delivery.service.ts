import { NotificationType, OrderStatus, Prisma, UserRole } from '@prisma/client';

import { prisma } from '../../config/database';
import { createNotification } from '../notifications/notification.service';
import { AppError } from '../../utils/AppError';
import { deliveryInclude } from './delivery.types';
import type { DeliveryFilters, DeliveryWithOrder, PaginatedDeliveries } from './delivery.types';
import type { CreateDeliveryInput, UpdateDeliveryInput } from './delivery.validation';

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
}

export const deliveryService = new DeliveryService();
