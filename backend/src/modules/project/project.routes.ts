import { UserRole } from '@prisma/client';
import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import { restrictTo } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { projectController } from './project.controller';
import {
  idParamsSchema,
  listProjectCustomersSchema,
  listProjectsSchema,
  mobileProjectParamsSchema,
  mobileProjectSchema,
} from './project.validation';

const router = Router();

router.use(authenticate);

// Customer projects are created and deleted by the customer only (from the
// mobile app). The owner and moderators have view-only access: there is no
// staff route that creates, edits, assigns, changes the status of, or
// deletes a project.

// POST /api/projects/mobile - CUSTOMER saves a project from the mobile app (MOBILE_AR_3D),
// keyed by the app's project id so saving it again updates the same project.
router.post('/mobile', restrictTo(UserRole.CUSTOMER), validate(mobileProjectSchema), projectController.syncMobile);

// DELETE /api/projects/mobile/:externalProjectId - CUSTOMER deletes their own mobile
// project while it is still pending. Two path segments, so it never collides with /:id.
router.delete(
  '/mobile/:externalProjectId',
  restrictTo(UserRole.CUSTOMER),
  validate(mobileProjectParamsSchema),
  projectController.removeMobile,
);

// GET /api/projects/customers - OWNER/MODERATOR: customers who have projects, with counts.
// Registered before /:id so "customers" is never read as a project id.
router.get(
  '/customers',
  restrictTo(UserRole.OWNER, UserRole.MODERATOR),
  validate(listProjectCustomersSchema),
  projectController.getCustomers,
);

// GET /api/projects - OWNER/MODERATOR: every project. CUSTOMER: own only.
// ?code=PRJ-2026-1A2B3C4D finds a project by its reference code.
router.get('/', validate(listProjectsSchema), projectController.getAll);

// GET /api/projects/:id - OWNER/MODERATOR: any. CUSTOMER: own only (404 otherwise).
router.get('/:id', validate(idParamsSchema), projectController.getById);

export default router;
