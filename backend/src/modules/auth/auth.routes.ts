import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import { authRateLimiter } from '../../middleware/rateLimit.middleware';
import { validate } from '../../middleware/validate.middleware';
import { authController } from './auth.controller';
import {
  googleAuthSchema,
  googleExchangeSchema,
  loginSchema,
  logoutSchema,
  refreshTokenSchema,
  registerSchema,
} from './auth.validation';

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

// ================================================================
// GOOGLE OAUTH 2.0 CUSTOMER AUTHENTICATION
// ================================================================

// GET /api/auth/google - redirects customer to Google OAuth consent screen
router.get('/google', authRateLimiter, authController.initiateGoogle);

// GET /api/auth/google/callback - handles redirect callback from Google
router.get('/google/callback', authController.googleCallback);

// POST /api/auth/google/exchange - redeems one-time ticket for session tokens (tokens not in URL)
router.post('/google/exchange', authRateLimiter, validate(googleExchangeSchema), authController.exchangeGoogleTicket);

// POST /api/auth/google - direct ID token / credential verification
router.post('/google', authRateLimiter, validate(googleAuthSchema), authController.googleLogin);

export default router;
