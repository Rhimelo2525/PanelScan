import { UserRole } from '@prisma/client';
import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import { restrictTo } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { receiveProfileImage } from '../profilePicture/profilePicture.upload';
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

// PUT /api/projects/mobile/:externalProjectId/wall-photo - CUSTOMER: the photo of the measured
// wall, with the measured outline drawn on it by the app (multipart, field "image", up to 5 MB).
router.put(
  '/mobile/:externalProjectId/wall-photo',
  restrictTo(UserRole.CUSTOMER),
  validate(mobileProjectParamsSchema),
  receiveProfileImage,
  projectController.uploadWallPhoto,
);

// GET /api/projects/:id/wall-photo - OWNER/MODERATOR only: customers see it in the app, not here.
router.get('/:id/wall-photo', restrictTo(UserRole.OWNER, UserRole.MODERATOR), validate(idParamsSchema), projectController.viewWallPhoto);

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
