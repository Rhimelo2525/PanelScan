import { UserRole } from '@prisma/client';
import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import { accountSecurityRateLimiter, authRateLimiter } from '../../middleware/rateLimit.middleware';
import { restrictTo } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { authController } from './auth.controller';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  googleAuthSchema,
  googleExchangeSchema,
  loginSchema,
  logoutSchema,
  refreshTokenSchema,
  registerSchema,
  resetPasswordSchema,
  updateProfileSchema,
  verifyEmailSchema,
  verifyResetCodeSchema,
} from './auth.validation';

const router = Router();

// POST /api/auth/register - shares authRateLimiter's counter with /login and /refresh (brute-force protection).
router.post('/register', authRateLimiter, validate(registerSchema), authController.register);

// POST /api/auth/login
router.post('/login', authRateLimiter, validate(loginSchema), authController.login);

// GET /api/auth/me
router.get('/me', authenticate, authController.getMe);

// ================================================================
// CUSTOMER PROFILE, PASSWORD AND EMAIL VERIFICATION
// ================================================================
// Customer-only (restrictTo) so staff sign-in and account handling are not
// affected by anything below. All share accountSecurityRateLimiter's counter.

// PATCH /api/auth/me - edit own profile details (email is not editable here)
router.patch('/me', authenticate, restrictTo(UserRole.CUSTOMER), validate(updateProfileSchema), authController.updateProfile);

// POST /api/auth/change-password - requires the current password
router.post(
  '/change-password',
  accountSecurityRateLimiter,
  authenticate,
  restrictTo(UserRole.CUSTOMER),
  validate(changePasswordSchema),
  authController.changePassword,
);

// POST /api/auth/send-verification-email - emails a one-time code to the account's address
router.post(
  '/send-verification-email',
  accountSecurityRateLimiter,
  authenticate,
  restrictTo(UserRole.CUSTOMER),
  authController.sendVerificationEmail,
);

// POST /api/auth/verify-email - redeems that code and marks the email verified
router.post(
  '/verify-email',
  accountSecurityRateLimiter,
  authenticate,
  restrictTo(UserRole.CUSTOMER),
  validate(verifyEmailSchema),
  authController.verifyEmail,
);

// ================================================================
// FORGOT PASSWORD (public - the customer is signed out)
// ================================================================

// POST /api/auth/forgot-password - always answers identically, whether or not the email has an account
router.post('/forgot-password', accountSecurityRateLimiter, validate(forgotPasswordSchema), authController.forgotPassword);

// POST /api/auth/verify-reset-code - checks the emailed code without using it up
router.post('/verify-reset-code', accountSecurityRateLimiter, validate(verifyResetCodeSchema), authController.verifyResetCode);

// POST /api/auth/reset-password - redeems the code (single use) and sets the new password
router.post('/reset-password', accountSecurityRateLimiter, validate(resetPasswordSchema), authController.resetPassword);

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
