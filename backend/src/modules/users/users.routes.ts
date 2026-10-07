import { UserRole } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

import { authenticate } from '../../middleware/auth.middleware';
import { restrictTo } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { personNameSchema } from '../../utils/nameSchema';
import { optionalPhilippinePhoneSchema } from '../../utils/phoneSchema';
import { usersController } from './users.controller';

const idParamsSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid user id.') }),
});

const updateUserSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid user id.') }),
  body: z
    .object({
      firstName: personNameSchema('First name').optional(),
      lastName: personNameSchema('Last name').optional(),
      // null clears the number; blank or missing leaves it unchanged.
      phone: z.union([z.null(), optionalPhilippinePhoneSchema]),
    })
    .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided.' }),
});

const createModeratorSchema = z.object({
  body: z.object({
    firstName: personNameSchema('First name'),
    lastName: personNameSchema('Last name'),
    email: z.string().trim().toLowerCase().email('Please provide a valid email address.'),
    // No password: the invited person chooses their own when activating.
    phone: optionalPhilippinePhoneSchema,
    role: z.nativeEnum(UserRole).optional().default(UserRole.MODERATOR),
  }),
});

const router = Router();

router.use(authenticate);

// POST /api/users - OWNER only (provisions staff/moderator accounts)
router.post('/', restrictTo(UserRole.OWNER), validate(createModeratorSchema), usersController.create);

// POST /api/users/moderators alias
router.post('/moderators', restrictTo(UserRole.OWNER), validate(createModeratorSchema), usersController.create);

// GET /api/users
router.get('/', restrictTo(UserRole.OWNER), usersController.getAll);

// GET /api/users/:id
router.get('/:id', validate(idParamsSchema), usersController.getById);

// PATCH /api/users/:id/reactivate - OWNER only (undoes a restriction)
router.patch('/:id/reactivate', restrictTo(UserRole.OWNER), validate(idParamsSchema), usersController.reactivate);

// POST /api/users/:id/resend-invitation - OWNER only (a staff account not activated yet)
router.post('/:id/resend-invitation', restrictTo(UserRole.OWNER), validate(idParamsSchema), usersController.resendInvitation);

// DELETE /api/users/:id/permanent - OWNER only. Removes a restricted account for good, or cancels a pending invitation.
router.delete('/:id/permanent', restrictTo(UserRole.OWNER), validate(idParamsSchema), usersController.remove);

// PATCH /api/users/:id
router.patch('/:id', validate(updateUserSchema), usersController.update);

// DELETE /api/users/:id
router.delete('/:id', restrictTo(UserRole.OWNER), validate(idParamsSchema), usersController.deactivate);

export default router;
