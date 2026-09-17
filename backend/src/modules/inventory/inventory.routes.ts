import { UserRole } from '@prisma/client';
import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import { restrictTo } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { inventoryController } from './inventory.controller';
import { listInventorySchema, productIdParamsSchema, stockQuantitySchema } from './inventory.validation';

const router = Router();

// Inventory is a back-office concern (Owner's Inventory Assessment,
// Moderator's Inventory Management) - unlike categories/products, no route
// here is customer-facing, so every endpoint requires OWNER or MODERATOR.
router.use(authenticate, restrictTo(UserRole.OWNER, UserRole.MODERATOR));

// GET /api/inventory
router.get('/', validate(listInventorySchema), inventoryController.getAll);

// GET /api/inventory/low-stock
router.get('/low-stock', inventoryController.getLowStock);

// GET /api/inventory/:productId
router.get('/:productId', validate(productIdParamsSchema), inventoryController.getByProductId);

// PATCH /api/inventory/:productId/add
router.patch('/:productId/add', validate(stockQuantitySchema), inventoryController.addStock);

// PATCH /api/inventory/:productId/reduce
router.patch('/:productId/reduce', validate(stockQuantitySchema), inventoryController.reduceStock);

// PATCH /api/inventory/:productId/reserve
router.patch('/:productId/reserve', validate(stockQuantitySchema), inventoryController.reserveStock);

// PATCH /api/inventory/:productId/release
router.patch('/:productId/release', validate(stockQuantitySchema), inventoryController.releaseStock);

export default router;
