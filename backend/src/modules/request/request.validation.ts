import { RequestStatus, RequestType } from '@prisma/client';
import { z } from 'zod';

const NUMERIC_STRING = /^\d+$/;
const DATE_STRING = /^\d{4}-\d{2}-\d{2}$/;

export const createRequestSchema = z.object({
  body: z.object({
    type: z.nativeEnum(RequestType, { errorMap: () => ({ message: 'Invalid request type.' }) }),
    title: z.string().trim().min(3, 'Title must be at least 3 characters.').max(150, 'Title is too long.'),
    description: z.string().trim().max(2000, 'Description is too long.').optional(),
  }),
});

export const updateRequestSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid request id.') }),
  body: z
    .object({
      type: z.nativeEnum(RequestType, { errorMap: () => ({ message: 'Invalid request type.' }) }).optional(),
      title: z.string().trim().min(3, 'Title must be at least 3 characters.').max(150, 'Title is too long.').optional(),
      description: z.string().trim().max(2000, 'Description is too long.').optional(),
    })
    .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided.' }),
});

export const reviewRequestSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid request id.') }),
  body: z.object({
    reviewNote: z.string().trim().min(3, 'Review note must be at least 3 characters.').max(1000, 'Review note is too long.').optional(),
  }),
});

export const idParamsSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid request id.') }),
});

export const listRequestsSchema = z.object({
  query: z.object({
    page: z.string().regex(NUMERIC_STRING, 'page must be a positive integer.').optional(),
    limit: z.string().regex(NUMERIC_STRING, 'limit must be a positive integer.').optional(),
    status: z.nativeEnum(RequestStatus, { errorMap: () => ({ message: 'Invalid request status.' }) }).optional(),
    type: z.nativeEnum(RequestType, { errorMap: () => ({ message: 'Invalid request type.' }) }).optional(),
    requestedById: z.string().uuid('Invalid requestedBy id.').optional(),
    reviewedById: z.string().uuid('Invalid reviewedBy id.').optional(),
    dateFrom: z.string().regex(DATE_STRING, 'dateFrom must be in YYYY-MM-DD format.').optional(),
    dateTo: z.string().regex(DATE_STRING, 'dateTo must be in YYYY-MM-DD format.').optional(),
    search: z.string().trim().min(1, 'Search query cannot be empty.').max(150, 'Search query is too long.').optional(),
    sortBy: z.enum(['title', 'createdAt', 'reviewedAt']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  }),
});

export type CreateRequestInput = z.infer<typeof createRequestSchema>['body'];
export type UpdateRequestInput = z.infer<typeof updateRequestSchema>['body'];
export type ReviewRequestInput = z.infer<typeof reviewRequestSchema>['body'];
