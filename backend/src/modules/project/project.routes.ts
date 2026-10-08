import { UserRole } from '@prisma/client';
import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import { restrictTo } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { projectController } from './project.controller';
import {
  assignProjectSchema,
  createProjectSchema,
  idParamsSchema,
  listProjectsSchema,
  mobileProjectParamsSchema,
  mobileProjectSchema,
  updateProjectSchema,
  updateProjectStatusSchema,
} from './project.validation';

const router = Router();

router.use(authenticate);

// POST /api/projects - OWNER only.
router.post('/', restrictTo(UserRole.OWNER), validate(createProjectSchema), projectController.create);

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

// GET /api/projects - OWNER: every project. MODERATOR: assigned only. CUSTOMER: own only.
router.get('/', validate(listProjectsSchema), projectController.getAll);

// GET /api/projects/:id - ownership/assignment-checked for CUSTOMER/MODERATOR (404 otherwise). OWNER: any.
router.get('/:id', validate(idParamsSchema), projectController.getById);

// PATCH /api/projects/:id - OWNER: any field. MODERATOR: schedule/notes only on their assigned project.
router.patch('/:id', restrictTo(UserRole.OWNER, UserRole.MODERATOR), validate(updateProjectSchema), projectController.update);

// PATCH /api/projects/:id/status - OWNER: any project. MODERATOR: their assigned project only.
router.patch(
  '/:id/status',
  restrictTo(UserRole.OWNER, UserRole.MODERATOR),
  validate(updateProjectStatusSchema),
  projectController.updateStatus,
);

// PATCH /api/projects/:id/assign - OWNER only ("Cannot reassign projects" is explicitly listed under MODERATOR's restrictions).
router.patch('/:id/assign', restrictTo(UserRole.OWNER), validate(assignProjectSchema), projectController.assign);

// DELETE /api/projects/:id - OWNER only.
router.delete('/:id', restrictTo(UserRole.OWNER), validate(idParamsSchema), projectController.remove);

export default router;
