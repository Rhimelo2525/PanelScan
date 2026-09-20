import { z } from 'zod';

const NUMERIC_STRING = /^\d+$/;

export const productIdParamsSchema = z.object({
  params: z.object({ productId: z.string().uuid('Invalid product id.') }),
});

export const stockQuantitySchema = z.object({
  params: z.object({ productId: z.string().uuid('Invalid product id.') }),
  body: z.object({
    quantity: z.number().int('Quantity must be a whole number.').positive('Quantity must be greater than 0.'),
  }),
});

export const listInventorySchema = z.object({
  query: z.object({
    page: z.string().regex(NUMERIC_STRING, 'page must be a positive integer.').optional(),
    limit: z.string().regex(NUMERIC_STRING, 'limit must be a positive integer.').optional(),
  }),
});

export const createInventorySchema = z.object({
  body: z.object({
    productId: z.string().uuid('Invalid product id.'),
    quantity: z.number().int('Quantity must be a whole number.').min(0, 'Quantity cannot be negative.'),
    reorderLevel: z.number().int().min(0).optional(),
    warehouseLocation: z.string().trim().max(100).optional(),
  }),
});

export const adjustStockSchema = z.object({
  params: z.object({ productId: z.string().uuid('Invalid product id.') }),
  body: z.object({
    targetQuantity: z.number().int('Target quantity must be a whole number.').min(0, 'Quantity cannot be negative.'),
  }),
});

export type StockQuantityInput = z.infer<typeof stockQuantitySchema>['body'];
export type CreateInventoryInput = z.infer<typeof createInventorySchema>['body'];
export type AdjustStockInput = z.infer<typeof adjustStockSchema>['body'];
