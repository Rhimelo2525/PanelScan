import { z } from 'zod';

const NUMERIC_STRING = /^\d+$/;

export const createDeliverySchema = z.object({
  body: z.object({
    orderId: z.string().uuid('Invalid order id.'),
    address: z.string().trim().min(10, 'Address must be at least 10 characters.').max(500, 'Address is too long.'),
    scheduledDate: z.coerce
      .date({ errorMap: () => ({ message: 'A valid scheduledDate is required.' }) })
      .refine((date) => date.getTime() > Date.now(), { message: 'scheduledDate must be in the future.' }),
    courierName: z.string().trim().min(2, 'Courier name must be at least 2 characters.').max(150, 'Courier name is too long.').optional(),
    trackingNumber: z.string().trim().min(2, 'Tracking number must be at least 2 characters.').max(100, 'Tracking number is too long.').optional(),
  }),
});

export const updateDeliverySchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid delivery id.') }),
  body: z
    .object({
      address: z.string().trim().min(10, 'Address must be at least 10 characters.').max(500, 'Address is too long.').optional(),
      scheduledDate: z.coerce.date({ errorMap: () => ({ message: 'scheduledDate must be a valid date.' }) }).optional(),
      courierName: z.string().trim().min(2, 'Courier name must be at least 2 characters.').max(150, 'Courier name is too long.').optional(),
      trackingNumber: z
        .string()
        .trim()
        .min(2, 'Tracking number must be at least 2 characters.')
        .max(100, 'Tracking number is too long.')
        .optional(),
    })
    .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided.' }),
});

export const idParamsSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid delivery id.') }),
});

export const listDeliveriesSchema = z.object({
  query: z.object({
    page: z.string().regex(NUMERIC_STRING, 'page must be a positive integer.').optional(),
    limit: z.string().regex(NUMERIC_STRING, 'limit must be a positive integer.').optional(),
    search: z.string().trim().min(1, 'Search query cannot be empty.').max(150, 'Search query is too long.').optional(),
    status: z.enum(['scheduled', 'delivered'], { errorMap: () => ({ message: 'status must be "scheduled" or "delivered".' }) }).optional(),
    sortBy: z.enum(['scheduledDate', 'createdAt']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  }),
});

export type CreateDeliveryInput = z.infer<typeof createDeliverySchema>['body'];
export type UpdateDeliveryInput = z.infer<typeof updateDeliverySchema>['body'];
