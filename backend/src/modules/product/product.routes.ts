import { UserRole } from '@prisma/client';
import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import { restrictTo } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { productController } from './product.controller';
import {
  categoryProductsSchema,
  createProductSchema,
  featuredProductsSchema,
  idParamsSchema,
  listProductsSchema,
  searchProductsSchema,
  updateProductSchema,
} from './product.validation';

const router = Router();

const manageProducts = [authenticate, restrictTo(UserRole.OWNER, UserRole.MODERATOR)];

// GET /api/products
router.get('/', validate(listProductsSchema), productController.getAll);

// GET /api/products/search
router.get('/search', validate(searchProductsSchema), productController.search);

// GET /api/products/featured
router.get('/featured', validate(featuredProductsSchema), productController.getFeatured);

// GET /api/products/category/:categoryId
router.get('/category/:categoryId', validate(categoryProductsSchema), productController.getByCategory);

// GET /api/products/:id
router.get('/:id', validate(idParamsSchema), productController.getById);

// POST /api/products
router.post('/', ...manageProducts, validate(createProductSchema), productController.create);

// PATCH /api/products/:id
router.patch('/:id', ...manageProducts, validate(updateProductSchema), productController.update);

// DELETE /api/products/:id
router.delete('/:id', ...manageProducts, validate(idParamsSchema), productController.softDelete);

export default router;
