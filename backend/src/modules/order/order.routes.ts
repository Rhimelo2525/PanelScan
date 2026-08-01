import { UserRole } from '@prisma/client';
import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import { restrictTo } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { orderController } from './order.controller';
import { createOrderSchema, idParamsSchema, listOrdersSchema, updateOrderStatusSchema } from './order.validation';

const router = Router();

router.use(authenticate);

// GET /api/orders - CUSTOMER: own orders only. MODERATOR/OWNER: every order.
router.get('/', validate(listOrdersSchema), orderController.getOrders);

// GET /api/orders/:id - CUSTOMER: own order only (404 otherwise). MODERATOR/OWNER: any order.
router.get('/:id', validate(idParamsSchema), orderController.getById);

// POST /api/orders - CUSTOMER checks out their current cart into a new order.
router.post('/', restrictTo(UserRole.CUSTOMER), validate(createOrderSchema), orderController.create);

// PATCH /api/orders/:id/cancel - CUSTOMER cancels their own PENDING order.
router.patch('/:id/cancel', restrictTo(UserRole.CUSTOMER), validate(idParamsSchema), orderController.cancel);

// PATCH /api/orders/:id/status - MODERATOR/OWNER updates an order's status.
router.patch(
  '/:id/status',
  restrictTo(UserRole.OWNER, UserRole.MODERATOR),
  validate(updateOrderStatusSchema),
  orderController.updateStatus,
);

export default router;
