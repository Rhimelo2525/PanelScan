import { OrderStatus } from '@prisma/client';
import { z } from 'zod';

const NUMERIC_STRING = /^\d+$/;

export const createOrderSchema = z.object({
  body: z.object({
    shippingAddress: z
      .string()
      .trim()
      .min(10, 'Shipping address must be at least 10 characters.')
      .max(500, 'Shipping address is too long.'),
    notes: z.string().trim().max(1000, 'Notes are too long.').optional(),
  }),
});

export const idParamsSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid order id.') }),
});

export const listOrdersSchema = z.object({
  query: z.object({
    page: z.string().regex(NUMERIC_STRING, 'page must be a positive integer.').optional(),
    limit: z.string().regex(NUMERIC_STRING, 'limit must be a positive integer.').optional(),
    status: z.nativeEnum(OrderStatus).optional(),
  }),
});

export const updateOrderStatusSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid order id.') }),
  body: z.object({
    status: z.nativeEnum(OrderStatus, { errorMap: () => ({ message: 'Invalid order status.' }) }),
  }),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>['body'];
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>['body'];
