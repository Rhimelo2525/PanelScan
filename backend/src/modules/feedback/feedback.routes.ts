import { UserRole } from '@prisma/client';
import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import { restrictTo } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { feedbackController } from './feedback.controller';
import {
  createFeedbackSchema,
  idParamsSchema,
  listFeedbackSchema,
  orderFeedbackSchema,
  productFeedbackSchema,
  updateFeedbackSchema,
} from './feedback.validation';

const router = Router();

router.use(authenticate);

// GET /api/feedback/product/:productId - product reviews, any authenticated role.
// Two path segments, so this never collides with the single-segment /:id below.
router.get('/product/:productId', validate(productFeedbackSchema), feedbackController.getByProduct);

// GET /api/feedback/order/:orderId - CUSTOMER: own order only. MODERATOR/OWNER: any.
router.get('/order/:orderId', validate(orderFeedbackSchema), feedbackController.getByOrder);

// POST /api/feedback - CUSTOMER submits feedback for their own completed order.
router.post('/', restrictTo(UserRole.CUSTOMER), validate(createFeedbackSchema), feedbackController.create);

// GET /api/feedback - CUSTOMER: own only. MODERATOR/OWNER: every entry, with search/filter.
router.get('/', validate(listFeedbackSchema), feedbackController.getAll);

// GET /api/feedback/:id - CUSTOMER: own only (404 otherwise). MODERATOR/OWNER: any.
router.get('/:id', validate(idParamsSchema), feedbackController.getById);

// PATCH /api/feedback/:id - CUSTOMER updates their own feedback.
router.patch('/:id', restrictTo(UserRole.CUSTOMER), validate(updateFeedbackSchema), feedbackController.update);

// DELETE /api/feedback/:id - CUSTOMER deletes their own feedback.
router.delete('/:id', restrictTo(UserRole.CUSTOMER), validate(idParamsSchema), feedbackController.remove);

export default router;
