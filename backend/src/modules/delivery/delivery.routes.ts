import { UserRole } from '@prisma/client';
import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import { restrictTo } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { deliveryController } from './delivery.controller';
import {
  createDeliverySchema,
  idParamsSchema,
  listDeliveriesSchema,
  updateDeliverySchema,
} from './delivery.validation';

const router = Router();

router.use(authenticate);

// POST /api/delivery - MODERATOR only ("Full Delivery management"; OWNER is explicitly read-only, CUSTOMER cannot create).
router.post('/', restrictTo(UserRole.MODERATOR), validate(createDeliverySchema), deliveryController.create);

// GET /api/delivery - CUSTOMER: deliveries for their own orders only. MODERATOR/OWNER: every delivery.
router.get('/', validate(listDeliveriesSchema), deliveryController.getAll);

// GET /api/delivery/:id - ownership-checked for CUSTOMER (404 otherwise). MODERATOR/OWNER: any.
router.get('/:id', validate(idParamsSchema), deliveryController.getById);

// PATCH /api/delivery/:id - MODERATOR only.
router.patch('/:id', restrictTo(UserRole.MODERATOR), validate(updateDeliverySchema), deliveryController.update);

// PATCH /api/delivery/:id/delivered - MODERATOR only.
router.patch('/:id/delivered', restrictTo(UserRole.MODERATOR), validate(idParamsSchema), deliveryController.markDelivered);

// DELETE /api/delivery/:id - MODERATOR only. Neither role's "Can" list in
// this module's spec explicitly names "Delete," but OWNER and CUSTOMER
// both explicitly "Cannot" delete, and MODERATOR is the "Full Delivery
// management" role - delete is assigned here by elimination.
router.delete('/:id', restrictTo(UserRole.MODERATOR), validate(idParamsSchema), deliveryController.remove);

export default router;
