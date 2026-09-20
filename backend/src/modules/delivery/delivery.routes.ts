import { UserRole } from '@prisma/client';
import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import { restrictTo } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { deliveryController } from './delivery.controller';
import {
  createDeliverySchema,
  declineDeliverySchema,
  idParamsSchema,
  listDeliveriesSchema,
  orderIdParamsSchema,
  updateDeliverySchema,
} from './delivery.validation';

const router = Router();

// Public delivery coverage & PSGC address selector endpoints (accessible at checkout)
router.get('/coverage', deliveryController.getCoverage);
router.get('/regions', deliveryController.getRegions);
router.get('/provinces', deliveryController.getProvinces);
router.get('/cities', deliveryController.getCities);
router.get('/barangays', deliveryController.getBarangays);
router.post('/validate-address', deliveryController.validateAddress);

router.use(authenticate);

// POST /api/delivery/orders/:orderId/request - Authenticated CUSTOMER requests delivery
router.post(
  '/orders/:orderId/request',
  validate(orderIdParamsSchema),
  deliveryController.requestDelivery,
);

// PATCH /api/delivery/orders/:orderId/approve - MODERATOR and OWNER (Staff action to approve delivery request)
router.patch(
  '/orders/:orderId/approve',
  restrictTo(UserRole.MODERATOR, UserRole.OWNER),
  validate(orderIdParamsSchema),
  deliveryController.approveDeliveryRequest,
);

// PATCH /api/delivery/orders/:orderId/decline - MODERATOR and OWNER (Staff action to decline delivery request)
router.patch(
  '/orders/:orderId/decline',
  restrictTo(UserRole.MODERATOR, UserRole.OWNER),
  validate(declineDeliverySchema),
  deliveryController.declineDeliveryRequest,
);

// POST /api/delivery/orders/:orderId/proceed - Authenticated CUSTOMER proceeds with delivery (gated by approval)
router.post(
  '/orders/:orderId/proceed',
  validate(orderIdParamsSchema),
  deliveryController.proceedWithDelivery,
);

// POST /api/delivery/orders/:orderId/arrange - MODERATOR and OWNER (Staff action to arrange delivery for eligible order)
router.post(
  '/orders/:orderId/arrange',
  restrictTo(UserRole.MODERATOR, UserRole.OWNER),
  validate(orderIdParamsSchema),
  deliveryController.arrangeForOrder,
);

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
