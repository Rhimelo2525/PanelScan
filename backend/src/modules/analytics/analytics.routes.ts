import { UserRole } from '@prisma/client';
import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import { restrictTo } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { analyticsController } from './analytics.controller';
import {
  customerAnalyticsSchema,
  productAnalyticsSchema,
  projectAnalyticsSchema,
  salesAnalyticsSchema,
} from './analytics.validation';

const router = Router();

router.use(authenticate);

// Every route below is OWNER/MODERATOR only - CUSTOMER never appears in any
// restrictTo() list here, so every endpoint 403s a CUSTOMER automatically.
// OWNER gets every field in each response; MODERATOR gets an "operational"
// subset with financial figures (revenue, spend, budget) omitted - enforced
// per-endpoint in analytics.service.ts, not by blocking routes outright.
const analyticsAccess = restrictTo(UserRole.OWNER, UserRole.MODERATOR);

// GET /api/analytics/dashboard - live snapshot, no query params.
router.get('/dashboard', analyticsAccess, analyticsController.getDashboard);

// GET /api/analytics/sales
router.get('/sales', analyticsAccess, validate(salesAnalyticsSchema), analyticsController.getSales);

// GET /api/analytics/products
router.get('/products', analyticsAccess, validate(productAnalyticsSchema), analyticsController.getProducts);

// GET /api/analytics/customers
router.get('/customers', analyticsAccess, validate(customerAnalyticsSchema), analyticsController.getCustomers);

// GET /api/analytics/projects
router.get('/projects', analyticsAccess, validate(projectAnalyticsSchema), analyticsController.getProjects);

export default router;
