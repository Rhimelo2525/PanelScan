import { UserRole } from '@prisma/client';
import type { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { catchAsync } from '../../utils/catchAsync';
import { sendSuccess } from '../../utils/response';
import { ArService, arService } from './ar.service';
import type { MeasurementFilters } from './ar.types';

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
const parseMeasurementFilters = (query: Request['query']): MeasurementFilters => ({
  page: typeof query.page === 'string' ? Number(query.page) : undefined,
  limit: typeof query.limit === 'string' ? Number(query.limit) : undefined,
  customerId: typeof query.customerId === 'string' ? query.customerId : undefined,
  dateFrom: typeof query.dateFrom === 'string' ? new Date(`${query.dateFrom}T00:00:00.000Z`) : undefined,
  dateTo: typeof query.dateTo === 'string' ? new Date(`${query.dateTo}T23:59:59.999Z`) : undefined,
  search: typeof query.search === 'string' ? query.search : undefined,
});

export class ArController {
  constructor(private readonly arService: ArService) {}

  create = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const measurement = await this.arService.createMeasurement(requester.id, req.body);
    sendSuccess(res, 201, 'Measurement created successfully.', { measurement });
  });

  /** CUSTOMER: own measurements only. MODERATOR/OWNER: every measurement. */
  getAll = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const filters = parseMeasurementFilters(req.query);
    const result =
      requester.role === UserRole.CUSTOMER
        ? await this.arService.getMyMeasurements(requester.id, filters)
        : await this.arService.getAllMeasurements(filters);
    sendSuccess(res, 200, 'Measurements retrieved successfully.', result);
  });

  getById = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const measurement = await this.arService.getMeasurementById(req.params.id as string, requester.id, requester.role);
    sendSuccess(res, 200, 'Measurement retrieved successfully.', { measurement });
  });

  update = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const measurement = await this.arService.updateOwnMeasurement(req.params.id as string, requester.id, req.body);
    sendSuccess(res, 200, 'Measurement updated successfully.', { measurement });
  });

  remove = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    await this.arService.deleteOwnMeasurement(req.params.id as string, requester.id);
    sendSuccess(res, 200, 'Measurement deleted successfully.');
  });

  estimate = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const result = await this.arService.estimatePanels(requester.id, requester.role, req.body);
    sendSuccess(res, 200, 'Panel estimate calculated successfully.', result);
  });
}

export const arController = new ArController(arService);
