import { UserRole } from '@prisma/client';
import type { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { catchAsync } from '../../utils/catchAsync';
import { sendSuccess } from '../../utils/response';
import { FeedbackService, feedbackService } from './feedback.service';
import type { FeedbackFilters } from './feedback.types';

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
const parseFeedbackFilters = (query: Request['query']): FeedbackFilters => ({
  page: typeof query.page === 'string' ? Number(query.page) : undefined,
  limit: typeof query.limit === 'string' ? Number(query.limit) : undefined,
  rating: typeof query.rating === 'string' ? Number(query.rating) : undefined,
  customerId: typeof query.customerId === 'string' ? query.customerId : undefined,
  orderId: typeof query.orderId === 'string' ? query.orderId : undefined,
  productId: typeof query.productId === 'string' ? query.productId : undefined,
  dateFrom: typeof query.dateFrom === 'string' ? new Date(`${query.dateFrom}T00:00:00.000Z`) : undefined,
  dateTo: typeof query.dateTo === 'string' ? new Date(`${query.dateTo}T23:59:59.999Z`) : undefined,
  sort: query.sort === 'asc' || query.sort === 'desc' ? query.sort : undefined,
  search: typeof query.search === 'string' ? query.search : undefined,
});

export class FeedbackController {
  constructor(private readonly feedbackService: FeedbackService) {}

  create = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const feedback = await this.feedbackService.createFeedback(requester.id, req.body);
    sendSuccess(res, 201, 'Feedback submitted successfully.', { feedback });
  });

  /** CUSTOMER: own feedback only. MODERATOR/OWNER: every feedback entry, with search/filter. */
  getAll = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const filters = parseFeedbackFilters(req.query);
    const result =
      requester.role === UserRole.CUSTOMER
        ? await this.feedbackService.getMyFeedback(requester.id, filters)
        : await this.feedbackService.getAllFeedback(filters);
    sendSuccess(res, 200, 'Feedback retrieved successfully.', result);
  });

  getById = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const feedback = await this.feedbackService.getFeedbackById(req.params.id as string, requester.id, requester.role);
    sendSuccess(res, 200, 'Feedback retrieved successfully.', { feedback });
  });

  update = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const feedback = await this.feedbackService.updateOwnFeedback(req.params.id as string, requester.id, req.body);
    sendSuccess(res, 200, 'Feedback updated successfully.', { feedback });
  });

  remove = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    await this.feedbackService.deleteOwnFeedback(req.params.id as string, requester.id);
    sendSuccess(res, 200, 'Feedback deleted successfully.');
  });

  getByProduct = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const filters = parseFeedbackFilters(req.query);
    const result = await this.feedbackService.getFeedbackByProduct(req.params.productId as string, filters);
    sendSuccess(res, 200, 'Product feedback retrieved successfully.', result);
  });

  getByOrder = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const result = await this.feedbackService.getFeedbackByOrder(req.params.orderId as string, requester.id, requester.role);
    sendSuccess(res, 200, 'Order feedback retrieved successfully.', result);
  });
}

export const feedbackController = new FeedbackController(feedbackService);
