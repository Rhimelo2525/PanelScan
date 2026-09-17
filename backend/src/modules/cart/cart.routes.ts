import { UserRole } from '@prisma/client';
import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import { restrictTo } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { cartController } from './cart.controller';
import { addCartItemSchema, productIdParamsSchema, updateCartItemSchema } from './cart.validation';

const router = Router();

// The cart is a CUSTOMER-only, self-service resource - always "my cart" for
// the authenticated user, never addressed by a cart id in the URL.
router.use(authenticate, restrictTo(UserRole.CUSTOMER));

// GET /api/cart
router.get('/', cartController.getCart);

// POST /api/cart/items
router.post('/items', validate(addCartItemSchema), cartController.addItem);

// PATCH /api/cart/items/:productId
router.patch('/items/:productId', validate(updateCartItemSchema), cartController.updateItem);

// DELETE /api/cart/items/:productId
router.delete('/items/:productId', validate(productIdParamsSchema), cartController.removeItem);

// DELETE /api/cart
router.delete('/', cartController.clearCart);

export default router;
