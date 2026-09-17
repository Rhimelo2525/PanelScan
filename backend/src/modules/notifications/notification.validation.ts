import { NotificationType } from '@prisma/client';
import { z } from 'zod';

const NUMERIC_STRING = /^\d+$/;
const BOOLEAN_STRING = /^(true|false)$/;

export const idParamsSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid notification id.') }),
});

export const listNotificationsSchema = z.object({
  query: z.object({
    page: z.string().regex(NUMERIC_STRING, 'page must be a positive integer.').optional(),
    limit: z.string().regex(NUMERIC_STRING, 'limit must be a positive integer.').optional(),
    isRead: z.string().regex(BOOLEAN_STRING, 'isRead must be true or false.').optional(),
    type: z.nativeEnum(NotificationType, { errorMap: () => ({ message: 'Invalid notification type.' }) }).optional(),
    sort: z.enum(['asc', 'desc']).optional(),
    search: z.string().trim().min(1, 'Search query cannot be empty.').max(150, 'Search query is too long.').optional(),
  }),
});
