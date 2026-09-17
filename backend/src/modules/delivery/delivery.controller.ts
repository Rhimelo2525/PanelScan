import { UserRole } from '@prisma/client';
import type { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { catchAsync } from '../../utils/catchAsync';
import { sendSuccess } from '../../utils/response';
import { DeliveryService, deliveryService } from './delivery.service';
import type { DeliveryFilters } from './delivery.types';

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
const parseDeliveryFilters = (query: Request['query']): DeliveryFilters => ({
  page: typeof query.page === 'string' ? Number(query.page) : undefined,
  limit: typeof query.limit === 'string' ? Number(query.limit) : undefined,
  search: typeof query.search === 'string' ? query.search : undefined,
  status: query.status === 'scheduled' || query.status === 'delivered' ? query.status : undefined,
  sortBy: query.sortBy === 'scheduledDate' || query.sortBy === 'createdAt' ? query.sortBy : undefined,
  sortOrder: query.sortOrder === 'asc' || query.sortOrder === 'desc' ? query.sortOrder : undefined,
});

export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  create = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const delivery = await this.deliveryService.createDelivery(req.body);
    sendSuccess(res, 201, 'Delivery created successfully.', { delivery });
  });

  /** CUSTOMER: deliveries for their own orders only. MODERATOR/OWNER: every delivery. */
  getAll = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const filters = parseDeliveryFilters(req.query);
    const result =
      requester.role === UserRole.CUSTOMER
        ? await this.deliveryService.getMyDeliveries(requester.id, filters)
        : await this.deliveryService.getAllDeliveries(filters);
    sendSuccess(res, 200, 'Deliveries retrieved successfully.', result);
  });

  getById = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const delivery = await this.deliveryService.getDeliveryById(req.params.id as string, requester.id, requester.role);
    sendSuccess(res, 200, 'Delivery retrieved successfully.', { delivery });
  });

  update = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const delivery = await this.deliveryService.updateDelivery(req.params.id as string, req.body);
    sendSuccess(res, 200, 'Delivery updated successfully.', { delivery });
  });

  markDelivered = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const delivery = await this.deliveryService.markDelivered(req.params.id as string);
    sendSuccess(res, 200, 'Delivery marked as delivered.', { delivery });
  });

  remove = catchAsync(async (req: Request, res: Response): Promise<void> => {
    await this.deliveryService.deleteDelivery(req.params.id as string);
    sendSuccess(res, 200, 'Delivery deleted successfully.');
  });
}

export const deliveryController = new DeliveryController(deliveryService);
