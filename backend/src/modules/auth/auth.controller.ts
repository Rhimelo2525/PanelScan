import type { Request, Response } from 'express';

import { env } from '../../config/env';
import { catchAsync } from '../../utils/catchAsync';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../utils/AppError';
import { AuthService, authService } from './auth.service';
import { GoogleAuthService, googleAuthService, type VerifiedGoogleProfile } from './googleAuth.service';

export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly googleAuth: GoogleAuthService = googleAuthService,
  ) {}

  register = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { user, token } = await this.authService.register(req.body);
    sendSuccess(res, 201, 'User registered successfully.', { user, token });
  });

  login = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { user, token, refreshToken } = await this.authService.login(req.body);
    sendSuccess(res, 200, 'Login successful.', { user, token, refreshToken });
  });

  getMe = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new AppError('Authentication required.', 401);
    }
    const user = await this.authService.getCurrentUser(req.user.id);
    sendSuccess(res, 200, 'Current user retrieved successfully.', { user });
  });

  refresh = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { token, refreshToken } = await this.authService.refresh(req.body.refreshToken);
    sendSuccess(res, 200, 'Token refreshed successfully.', { token, refreshToken });
  });

  logout = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new AppError('Authentication required.', 401);
    }
    await this.authService.logout(req.user.id, req.body.refreshToken);
    sendSuccess(res, 200, 'Logged out successfully.');
  });

  /**
   * Initiates Google OAuth 2.0 redirect flow for Customers.
   * Sets a secure HttpOnly state cookie for CSRF protection and redirects to Google.
   */
  initiateGoogle = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (!this.googleAuth.isConfigured()) {
      throw new AppError(
        'Google authentication is not configured on this server. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
        503,
      );
    }

    const state = this.googleAuth.generateState();
    // Validate returnTo to prevent open-redirect vulnerabilities
    const returnTo =
      typeof req.query.returnTo === 'string' && req.query.returnTo.startsWith('/') && !req.query.returnTo.startsWith('//')
        ? req.query.returnTo
        : '';

    res.cookie('panelscan_oauth_state', JSON.stringify({ state, returnTo }), {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60 * 1000, // 10 minutes
    });

    const authUrl = this.googleAuth.getAuthorizationUrl(state);
    res.redirect(authUrl);
  });

  /**
   * Handles the redirect callback from Google OAuth.
   * Verifies CSRF state, exchanges code for ID token, verifies identity,
   * creates/links customer, issues session tokens, and returns via a one-time exchange ticket.
   */
  googleCallback = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const frontendUrl = env.FRONTEND_URL.replace(/\/$/, '');
    const storedCookie = req.cookies?.panelscan_oauth_state;

    // Clear state cookie immediately
    res.clearCookie('panelscan_oauth_state', {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
    });

    let returnTo = '';
    let expectedState = '';
    if (storedCookie) {
      try {
        const parsed = typeof storedCookie === 'string' ? JSON.parse(storedCookie) : storedCookie;
        expectedState = parsed.state || '';
        returnTo = parsed.returnTo || '';
      } catch {
        // Malformed cookie
      }
    }

    const queryState = req.query.state as string | undefined;
    if (!expectedState || !queryState || expectedState !== queryState) {
      res.redirect(`${frontendUrl}/login?error=invalid_state`);
      return;
    }

    if (req.query.error) {
      const errorParam = req.query.error === 'access_denied' ? 'cancelled' : 'oauth_error';
      res.redirect(`${frontendUrl}/login?error=${errorParam}`);
      return;
    }

    const code = req.query.code as string | undefined;
    if (!code) {
      res.redirect(`${frontendUrl}/login?error=missing_code`);
      return;
    }

    try {
      const profile = await this.googleAuth.exchangeCodeAndVerify(code);
      const authResult = await this.authService.loginWithGoogle(profile);
      // Use a one-time ticket so JWT and refresh token are NEVER exposed in the URL
      const ticket = this.googleAuth.createExchangeTicket(authResult);
      const target = `${frontendUrl}/login?ticket=${encodeURIComponent(ticket)}${returnTo ? `&from=${encodeURIComponent(returnTo)}` : ''}`;
      res.redirect(target);
    } catch (err: any) {
      const status = err?.statusCode || 500;
      if (status === 403) {
        res.redirect(`${frontendUrl}/login?error=deactivated`);
      } else if (err?.message?.includes('verified')) {
        res.redirect(`${frontendUrl}/login?error=unverified_email`);
      } else {
        res.redirect(`${frontendUrl}/login?error=auth_failed`);
      }
    }
  });

  /**
   * Exchanges a one-time ticket for customer session tokens.
   */
  exchangeGoogleTicket = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { ticket } = req.body;
    const result = this.googleAuth.redeemExchangeTicket(ticket);
    sendSuccess(res, 200, 'Login successful.', result);
  });

  /**
   * Direct Google authentication endpoint (accepts verified credential ID token or code).
   */
  googleLogin = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { credential, code } = req.body;
    let profile: VerifiedGoogleProfile;

    if (credential) {
      profile = await this.googleAuth.verifyIdToken(credential);
    } else if (code) {
      profile = await this.googleAuth.exchangeCodeAndVerify(code);
    } else {
      throw new AppError('Either credential or authorization code is required.', 400);
    }

    const result = await this.authService.loginWithGoogle(profile);
    sendSuccess(res, 200, 'Login successful.', result);
  });
}

export const authController = new AuthController(authService, googleAuthService);
