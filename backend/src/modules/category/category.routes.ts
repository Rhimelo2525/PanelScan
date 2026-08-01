import { UserRole } from '@prisma/client';
import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import { restrictTo } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { categoryController } from './category.controller';
import { createCategorySchema, idParamsSchema, updateCategorySchema } from './category.validation';

const router = Router();

const manageCategories = [authenticate, restrictTo(UserRole.OWNER, UserRole.MODERATOR)];

// GET /api/categories
router.get('/', categoryController.getAll);

// GET /api/categories/:id
router.get('/:id', validate(idParamsSchema), categoryController.getById);

// POST /api/categories
router.post('/', ...manageCategories, validate(createCategorySchema), categoryController.create);

// PATCH /api/categories/:id
router.patch('/:id', ...manageCategories, validate(updateCategorySchema), categoryController.update);

// DELETE /api/categories/:id
router.delete('/:id', ...manageCategories, validate(idParamsSchema), categoryController.softDelete);

export default router;
