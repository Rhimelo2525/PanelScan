import { z } from 'zod';

export const addCartItemSchema = z.object({
  body: z.object({
    productId: z.string().uuid('Invalid product id.'),
    quantity: z.number().int('Quantity must be a whole number.').positive('Quantity must be greater than 0.'),
  }),
});

export const updateCartItemSchema = z.object({
  params: z.object({ productId: z.string().uuid('Invalid product id.') }),
  body: z.object({
    quantity: z.number().int('Quantity must be a whole number.').positive('Quantity must be greater than 0.'),
  }),
});

export const productIdParamsSchema = z.object({
  params: z.object({ productId: z.string().uuid('Invalid product id.') }),
});

export type AddCartItemInput = z.infer<typeof addCartItemSchema>['body'];
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>['body'];
