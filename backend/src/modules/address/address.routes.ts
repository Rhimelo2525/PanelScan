import { UserRole } from '@prisma/client';
import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import { restrictTo } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { addressController } from './address.controller';
import { addressIdParamsSchema, createAddressSchema, reverseGeocodeSchema, updateAddressSchema } from './address.validation';

const router = Router();

// Saved shipping addresses are a CUSTOMER-only, self-service resource - always
// "my addresses". Staff see the address an order used through the order's own
// delivery-location snapshot, never through this module.
router.use(authenticate, restrictTo(UserRole.CUSTOMER));

// GET /api/addresses/reverse-geocode?latitude=..&longitude=.. - registered
// before /:id-shaped routes so "reverse-geocode" is never read as an id.
router.get('/reverse-geocode', validate(reverseGeocodeSchema), addressController.reverseGeocode);

// GET /api/addresses
router.get('/', addressController.list);

// POST /api/addresses
router.post('/', validate(createAddressSchema), addressController.create);

// PUT /api/addresses/:id - full replacement; the address form always sends every field.
router.put('/:id', validate(updateAddressSchema), addressController.update);

// PATCH /api/addresses/:id/default
router.patch('/:id/default', validate(addressIdParamsSchema), addressController.setDefault);

// DELETE /api/addresses/:id
router.delete('/:id', validate(addressIdParamsSchema), addressController.remove);

export default router;
