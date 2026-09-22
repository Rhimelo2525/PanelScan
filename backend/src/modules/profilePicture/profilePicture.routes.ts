import { UserRole } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

import { authenticate } from '../../middleware/auth.middleware';
import { profilePictureRateLimiter } from '../../middleware/rateLimit.middleware';
import { restrictTo } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { profilePictureController } from './profilePicture.controller';
import { receiveProfileImage } from './profilePicture.upload';

const idParamsSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid user id.') }),
});

// Mounted at the API root (see routes/index.ts) because the two halves of this
// feature live under different existing resources: a customer changes THEIR
// picture under /auth/me (next to PATCH /auth/me), and a picture is read as a
// sub-resource of the user it belongs to.
const router = Router();

// PUT /api/auth/me/profile-picture - multipart, field "image". Customers only;
// the target is always the caller - there is no id parameter to tamper with.
router.put(
  '/auth/me/profile-picture',
  profilePictureRateLimiter,
  authenticate,
  restrictTo(UserRole.CUSTOMER),
  receiveProfileImage,
  profilePictureController.upload,
);

// DELETE /api/auth/me/profile-picture
router.delete(
  '/auth/me/profile-picture',
  profilePictureRateLimiter,
  authenticate,
  restrictTo(UserRole.CUSTOMER),
  profilePictureController.remove,
);

// GET /api/users/:id/profile-picture - the owner, or staff. Everyone else gets 404.
router.get('/users/:id/profile-picture', authenticate, validate(idParamsSchema), profilePictureController.view);

export default router;
