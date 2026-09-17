import { UserRole } from '@prisma/client';
import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import { restrictTo } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { paymentController } from './payment.controller';
import { createPaymentSchema, idParamsSchema, listPaymentsSchema } from './payment.validation';

const router = Router();

// POST /api/payments/webhook - PayMongo calls this directly (no JWT; the
// Paymongo-Signature header is the auth mechanism here instead). Registered
// before `authenticate` below so it's exempt from the JWT requirement. Its
// body arrives as a raw Buffer (see app.ts's express.raw() for this path).
router.post('/webhook', paymentController.webhook);

router.use(authenticate);

// GET /api/payments - CUSTOMER: own payments only. MODERATOR/OWNER: every payment.
router.get('/', validate(listPaymentsSchema), paymentController.getPayments);

// GET /api/payments/:id - CUSTOMER: own payment only (404 otherwise). MODERATOR/OWNER: any.
router.get('/:id', validate(idParamsSchema), paymentController.getById);

// POST /api/payments/create - CUSTOMER pays for their own order.
router.post('/create', restrictTo(UserRole.CUSTOMER), validate(createPaymentSchema), paymentController.create);

export default router;
