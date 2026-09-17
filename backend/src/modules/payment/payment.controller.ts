import { UserRole } from '@prisma/client';
import type { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { catchAsync } from '../../utils/catchAsync';
import { sendSuccess } from '../../utils/response';
import { PaymentService, paymentService } from './payment.service';
import type { PaymentFilters } from './payment.types';

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

const parsePaymentFilters = (query: Request['query']): PaymentFilters => ({
  page: typeof query.page === 'string' ? Number(query.page) : undefined,
  limit: typeof query.limit === 'string' ? Number(query.limit) : undefined,
});

export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  create = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const result = await this.paymentService.createPayment(requester.id, req.body.orderId);
    sendSuccess(res, 201, 'Payment created successfully.', {
      paymentId: result.payment.id,
      status: result.payment.status,
      checkoutUrl: result.checkoutUrl,
    });
  });

  getPayments = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const filters = parsePaymentFilters(req.query);
    const result =
      requester.role === UserRole.CUSTOMER
        ? await this.paymentService.getPaymentsForCustomer(requester.id, filters)
        : await this.paymentService.getAllPayments(filters);
    sendSuccess(res, 200, 'Payments retrieved successfully.', result);
  });

  getById = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const payment = await this.paymentService.getPaymentById(req.params.id as string, requester.id, requester.role);
    sendSuccess(res, 200, 'Payment retrieved successfully.', {
      payment: {
        id: payment.id,
        orderId: payment.orderId,
        status: payment.status,
        amount: payment.amount,
        method: payment.method,
        transactionRef: payment.transactionRef,
        paidAt: payment.paidAt,
        createdAt: payment.createdAt,
      },
    });
  });

  webhook = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const signature = req.headers['paymongo-signature'];
    const rawBody = req.body as Buffer;
    await this.paymentService.handleWebhook(rawBody, typeof signature === 'string' ? signature : undefined);
    sendSuccess(res, 200, 'Webhook received.');
  });
}

export const paymentController = new PaymentController(paymentService);
