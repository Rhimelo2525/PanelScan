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
  orderIdParamsSchema,
  selectVehicleSchema,
  setDeliveryCoordinatesSchema,
  updateDeliverySchema,
} from './delivery.validation';

const router = Router();

// POST /api/delivery/webhook/:token - Lalamove calls this directly (no JWT;
// see delivery.controller.ts#webhook for how the :token path segment stands
// in for the signature verification Lalamove doesn't publicly document).
// Must be registered before `router.use(authenticate)` below, and its raw
// body is parsed in app.ts before the global JSON parser (same pattern as
// POST /api/payments/webhook).
router.post('/webhook/:token', deliveryController.webhook);

// Public delivery coverage & PSGC address selector endpoints (accessible at checkout)
router.get('/coverage', deliveryController.getCoverage);
router.get('/regions', deliveryController.getRegions);
router.get('/provinces', deliveryController.getProvinces);
router.get('/cities', deliveryController.getCities);
router.get('/barangays', deliveryController.getBarangays);
router.post('/validate-address', deliveryController.validateAddress);

router.use(authenticate);

// ----------------------------------------------------------------------------
// Delivery workflow - part of the order lifecycle. Who does what is enforced
// here, not only in the UI:
//   CUSTOMER  - nothing to request: the delivery record is created with the
//               order. Views status, fees and tracking, and pays products +
//               shipping in one PayMongo payment (payment module).
//   MODERATOR - approves the order (order module), gets the shipping quote
//               (selects a vehicle), then after payment books Lalamove and
//               refreshes/cancels the booking.
//   OWNER     - view-only: reads deliveries and may refresh live status
//               (a read-only sync), but cannot quote, select, book or cancel.
// ----------------------------------------------------------------------------

// GET /api/delivery/vehicle-types - MODERATOR: live Lalamove vehicle lineup for vehicle selection
router.get('/vehicle-types', restrictTo(UserRole.MODERATOR), deliveryController.getVehicleTypes);

// GET /api/delivery/failed-requests - MODERATOR/OWNER: "Failed API requests" admin view
router.get('/failed-requests', restrictTo(UserRole.MODERATOR, UserRole.OWNER), deliveryController.getFailedRequests);

// POST /api/delivery/orders/:orderId/vehicle - MODERATOR selects the Lalamove vehicle and gets a free quote. Before payment this sets the
// order's estimated shipping fee (and so the amount due); after payment it only changes the vehicle to book. Requires an approved order.
router.post(
  '/orders/:orderId/vehicle',
  restrictTo(UserRole.MODERATOR),
  validate(selectVehicleSchema),
  deliveryController.selectVehicle,
);

// POST /api/delivery/orders/:orderId/book - MODERATOR places the real Lalamove booking for the selected vehicle. Requires a PAID order.
router.post(
  '/orders/:orderId/book',
  restrictTo(UserRole.MODERATOR),
  validate(orderIdParamsSchema),
  deliveryController.bookDelivery,
);

// PATCH /api/delivery/orders/:orderId/coordinates - MODERATOR fallback for older orders without a saved-address map pin
router.patch(
  '/orders/:orderId/coordinates',
  restrictTo(UserRole.MODERATOR),
  validate(setDeliveryCoordinatesSchema),
  deliveryController.setCoordinates,
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

// POST /api/delivery/:id/refresh - any (ownership-checked for CUSTOMER). Read-only against Lalamove.
router.post('/:id/refresh', validate(idParamsSchema), deliveryController.refreshStatus);

// POST /api/delivery/:id/cancel-booking - MODERATOR only (matches every other mutating action in this module).
router.post('/:id/cancel-booking', restrictTo(UserRole.MODERATOR), validate(idParamsSchema), deliveryController.cancelBooking);

// DELETE /api/delivery/:id - MODERATOR only. Neither role's "Can" list in
// this module's spec explicitly names "Delete," but OWNER and CUSTOMER
// both explicitly "Cannot" delete, and MODERATOR is the "Full Delivery
// management" role - delete is assigned here by elimination.
router.delete('/:id', restrictTo(UserRole.MODERATOR), validate(idParamsSchema), deliveryController.remove);

export default router;
