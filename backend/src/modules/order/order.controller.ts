import { UserRole } from '@prisma/client';
import type { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { catchAsync } from '../../utils/catchAsync';
import { sendSuccess } from '../../utils/response';
import { OrderService, orderService } from './order.service';
import type { OrderFilters } from './order.types';

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

const parseOrderFilters = (query: Request['query']): OrderFilters => ({
  page: typeof query.page === 'string' ? Number(query.page) : undefined,
  limit: typeof query.limit === 'string' ? Number(query.limit) : undefined,
  status: typeof query.status === 'string' ? (query.status as OrderFilters['status']) : undefined,
});

export class OrderController {
  constructor(private readonly orderService: OrderService) {}

  create = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const order = await this.orderService.createOrderFromCart(requester.id, req.body);
    sendSuccess(res, 201, 'Order created successfully.', { order });
  });

  /** CUSTOMER sees only their own orders; MODERATOR/OWNER see every order. */
  getOrders = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const filters = parseOrderFilters(req.query);
    const result =
      requester.role === UserRole.CUSTOMER
        ? await this.orderService.getOrders(requester.id, filters)
        : await this.orderService.getAllOrders(filters);
    sendSuccess(res, 200, 'Orders retrieved successfully.', result);
  });

  getById = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const order = await this.orderService.getOrderById(req.params.id as string, requester.id, requester.role);
    sendSuccess(res, 200, 'Order retrieved successfully.', { order });
  });

  cancel = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const order = await this.orderService.cancelOwnOrder(req.params.id as string, requester.id);
    sendSuccess(res, 200, 'Order cancelled successfully.', { order });
  });

  updateStatus = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const order = await this.orderService.updateOrderStatus(req.params.id as string, req.body.status);
    sendSuccess(res, 200, 'Order status updated successfully.', { order });
  });
}

export const orderController = new OrderController(orderService);
