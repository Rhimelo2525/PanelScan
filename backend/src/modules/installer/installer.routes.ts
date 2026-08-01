import { UserRole } from '@prisma/client';
import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import { restrictTo } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { installerController } from './installer.controller';
import { createInstallerSchema, idParamsSchema, listInstallersSchema, updateInstallerSchema } from './installer.validation';

const router = Router();

// Installer management is MODERATOR-only across the board, per this
// module's explicit authorization rules ("manage installers" is listed
// only under MODERATOR - OWNER's stated capability is "monitor
// bookings/projects", which doesn't mention installers).
router.use(authenticate, restrictTo(UserRole.MODERATOR));

// GET /api/installers - active installers only
router.get('/', validate(listInstallersSchema), installerController.getAll);

// GET /api/installers/:id
router.get('/:id', validate(idParamsSchema), installerController.getById);

// POST /api/installers
router.post('/', validate(createInstallerSchema), installerController.create);

// PATCH /api/installers/:id
router.patch('/:id', validate(updateInstallerSchema), installerController.update);

// PATCH /api/installers/:id/deactivate
router.patch('/:id/deactivate', validate(idParamsSchema), installerController.deactivate);

export default router;
