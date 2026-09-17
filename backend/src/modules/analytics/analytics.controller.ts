import { UserRole } from '@prisma/client';
import type { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { catchAsync } from '../../utils/catchAsync';
import { sendSuccess } from '../../utils/response';
import { AnalyticsService, analyticsService } from './analytics.service';
import type { DateRangeFilters, PaginatedListFilters } from './analytics.types';

interface Requester {
  id: string;
  role: UserRole;
}

const getRequester = (req: Request): Requester => {
  if (!req.user) {
    throw new AppError('Authentication required.', 401);
  }
  return { id: req.user.id, role: req.user.role };
};

/**
 * `validate.middleware` only rewrites `req.body`, not `req.query` (query
 * values stay as raw strings even after Zod validation passes), so filters
 * are parsed here from the already-format-validated query string.
 */
const parseDateRangeFilters = (query: Request['query']): DateRangeFilters => ({
  dateFrom: typeof query.dateFrom === 'string' ? new Date(`${query.dateFrom}T00:00:00.000Z`) : undefined,
  dateTo: typeof query.dateTo === 'string' ? new Date(`${query.dateTo}T23:59:59.999Z`) : undefined,
});

const parsePaginatedFilters = (query: Request['query']): DateRangeFilters & PaginatedListFilters => ({
  ...parseDateRangeFilters(query),
  page: typeof query.page === 'string' ? Number(query.page) : undefined,
  limit: typeof query.limit === 'string' ? Number(query.limit) : undefined,
});

export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  getDashboard = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const stats = await this.analyticsService.getDashboard(requester.role);
    sendSuccess(res, 200, 'Dashboard analytics retrieved successfully.', stats);
  });

  getSales = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const stats = await this.analyticsService.getSalesAnalytics(requester.role, parseDateRangeFilters(req.query));
    sendSuccess(res, 200, 'Sales analytics retrieved successfully.', stats);
  });

  getProducts = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const stats = await this.analyticsService.getProductAnalytics(requester.role, parsePaginatedFilters(req.query));
    sendSuccess(res, 200, 'Product analytics retrieved successfully.', stats);
  });

  getCustomers = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const stats = await this.analyticsService.getCustomerAnalytics(requester.role, parsePaginatedFilters(req.query));
    sendSuccess(res, 200, 'Customer analytics retrieved successfully.', stats);
  });

  getProjects = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const stats = await this.analyticsService.getProjectAnalytics(requester.role, parsePaginatedFilters(req.query));
    sendSuccess(res, 200, 'Project analytics retrieved successfully.', stats);
  });
}

export const analyticsController = new AnalyticsController(analyticsService);
