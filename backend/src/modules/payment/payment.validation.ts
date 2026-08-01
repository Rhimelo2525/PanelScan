import { z } from 'zod';

const NUMERIC_STRING = /^\d+$/;

export const createPaymentSchema = z.object({
  body: z.object({
    orderId: z.string().uuid('Invalid order id.'),
  }),
});

export const idParamsSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid payment id.') }),
});

export const listPaymentsSchema = z.object({
  query: z.object({
    page: z.string().regex(NUMERIC_STRING, 'page must be a positive integer.').optional(),
    limit: z.string().regex(NUMERIC_STRING, 'limit must be a positive integer.').optional(),
  }),
});

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>['body'];
