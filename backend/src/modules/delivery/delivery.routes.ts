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
// Delivery workflow. Who does what is enforced here, not only in the UI:
//   CUSTOMER  - requests delivery once the order is approved AND the product
//               payment is PAID; views status, shipping fee and tracking; pays
//               the shipping fee after the booking exists.
//   MODERATOR - approves/declines the request, selects the Lalamove vehicle,
//               books Lalamove, refreshes/cancels the booking.
//   OWNER     - view-only: reads deliveries and may refresh live status
//               (a read-only sync), but cannot approve, select, book or cancel.
// ----------------------------------------------------------------------------

// GET /api/delivery/vehicle-types - MODERATOR: live Lalamove vehicle lineup for vehicle selection
router.get('/vehicle-types', restrictTo(UserRole.MODERATOR), deliveryController.getVehicleTypes);

// GET /api/delivery/failed-requests - MODERATOR/OWNER: "Failed API requests" admin view
router.get('/failed-requests', restrictTo(UserRole.MODERATOR, UserRole.OWNER), deliveryController.getFailedRequests);

// POST /api/delivery/orders/:orderId/request - CUSTOMER (own order, approved + paid)
router.post(
  '/orders/:orderId/request',
  restrictTo(UserRole.CUSTOMER),
  validate(orderIdParamsSchema),
  deliveryController.requestDelivery,
);

// PATCH /api/delivery/orders/:orderId/approve - MODERATOR
router.patch(
  '/orders/:orderId/approve',
  restrictTo(UserRole.MODERATOR),
  validate(orderIdParamsSchema),
  deliveryController.approveDeliveryRequest,
);

// PATCH /api/delivery/orders/:orderId/decline - MODERATOR
router.patch(
  '/orders/:orderId/decline',
  restrictTo(UserRole.MODERATOR),
  validate(declineDeliverySchema),
  deliveryController.declineDeliveryRequest,
);

// POST /api/delivery/orders/:orderId/vehicle - MODERATOR selects the Lalamove vehicle (saves it + a free quote). Requires an APPROVED request.
router.post(
  '/orders/:orderId/vehicle',
  restrictTo(UserRole.MODERATOR),
  validate(selectVehicleSchema),
  deliveryController.selectVehicle,
);

// POST /api/delivery/orders/:orderId/book - MODERATOR places the real Lalamove booking for the selected vehicle
router.post(
  '/orders/:orderId/book',
  restrictTo(UserRole.MODERATOR),
  validate(orderIdParamsSchema),
  deliveryController.bookDelivery,
);

// POST /api/delivery/orders/:orderId/fee/gcash - CUSTOMER pays the booked shipping fee via PayMongo GCash (separate charge from the product payment)
router.post(
  '/orders/:orderId/fee/gcash',
  restrictTo(UserRole.CUSTOMER),
  validate(orderIdParamsSchema),
  deliveryController.payFeeWithGcash,
);

// POST /api/delivery/orders/:orderId/fee/cash - CUSTOMER chooses to pay the booked shipping fee in cash on delivery
router.post(
  '/orders/:orderId/fee/cash',
  restrictTo(UserRole.CUSTOMER),
  validate(orderIdParamsSchema),
  deliveryController.payFeeWithCash,
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
