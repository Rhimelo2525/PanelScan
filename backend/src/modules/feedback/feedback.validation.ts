import { z } from 'zod';

const NUMERIC_STRING = /^\d+$/;
const RATING_STRING = /^[1-5]$/;
const DATE_STRING = /^\d{4}-\d{2}-\d{2}$/;

export const createFeedbackSchema = z.object({
  body: z.object({
    orderId: z.string().uuid('Invalid order id.'),
    rating: z
      .number({ invalid_type_error: 'Rating must be a number.' })
      .int('Rating must be a whole number.')
      .min(1, 'Rating must be between 1 and 5.')
      .max(5, 'Rating must be between 1 and 5.'),
    comment: z.string().trim().min(3, 'Comment must be at least 3 characters.').max(1000, 'Comment is too long.').optional(),
  }),
});

export const updateFeedbackSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid feedback id.') }),
  body: z
    .object({
      rating: z
        .number({ invalid_type_error: 'Rating must be a number.' })
        .int('Rating must be a whole number.')
        .min(1, 'Rating must be between 1 and 5.')
        .max(5, 'Rating must be between 1 and 5.')
        .optional(),
      comment: z.string().trim().min(3, 'Comment must be at least 3 characters.').max(1000, 'Comment is too long.').optional(),
    })
    .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided.' }),
});

export const idParamsSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid feedback id.') }),
});

export const orderParamsSchema = z.object({
  params: z.object({ orderId: z.string().uuid('Invalid order id.') }),
});

export const productParamsSchema = z.object({
  params: z.object({ productId: z.string().uuid('Invalid product id.') }),
});

const listQueryObject = z.object({
  page: z.string().regex(NUMERIC_STRING, 'page must be a positive integer.').optional(),
  limit: z.string().regex(NUMERIC_STRING, 'limit must be a positive integer.').optional(),
  rating: z.string().regex(RATING_STRING, 'rating must be an integer between 1 and 5.').optional(),
  customerId: z.string().uuid('Invalid customer id.').optional(),
  orderId: z.string().uuid('Invalid order id.').optional(),
  productId: z.string().uuid('Invalid product id.').optional(),
  dateFrom: z.string().regex(DATE_STRING, 'dateFrom must be in YYYY-MM-DD format.').optional(),
  dateTo: z.string().regex(DATE_STRING, 'dateTo must be in YYYY-MM-DD format.').optional(),
  sort: z.enum(['asc', 'desc']).optional(),
  search: z.string().trim().min(1, 'Search query cannot be empty.').max(150, 'Search query is too long.').optional(),
});

export const listFeedbackSchema = z.object({ query: listQueryObject });

export const orderFeedbackSchema = z.object({
  params: z.object({ orderId: z.string().uuid('Invalid order id.') }),
});

export const productFeedbackSchema = z.object({
  params: z.object({ productId: z.string().uuid('Invalid product id.') }),
  query: listQueryObject.omit({ productId: true }),
});

export type CreateFeedbackInput = z.infer<typeof createFeedbackSchema>['body'];
export type UpdateFeedbackInput = z.infer<typeof updateFeedbackSchema>['body'];
