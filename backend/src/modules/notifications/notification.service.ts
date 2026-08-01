import type { Notification, Prisma } from '@prisma/client';

import { prisma } from '../../config/database';
import { AppError } from '../../utils/AppError';
import type { CreateNotificationParams, NotificationDbClient, NotificationFilters, PaginatedNotifications } from './notification.types';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

/**
 * Creates a notification for a single user. Exported as a standalone
 * function (not a method other services call through a service instance)
 * so Order/Payment/Booking/Chat can trigger notifications with a single
 * import + one call, without introducing service-to-service coupling -
 * consistent with this codebase's existing pattern of reaching across
 * model boundaries directly via Prisma rather than through other services.
 * Accepts an optional `$transaction` client so callers already inside a
 * transaction can create the notification atomically with their own write.
 */
export const createNotification = async (
  params: CreateNotificationParams,
  client: NotificationDbClient = prisma,
): Promise<Notification> => {
  return client.notification.create({
    data: {
      userId: params.userId,
      type: params.type,
      title: params.title,
      message: params.message,
      metadata: params.metadata,
    },
  });
};

export class NotificationService {
  /** Every role only ever sees their own notifications - no "view all" mode exists for this module. */
  async getNotifications(userId: string, filters: NotificationFilters): Promise<PaginatedNotifications> {
    const page = filters.page ?? DEFAULT_PAGE;
    const limit = filters.limit ?? DEFAULT_LIMIT;
    const sort = filters.sort ?? 'desc';

    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(filters.isRead !== undefined ? { isRead: filters.isRead } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.search
        ? {
            OR: [
              { title: { contains: filters.search, mode: 'insensitive' } },
              { message: { contains: filters.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: sort },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({ where }),
    ]);

    return { notifications, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({ where: { userId, isRead: false } });
  }

  /** 404 (not 403) for a notification that exists but belongs to someone else, to avoid leaking notification-id existence to non-owners. */
  async markAsRead(notificationId: string, userId: string): Promise<Notification> {
    const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notification || notification.userId !== userId) {
      throw new AppError('Notification not found.', 404);
    }

    return prisma.notification.update({ where: { id: notificationId }, data: { isRead: true } });
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return result.count;
  }

  async deleteNotification(notificationId: string, userId: string): Promise<void> {
    const notification = await prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notification || notification.userId !== userId) {
      throw new AppError('Notification not found.', 404);
    }

    await prisma.notification.delete({ where: { id: notificationId } });
  }
}

export const notificationService = new NotificationService();
