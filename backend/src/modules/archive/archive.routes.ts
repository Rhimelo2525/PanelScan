import { UserRole } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

import { authenticate } from '../../middleware/auth.middleware';
import { restrictTo } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { isCalendarDate } from './archive.cycle';
import { archiveController } from './archive.controller';

const archiveIdSchema = z.object({
  params: z.object({ archiveId: z.string().uuid('Invalid archive id.') }),
});

const calendarDate = (name: string) => z.string({ required_error: `${name} is required.` }).refine(isCalendarDate, `${name} must be a date in YYYY-MM-DD format.`);
const dateRangeSchema = z.object({
  query: z.object({ dateFrom: calendarDate('dateFrom'), dateTo: calendarDate('dateTo') }),
});

const router = Router();

router.use(authenticate);

// GET /api/admin/archives/current-cycle - the dashboard's live monthly cycle.
// MODERATOR sees it too (without revenue), since they share the dashboard.
router.get('/current-cycle', restrictTo(UserRole.OWNER, UserRole.MODERATOR), archiveController.getCurrentCycle);

// GET /api/admin/archives - OWNER only.
router.get('/', restrictTo(UserRole.OWNER), archiveController.list);

// GET /api/admin/archives/range?dateFrom=2026-09-19&dateTo=2026-09-22 - OWNER only.
// The cycle figures for any span of Philippine calendar days (both included), computed live.
// Registered before /:archiveId, which would otherwise take "range" as an id.
router.get('/range', restrictTo(UserRole.OWNER), validate(dateRangeSchema), archiveController.getRange);

// GET /api/admin/archives/range/download?dateFrom=&dateTo= - OWNER only. That report as one .xlsx workbook.
router.get('/range/download', restrictTo(UserRole.OWNER), validate(dateRangeSchema), archiveController.downloadRange);

// GET /api/admin/archives/:archiveId - OWNER only. One archive with its data (read-only).
router.get('/:archiveId', restrictTo(UserRole.OWNER), validate(archiveIdSchema), archiveController.get);

// GET /api/admin/archives/:archiveId/download - OWNER only. The cycle as one .xlsx workbook.
router.get('/:archiveId/download', restrictTo(UserRole.OWNER), validate(archiveIdSchema), archiveController.download);

export default router;
