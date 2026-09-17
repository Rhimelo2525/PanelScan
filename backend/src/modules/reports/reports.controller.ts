import { UserRole } from '@prisma/client';
import type { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { catchAsync } from '../../utils/catchAsync';
import { sendSuccess } from '../../utils/response';
import { ReportsService, reportsService } from './reports.service';
import type { DateRangeFilters, PaginatedListFilters } from './reports.types';

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

const parseStatusFilters = (query: Request['query']): DateRangeFilters & PaginatedListFilters & { status?: string } => ({
  ...parsePaginatedFilters(query),
  status: typeof query.status === 'string' ? query.status : undefined,
});

export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  getSales = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const report = await this.reportsService.getSalesReport(requester.role, parsePaginatedFilters(req.query));
    sendSuccess(res, 200, 'Sales report retrieved successfully.', report);
  });

  getInventory = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const report = await this.reportsService.getInventoryReport(requester.role, parsePaginatedFilters(req.query));
    sendSuccess(res, 200, 'Inventory report retrieved successfully.', report);
  });

  getOrders = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const report = await this.reportsService.getOrdersReport(requester.role, parseStatusFilters(req.query));
    sendSuccess(res, 200, 'Orders report retrieved successfully.', report);
  });

  getBookings = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const report = await this.reportsService.getBookingsReport(parseStatusFilters(req.query));
    sendSuccess(res, 200, 'Bookings report retrieved successfully.', report);
  });

  getProjects = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const report = await this.reportsService.getProjectsReport(requester.role, parseStatusFilters(req.query));
    sendSuccess(res, 200, 'Projects report retrieved successfully.', report);
  });
}

export const reportsController = new ReportsController(reportsService);
