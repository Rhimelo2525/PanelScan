import { ProjectStatus } from '@prisma/client';
import { z } from 'zod';

const NUMERIC_STRING = /^\d+$/;
const DATE_STRING = /^\d{4}-\d{2}-\d{2}$/;

const datesInOrder = (data: { startDate?: Date; endDate?: Date }): boolean =>
  !data.startDate || !data.endDate || data.endDate >= data.startDate;

export const createProjectSchema = z.object({
  body: z
    .object({
      customerId: z.string().uuid('Invalid customer id.'),
      moderatorId: z.string().uuid('Invalid moderator id.').optional(),
      name: z.string().trim().min(3, 'Name must be at least 3 characters.').max(150, 'Name is too long.'),
      description: z.string().trim().max(2000, 'Description is too long.').optional(),
      notes: z.string().trim().max(2000, 'Notes are too long.').optional(),
      budget: z.number().positive('Budget must be greater than 0.').optional(),
      startDate: z.coerce.date({ errorMap: () => ({ message: 'startDate must be a valid date.' }) }).optional(),
      endDate: z.coerce.date({ errorMap: () => ({ message: 'endDate must be a valid date.' }) }).optional(),
    })
    .refine(datesInOrder, { message: 'endDate cannot be before startDate.', path: ['endDate'] }),
});

export const updateProjectSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid project id.') }),
  body: z
    .object({
      name: z.string().trim().min(3, 'Name must be at least 3 characters.').max(150, 'Name is too long.').optional(),
      description: z.string().trim().max(2000, 'Description is too long.').optional(),
      notes: z.string().trim().max(2000, 'Notes are too long.').optional(),
      budget: z.number().positive('Budget must be greater than 0.').optional(),
      startDate: z.coerce.date({ errorMap: () => ({ message: 'startDate must be a valid date.' }) }).optional(),
      endDate: z.coerce.date({ errorMap: () => ({ message: 'endDate must be a valid date.' }) }).optional(),
    })
    .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided.' })
    .refine(datesInOrder, { message: 'endDate cannot be before startDate.', path: ['endDate'] }),
});

export const updateProjectStatusSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid project id.') }),
  body: z.object({
    status: z.nativeEnum(ProjectStatus, { errorMap: () => ({ message: 'Invalid project status.' }) }),
  }),
});

export const assignProjectSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid project id.') }),
  body: z
    .object({
      customerId: z.string().uuid('Invalid customer id.').optional(),
      moderatorId: z.string().uuid('Invalid moderator id.').optional(),
      ownerId: z.string().uuid('Invalid owner id.').optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
      message: 'At least one of customerId, moderatorId, or ownerId must be provided.',
    }),
});

export const idParamsSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid project id.') }),
});

export const listProjectsSchema = z.object({
  query: z.object({
    page: z.string().regex(NUMERIC_STRING, 'page must be a positive integer.').optional(),
    limit: z.string().regex(NUMERIC_STRING, 'limit must be a positive integer.').optional(),
    status: z.nativeEnum(ProjectStatus, { errorMap: () => ({ message: 'Invalid project status.' }) }).optional(),
    customerId: z.string().uuid('Invalid customer id.').optional(),
    moderatorId: z.string().uuid('Invalid moderator id.').optional(),
    ownerId: z.string().uuid('Invalid owner id.').optional(),
    dateFrom: z.string().regex(DATE_STRING, 'dateFrom must be in YYYY-MM-DD format.').optional(),
    dateTo: z.string().regex(DATE_STRING, 'dateTo must be in YYYY-MM-DD format.').optional(),
    search: z.string().trim().min(1, 'Search query cannot be empty.').max(150, 'Search query is too long.').optional(),
    sortBy: z.enum(['name', 'createdAt', 'startDate', 'endDate']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  }),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>['body'];
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>['body'];
export type AssignProjectInput = z.infer<typeof assignProjectSchema>['body'];
