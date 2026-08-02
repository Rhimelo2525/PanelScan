import { UserRole } from '@prisma/client';
import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import { restrictTo } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { requestController } from './request.controller';
import {
  createRequestSchema,
  idParamsSchema,
  listRequestsSchema,
  reviewRequestSchema,
  updateRequestSchema,
} from './request.validation';

const router = Router();

router.use(authenticate);

// CUSTOMER never appears in any restrictTo() list below, so every route
// here 403s a CUSTOMER automatically - no explicit customer-blocking logic
// needed anywhere in this module.

// POST /api/requests - MODERATOR only ("Create requests" is not listed under OWNER's capabilities).
router.post('/', restrictTo(UserRole.MODERATOR), validate(createRequestSchema), requestController.create);

// GET /api/requests - OWNER: every request. MODERATOR: own requests only.
router.get('/', restrictTo(UserRole.OWNER, UserRole.MODERATOR), validate(listRequestsSchema), requestController.getAll);

// GET /api/requests/:id - ownership-checked for MODERATOR (404 otherwise). OWNER: any.
router.get('/:id', restrictTo(UserRole.OWNER, UserRole.MODERATOR), validate(idParamsSchema), requestController.getById);

// PATCH /api/requests/:id - MODERATOR only, own PENDING request (no generic edit capability listed for OWNER).
router.patch('/:id', restrictTo(UserRole.MODERATOR), validate(updateRequestSchema), requestController.update);

// PATCH /api/requests/:id/approve - OWNER only.
router.patch('/:id/approve', restrictTo(UserRole.OWNER), validate(reviewRequestSchema), requestController.approve);

// PATCH /api/requests/:id/reject - OWNER only.
router.patch('/:id/reject', restrictTo(UserRole.OWNER), validate(reviewRequestSchema), requestController.reject);

// PATCH /api/requests/:id/cancel - MODERATOR only, own PENDING request.
router.patch('/:id/cancel', restrictTo(UserRole.MODERATOR), validate(idParamsSchema), requestController.cancel);

// DELETE /api/requests/:id - OWNER: any. MODERATOR: own, never-reviewed only (enforced in the service).
router.delete('/:id', restrictTo(UserRole.OWNER, UserRole.MODERATOR), validate(idParamsSchema), requestController.remove);

export default router;
