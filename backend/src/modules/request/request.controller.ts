import { UserRole } from '@prisma/client';
import type { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { catchAsync } from '../../utils/catchAsync';
import { sendSuccess } from '../../utils/response';
import { RequestService, requestService } from './request.service';
import type { RequestFilters } from './request.types';

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
const parseRequestFilters = (query: Request['query']): RequestFilters => {
  const sortBy = query.sortBy === 'title' || query.sortBy === 'createdAt' || query.sortBy === 'reviewedAt' ? query.sortBy : undefined;
  const sortOrder = query.sortOrder === 'asc' || query.sortOrder === 'desc' ? query.sortOrder : undefined;

  return {
    page: typeof query.page === 'string' ? Number(query.page) : undefined,
    limit: typeof query.limit === 'string' ? Number(query.limit) : undefined,
    status: typeof query.status === 'string' ? (query.status as RequestFilters['status']) : undefined,
    type: typeof query.type === 'string' ? (query.type as RequestFilters['type']) : undefined,
    requestedById: typeof query.requestedById === 'string' ? query.requestedById : undefined,
    reviewedById: typeof query.reviewedById === 'string' ? query.reviewedById : undefined,
    dateFrom: typeof query.dateFrom === 'string' ? new Date(`${query.dateFrom}T00:00:00.000Z`) : undefined,
    dateTo: typeof query.dateTo === 'string' ? new Date(`${query.dateTo}T23:59:59.999Z`) : undefined,
    search: typeof query.search === 'string' ? query.search : undefined,
    sortBy,
    sortOrder,
  };
};

export class RequestController {
  constructor(private readonly requestService: RequestService) {}

  create = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const request = await this.requestService.createRequest(requester.id, req.body);
    sendSuccess(res, 201, 'Request submitted successfully.', { request });
  });

  /** OWNER: every request. MODERATOR: own requests only. */
  getAll = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const filters = parseRequestFilters(req.query);
    const result =
      requester.role === UserRole.OWNER
        ? await this.requestService.getAllRequests(filters)
        : await this.requestService.getMyRequests(requester.id, filters);
    sendSuccess(res, 200, 'Requests retrieved successfully.', result);
  });

  getById = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const request = await this.requestService.getRequestById(req.params.id as string, requester.id, requester.role);
    sendSuccess(res, 200, 'Request retrieved successfully.', { request });
  });

  update = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const request = await this.requestService.updateOwnRequest(req.params.id as string, requester.id, req.body);
    sendSuccess(res, 200, 'Request updated successfully.', { request });
  });

  approve = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const request = await this.requestService.approveRequest(req.params.id as string, requester.id, req.body.reviewNote);
    sendSuccess(res, 200, 'Request approved successfully.', { request });
  });

  reject = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const request = await this.requestService.rejectRequest(req.params.id as string, requester.id, req.body.reviewNote);
    sendSuccess(res, 200, 'Request rejected successfully.', { request });
  });

  cancel = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const request = await this.requestService.cancelOwnRequest(req.params.id as string, requester.id);
    sendSuccess(res, 200, 'Request cancelled successfully.', { request });
  });

  remove = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    await this.requestService.deleteRequest(req.params.id as string, requester.id, requester.role);
    sendSuccess(res, 200, 'Request deleted successfully.');
  });
}

export const requestController = new RequestController(requestService);
