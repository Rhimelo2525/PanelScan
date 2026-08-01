import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { notificationController } from './notification.controller';
import { idParamsSchema, listNotificationsSchema } from './notification.validation';

const router = Router();

router.use(authenticate);

// GET /api/notifications/unread/count - registered before /:id-shaped routes
// so Express never tries to parse "unread" as a notification id.
router.get('/unread/count', notificationController.getUnreadCount);

// PATCH /api/notifications/read-all
router.patch('/read-all', notificationController.markAllAsRead);

// GET /api/notifications - every role sees only their own notifications.
router.get('/', validate(listNotificationsSchema), notificationController.getNotifications);

// PATCH /api/notifications/:id/read
router.patch('/:id/read', validate(idParamsSchema), notificationController.markAsRead);

// DELETE /api/notifications/:id
router.delete('/:id', validate(idParamsSchema), notificationController.deleteNotification);

export default router;
