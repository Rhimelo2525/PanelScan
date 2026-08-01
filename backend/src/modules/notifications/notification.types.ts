import type { Notification, NotificationType, Prisma, PrismaClient } from '@prisma/client';

/** Accepts either the top-level PrismaClient or a $transaction callback's client, so createNotification() works both inside and outside an existing transaction. */
export type NotificationDbClient = PrismaClient | Prisma.TransactionClient;

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Prisma.InputJsonValue;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface NotificationFilters {
  page?: number;
  limit?: number;
  isRead?: boolean;
  type?: NotificationType;
  sort?: 'asc' | 'desc';
  search?: string;
}

export interface PaginatedNotifications {
  notifications: Notification[];
  pagination: PaginationMeta;
}
