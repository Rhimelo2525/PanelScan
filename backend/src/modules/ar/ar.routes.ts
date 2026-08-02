import { UserRole } from '@prisma/client';
import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import { restrictTo } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { arController } from './ar.controller';
import {
  createMeasurementSchema,
  estimatePanelsSchema,
  idParamsSchema,
  listMeasurementsSchema,
  updateMeasurementSchema,
} from './ar.validation';

const router = Router();

router.use(authenticate);

// POST /api/ar/estimate - any authenticated role. A CUSTOMER referencing
// someone else's measurementId still 404s (enforced in the service);
// OWNER/MODERATOR may reference any measurement, useful for staff running
// an estimate on a customer's behalf.
router.post('/estimate', validate(estimatePanelsSchema), arController.estimate);

// POST /api/ar/measurements - CUSTOMER creates their own measurement.
router.post('/measurements', restrictTo(UserRole.CUSTOMER), validate(createMeasurementSchema), arController.create);

// GET /api/ar/measurements - CUSTOMER: own only. MODERATOR/OWNER: every measurement.
router.get('/measurements', validate(listMeasurementsSchema), arController.getAll);

// GET /api/ar/measurements/:id - CUSTOMER: own only (404 otherwise). MODERATOR/OWNER: any.
router.get('/measurements/:id', validate(idParamsSchema), arController.getById);

// PATCH /api/ar/measurements/:id - CUSTOMER updates their own measurement.
router.patch('/measurements/:id', restrictTo(UserRole.CUSTOMER), validate(updateMeasurementSchema), arController.update);

// DELETE /api/ar/measurements/:id - CUSTOMER deletes their own measurement.
router.delete('/measurements/:id', restrictTo(UserRole.CUSTOMER), validate(idParamsSchema), arController.remove);

export default router;
