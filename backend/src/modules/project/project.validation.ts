import { ProjectSource, ProjectStatus } from '@prisma/client';
import { z } from 'zod';

import { PROJECT_CODE_PATTERN } from './project.code';

const NUMERIC_STRING = /^\d+$/;
const DATE_STRING = /^\d{4}-\d{2}-\d{2}$/;

export const idParamsSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid project id.') }),
});

export const listProjectsSchema = z.object({
  query: z.object({
    page: z.string().regex(NUMERIC_STRING, 'page must be a positive integer.').optional(),
    limit: z.string().regex(NUMERIC_STRING, 'limit must be a positive integer.').optional(),
    status: z.nativeEnum(ProjectStatus, { errorMap: () => ({ message: 'Invalid project status.' }) }).optional(),
    source: z.nativeEnum(ProjectSource).optional(),
    externalProjectId: z.string().trim().optional(),
    customerId: z.string().uuid('Invalid customer id.').optional(),
    moderatorId: z.string().uuid('Invalid moderator id.').optional(),
    ownerId: z.string().uuid('Invalid owner id.').optional(),
    dateFrom: z.string().regex(DATE_STRING, 'dateFrom must be in YYYY-MM-DD format.').optional(),
    dateTo: z.string().regex(DATE_STRING, 'dateTo must be in YYYY-MM-DD format.').optional(),
    search: z.string().trim().min(1, 'Search query cannot be empty.').max(150, 'Search query is too long.').optional(),
    code: z.string().trim().regex(PROJECT_CODE_PATTERN, 'Enter a project code like PRJ-2026-1A2B3C4D.').optional(),
    sortBy: z.enum(['name', 'createdAt', 'startDate', 'endDate']).optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),
  }),
});

export const listProjectCustomersSchema = z.object({
  query: z.object({
    page: z.string().regex(NUMERIC_STRING, 'page must be a positive integer.').optional(),
    limit: z.string().regex(NUMERIC_STRING, 'limit must be a positive integer.').optional(),
    source: z.nativeEnum(ProjectSource).optional(),
    search: z.string().trim().min(1, 'Search query cannot be empty.').max(150, 'Search query is too long.').optional(),
  }),
});

/**
 * A project saved in the mobile app (AR measurement + panel estimate). The
 * app's own project id is the key, so saving the same project again updates it.
 */
export const mobileProjectSchema = z.object({
  body: z.object({
    externalProjectId: z.string().trim().min(1, 'Project id is required.').max(100, 'Project id is too long.'),
    name: z.string().trim().min(3, 'Name must be at least 3 characters.').max(150, 'Name is too long.'),
    description: z.string().trim().max(2000, 'Description is too long.').optional(),
    budget: z.number().positive('Budget must be greater than 0.').optional(),
    arMetadata: z.record(z.unknown()).optional(),
  }),
});

export const mobileProjectParamsSchema = z.object({
  params: z.object({
    externalProjectId: z.string().trim().min(1, 'Project id is required.').max(100, 'Project id is too long.'),
  }),
});

export type MobileProjectInput = z.infer<typeof mobileProjectSchema>['body'];
