import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import { authRateLimiter } from '../../middleware/rateLimit.middleware';
import { validate } from '../../middleware/validate.middleware';
import { authController } from './auth.controller';
import { loginSchema, logoutSchema, refreshTokenSchema, registerSchema } from './auth.validation';

const router = Router();

// POST /api/auth/register - shares authRateLimiter's counter with /login and /refresh (brute-force protection).
router.post('/register', authRateLimiter, validate(registerSchema), authController.register);

// POST /api/auth/login
router.post('/login', authRateLimiter, validate(loginSchema), authController.login);

// GET /api/auth/me
router.get('/me', authenticate, authController.getMe);

// POST /api/auth/refresh - no access token required (that's the point of a refresh token), so
// it's public but shares the same brute-force protection as login/register.
router.post('/refresh', authRateLimiter, validate(refreshTokenSchema), authController.refresh);

// POST /api/auth/logout - requires a valid (not-yet-expired) access token; revokes only the one
// refresh token supplied in the body, not every session belonging to the user.
router.post('/logout', authenticate, validate(logoutSchema), authController.logout);

export default router;
