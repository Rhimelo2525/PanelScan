import { UserRole } from '@prisma/client';
import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import { restrictTo } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { reportsController } from './reports.controller';
import {
  bookingsReportSchema,
  inventoryReportSchema,
  ordersReportSchema,
  projectsReportSchema,
  salesReportSchema,
} from './reports.validation';

const router = Router();

router.use(authenticate);

// Every route below is OWNER/MODERATOR only - CUSTOMER never appears in any
// restrictTo() list here, so every endpoint 403s a CUSTOMER automatically.
// OWNER gets every field in each report; MODERATOR gets the same reports
// with financial fields (totalAmount, totalRevenue, unitPrice,
// totalInventoryValue, budget, totalBudget, averageBudget) omitted -
// enforced per-endpoint in reports.service.ts, not by blocking routes.
const reportsAccess = restrictTo(UserRole.OWNER, UserRole.MODERATOR);

// GET /api/reports/sales
router.get('/sales', reportsAccess, validate(salesReportSchema), reportsController.getSales);

// GET /api/reports/inventory
router.get('/inventory', reportsAccess, validate(inventoryReportSchema), reportsController.getInventory);

// GET /api/reports/orders
router.get('/orders', reportsAccess, validate(ordersReportSchema), reportsController.getOrders);

// GET /api/reports/bookings - identical response for both roles (Booking has no financial columns).
router.get('/bookings', reportsAccess, validate(bookingsReportSchema), reportsController.getBookings);

// GET /api/reports/projects
router.get('/projects', reportsAccess, validate(projectsReportSchema), reportsController.getProjects);

export default router;
