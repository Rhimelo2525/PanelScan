import { UserRole } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';

import { authenticate } from '../../middleware/auth.middleware';
import { restrictTo } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { usersController } from './users.controller';

const idParamsSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid user id.') }),
});

const updateUserSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid user id.') }),
  body: z
    .object({
      firstName: z.string().trim().min(2, 'First name must be at least 2 characters.').max(50).optional(),
      lastName: z.string().trim().min(2, 'Last name must be at least 2 characters.').max(50).optional(),
      phone: z
        .string()
        .trim()
        .regex(/^\+?[0-9\s\-()]{7,20}$/, 'Please provide a valid phone number.')
        .optional(),
    })
    .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided.' }),
});

const router = Router();

router.use(authenticate);

// GET /api/users
router.get('/', restrictTo(UserRole.OWNER), usersController.getAll);

// GET /api/users/:id
router.get('/:id', validate(idParamsSchema), usersController.getById);

// PATCH /api/users/:id
router.patch('/:id', validate(updateUserSchema), usersController.update);

// DELETE /api/users/:id
router.delete('/:id', restrictTo(UserRole.OWNER), validate(idParamsSchema), usersController.deactivate);

export default router;
