import { UserRole } from '@prisma/client';
import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import { restrictTo } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { inventoryController } from './inventory.controller';
import {
  adjustStockSchema,
  createInventorySchema,
  listInventorySchema,
  productIdParamsSchema,
  stockQuantitySchema,
} from './inventory.validation';

const router = Router();

// Inventory is a back-office concern (Owner's Inventory Assessment,
// Moderator's Inventory Management) - unlike categories/products, no route
// here is customer-facing, so every endpoint requires OWNER or MODERATOR.
router.use(authenticate, restrictTo(UserRole.OWNER, UserRole.MODERATOR));

// GET /api/inventory
router.get('/', validate(listInventorySchema), inventoryController.getAll);

// GET /api/inventory/available-products (Products eligible for initial stock recording)
router.get('/available-products', inventoryController.getAvailableProducts);

// POST /api/inventory (Record physical stock for a product)
router.post('/', validate(createInventorySchema), inventoryController.create);

// GET /api/inventory/low-stock
router.get('/low-stock', inventoryController.getLowStock);

// GET /api/inventory/:productId
router.get('/:productId', validate(productIdParamsSchema), inventoryController.getByProductId);

// DELETE /api/inventory/:productId (Remove physical stock record, keeping product in catalogue)
router.delete('/:productId', validate(productIdParamsSchema), inventoryController.delete);

// PATCH /api/inventory/:productId/add
router.patch('/:productId/add', validate(stockQuantitySchema), inventoryController.addStock);

// PATCH /api/inventory/:productId/reduce
router.patch('/:productId/reduce', validate(stockQuantitySchema), inventoryController.reduceStock);

// PATCH /api/inventory/:productId/adjust
router.patch('/:productId/adjust', validate(adjustStockSchema), inventoryController.adjustStock);

// PATCH /api/inventory/:productId/reserve
router.patch('/:productId/reserve', validate(stockQuantitySchema), inventoryController.reserveStock);

// PATCH /api/inventory/:productId/release
router.patch('/:productId/release', validate(stockQuantitySchema), inventoryController.releaseStock);

export default router;
