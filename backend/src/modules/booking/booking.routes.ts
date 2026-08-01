import { UserRole } from '@prisma/client';
import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import { restrictTo } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { bookingController } from './booking.controller';
import {
  assignInstallerSchema,
  createBookingSchema,
  idParamsSchema,
  listBookingsSchema,
  updateBookingStatusSchema,
} from './booking.validation';

const router = Router();

router.use(authenticate);

// GET /api/bookings/all - MODERATOR/OWNER view every booking. Registered
// before /:id so Express doesn't try to parse "all" as a booking id.
router.get('/all', restrictTo(UserRole.MODERATOR, UserRole.OWNER), validate(listBookingsSchema), bookingController.getAllBookings);

// GET /api/bookings - CUSTOMER's own bookings only.
router.get('/', restrictTo(UserRole.CUSTOMER), validate(listBookingsSchema), bookingController.getMyBookings);

// GET /api/bookings/:id - CUSTOMER: own only (404 otherwise). MODERATOR/OWNER: any.
router.get('/:id', validate(idParamsSchema), bookingController.getById);

// POST /api/bookings - CUSTOMER creates their own booking.
router.post('/', restrictTo(UserRole.CUSTOMER), validate(createBookingSchema), bookingController.create);

// PATCH /api/bookings/:id/cancel - CUSTOMER cancels their own PENDING booking.
router.patch('/:id/cancel', restrictTo(UserRole.CUSTOMER), validate(idParamsSchema), bookingController.cancel);

// PATCH /api/bookings/:id/status - MODERATOR only, per this module's explicit
// authorization rules (OWNER's listed capability here is "monitor" - read
// only, not "update booking status").
router.patch('/:id/status', restrictTo(UserRole.MODERATOR), validate(updateBookingStatusSchema), bookingController.updateStatus);

// PATCH /api/bookings/:id/assign-installer - "Only MODERATOR" per spec.
router.patch(
  '/:id/assign-installer',
  restrictTo(UserRole.MODERATOR),
  validate(assignInstallerSchema),
  bookingController.assignInstaller,
);

export default router;
