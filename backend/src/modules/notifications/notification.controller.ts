import type { NotificationType } from '@prisma/client';
import type { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { catchAsync } from '../../utils/catchAsync';
import { sendSuccess } from '../../utils/response';
import { NotificationService, notificationService } from './notification.service';
import type { NotificationFilters } from './notification.types';

interface Requester {
  id: string;
}

const getRequester = (req: Request): Requester => {
  if (!req.user) {
    throw new AppError('Authentication required.', 401);
  }
  return { id: req.user.id };
};

const parseNotificationFilters = (query: Request['query']): NotificationFilters => ({
  page: typeof query.page === 'string' ? Number(query.page) : undefined,
  limit: typeof query.limit === 'string' ? Number(query.limit) : undefined,
  isRead: typeof query.isRead === 'string' ? query.isRead === 'true' : undefined,
  type: typeof query.type === 'string' ? (query.type as NotificationType) : undefined,
  sort: query.sort === 'asc' || query.sort === 'desc' ? query.sort : undefined,
  search: typeof query.search === 'string' ? query.search : undefined,
});

export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  getNotifications = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const result = await this.notificationService.getNotifications(requester.id, parseNotificationFilters(req.query));
    sendSuccess(res, 200, 'Notifications retrieved successfully.', result);
  });

  getUnreadCount = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const count = await this.notificationService.getUnreadCount(requester.id);
    sendSuccess(res, 200, 'Unread count retrieved successfully.', { count });
  });

  markAsRead = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const notification = await this.notificationService.markAsRead(req.params.id as string, requester.id);
    sendSuccess(res, 200, 'Notification marked as read.', { notification });
  });

  markAllAsRead = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const count = await this.notificationService.markAllAsRead(requester.id);
    sendSuccess(res, 200, 'All notifications marked as read.', { count });
  });

  deleteNotification = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    await this.notificationService.deleteNotification(req.params.id as string, requester.id);
    sendSuccess(res, 200, 'Notification deleted successfully.');
  });
}

export const notificationController = new NotificationController(notificationService);
