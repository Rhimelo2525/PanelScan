import crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library';

import { env } from '../../config/env';
import { AppError } from '../../utils/AppError';

export interface VerifiedGoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  firstName?: string;
  lastName?: string;
  picture?: string;
}

interface TicketData {
  user: any;
  token: string;
  refreshToken: string;
  expiresAt: number;
}

export class GoogleAuthService {
  private oauthClient: OAuth2Client | null = null;
  private ticketStore = new Map<string, TicketData>();

  constructor() {
    // Periodic cleanup of expired exchange tickets (every 60 seconds)
    setInterval(() => this.cleanupExpiredTickets(), 60 * 1000).unref();
  }

  /**
   * Returns true if Google OAuth credentials have been provided in the environment.
   */
  isConfigured(): boolean {
    return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
  }

  /**
   * Lazily instantiates and returns the Google OAuth2 client.
   */
  getOAuthClient(): OAuth2Client {
    if (!this.isConfigured()) {
      throw new AppError(
        'Google authentication is not configured on this server. Please provide GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
        503,
      );
    }

    if (!this.oauthClient) {
      this.oauthClient = new OAuth2Client({
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        redirectUri: env.GOOGLE_REDIRECT_URI || `${env.FRONTEND_URL.replace(/\/$/, '')}/api/auth/google/callback`,
      });
    }

    return this.oauthClient;
  }

  /**
   * Generates a cryptographically strong random state string for OAuth CSRF protection.
   */
  generateState(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Generates Google's OAuth 2.0 authorization URL with minimal identity scopes.
   */
  getAuthorizationUrl(state: string): string {
    const client = this.getOAuthClient();
    return client.generateAuthUrl({
      access_type: 'offline',
      scope: ['openid', 'email', 'profile'],
      state,
      prompt: 'select_account',
    });
  }

  /**
   * Exchanges an authorization code for tokens with Google and verifies the resulting ID token.
   */
  async exchangeCodeAndVerify(code: string): Promise<VerifiedGoogleProfile> {
    const client = this.getOAuthClient();
    let tokens;
    try {
      const response = await client.getToken(code);
      tokens = response.tokens;
    } catch (error: any) {
      throw new AppError('Failed to exchange authorization code with Google: ' + (error?.message || 'Unknown error'), 400);
    }

    if (!tokens.id_token) {
      throw new AppError('Google did not return an identity token.', 400);
    }

    return this.verifyIdToken(tokens.id_token);
  }

  /**
   * Cryptographically verifies a Google ID token (signature, audience, issuer, expiry)
   * and extracts verified identity claims.
   */
  async verifyIdToken(idToken: string): Promise<VerifiedGoogleProfile> {
    const client = this.getOAuthClient();

    let ticket;
    try {
      ticket = await client.verifyIdToken({
        idToken,
        audience: env.GOOGLE_CLIENT_ID,
      });
    } catch (error: any) {
      throw new AppError('Invalid Google identity token: ' + (error?.message || 'Verification failed'), 401);
    }

    const payload = ticket.getPayload();
    if (!payload) {
      throw new AppError('Invalid Google token payload.', 401);
    }

    if (!payload.sub) {
      throw new AppError('Google token is missing the required sub identifier.', 400);
    }

    if (!payload.email) {
      throw new AppError('Google token does not contain an email address.', 400);
    }

    if (!payload.email_verified) {
      throw new AppError('Google email is not verified. Please verify your email with Google first.', 400);
    }

    return {
      sub: payload.sub,
      email: payload.email.toLowerCase(),
      emailVerified: Boolean(payload.email_verified),
      firstName: payload.given_name || payload.name?.split(' ')[0] || 'Customer',
      lastName: payload.family_name || payload.name?.split(' ').slice(1).join(' ') || '',
      picture: payload.picture,
    };
  }

  /**
   * Creates a short-lived (60s) single-use ticket to pass auth session to frontend without exposing tokens in URLs.
   */
  createExchangeTicket(authData: { user: any; token: string; refreshToken: string }): string {
    const ticket = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + 60 * 1000; // 60 seconds TTL

    this.ticketStore.set(ticket, {
      ...authData,
      expiresAt,
    });

    return ticket;
  }

  /**
   * Redeems a one-time exchange ticket, immediately deleting it to prevent replay.
   */
  redeemExchangeTicket(ticket: string): { user: any; token: string; refreshToken: string } {
    const data = this.ticketStore.get(ticket);
    if (!data) {
      throw new AppError('Invalid or expired exchange ticket. Please try signing in again.', 400);
    }

    // Single-use: delete immediately
    this.ticketStore.delete(ticket);

    if (Date.now() > data.expiresAt) {
      throw new AppError('This exchange ticket has expired. Please try signing in again.', 400);
    }

    return {
      user: data.user,
      token: data.token,
      refreshToken: data.refreshToken,
    };
  }

  private cleanupExpiredTickets(): void {
    const now = Date.now();
    for (const [ticket, data] of this.ticketStore.entries()) {
      if (now > data.expiresAt) {
        this.ticketStore.delete(ticket);
      }
    }
  }
}

export const googleAuthService = new GoogleAuthService();
