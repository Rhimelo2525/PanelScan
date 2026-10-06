import { UserRole } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

import { authenticate } from '../../middleware/auth.middleware';
import { restrictTo } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { archiveController } from './archive.controller';

const archiveIdSchema = z.object({
  params: z.object({ archiveId: z.string().uuid('Invalid archive id.') }),
});

const router = Router();

router.use(authenticate);

// GET /api/admin/archives/current-cycle - the dashboard's live monthly cycle.
// MODERATOR sees it too (without revenue), since they share the dashboard.
router.get('/current-cycle', restrictTo(UserRole.OWNER, UserRole.MODERATOR), archiveController.getCurrentCycle);

// GET /api/admin/archives - OWNER only.
router.get('/', restrictTo(UserRole.OWNER), archiveController.list);

// GET /api/admin/archives/:archiveId - OWNER only. One archive with its data (read-only).
router.get('/:archiveId', restrictTo(UserRole.OWNER), validate(archiveIdSchema), archiveController.get);

// GET /api/admin/archives/:archiveId/download - OWNER only. The cycle as one .xlsx workbook.
router.get('/:archiveId/download', restrictTo(UserRole.OWNER), validate(archiveIdSchema), archiveController.download);

export default router;
