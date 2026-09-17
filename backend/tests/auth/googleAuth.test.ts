import request from 'supertest';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { env } from '../../src/config/env';
import { prisma } from '../../src/config/database';
import { googleAuthService } from '../../src/modules/auth/googleAuth.service';
import { createTestUser } from '../helpers/factories';
import app from '../helpers/testApp';

describe('Google Authentication module', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/auth/google (OAuth redirect initiation)', () => {
    it('returns 503 if Google OAuth is not configured in the environment', async () => {
      const origClientId = env.GOOGLE_CLIENT_ID;
      (env as any).GOOGLE_CLIENT_ID = undefined;

      const response = await request(app).get('/api/auth/google');

      expect(response.status).toBe(503);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/not configured/i);

      (env as any).GOOGLE_CLIENT_ID = origClientId;
    });

    it('sets a secure state cookie and redirects to Google when configured', async () => {
      (env as any).GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
      (env as any).GOOGLE_CLIENT_SECRET = 'test-client-secret';

      vi.spyOn(googleAuthService, 'getAuthorizationUrl').mockReturnValue(
        'https://accounts.google.com/o/oauth2/v2/auth?client_id=test-client-id&state=mockstate',
      );

      const response = await request(app).get('/api/auth/google?returnTo=/checkout');

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('https://accounts.google.com');

      const setCookie = response.headers['set-cookie'];
      expect(setCookie).toBeDefined();
      expect(setCookie![0]).toMatch(/panelscan_oauth_state/);
      expect(setCookie![0]).toMatch(/HttpOnly/i);
    });
  });

  describe('GET /api/auth/google/callback (OAuth callback handling)', () => {
    it('redirects with error=invalid_state if state cookie is missing or mismatched', async () => {
      const response = await request(app)
        .get('/api/auth/google/callback?code=some-code&state=bad-state')
        .set('Cookie', ['panelscan_oauth_state=' + encodeURIComponent(JSON.stringify({ state: 'expected-state' }))]);

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('error=invalid_state');
    });

    it('redirects with error=cancelled if Google returns user cancellation (access_denied)', async () => {
      const state = 'valid-state-123';
      const cookieVal = encodeURIComponent(JSON.stringify({ state, returnTo: '/cart' }));

      const response = await request(app)
        .get(`/api/auth/google/callback?error=access_denied&state=${state}`)
        .set('Cookie', [`panelscan_oauth_state=${cookieVal}`]);

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('error=cancelled');
    });

    it('redirects with error=missing_code if code is absent', async () => {
      const state = 'valid-state-456';
      const cookieVal = encodeURIComponent(JSON.stringify({ state }));

      const response = await request(app)
        .get(`/api/auth/google/callback?state=${state}`)
        .set('Cookie', [`panelscan_oauth_state=${cookieVal}`]);

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('error=missing_code');
    });

    it('successfully processes callback and issues a one-time exchange ticket', async () => {
      const state = 'valid-state-789';
      const cookieVal = encodeURIComponent(JSON.stringify({ state, returnTo: '/dashboard' }));

      vi.spyOn(googleAuthService, 'exchangeCodeAndVerify').mockResolvedValue({
        sub: 'google-sub-callback-test',
        email: 'callback.user@panelscan.test',
        emailVerified: true,
        firstName: 'Callback',
        lastName: 'User',
      });

      const response = await request(app)
        .get(`/api/auth/google/callback?code=valid-auth-code&state=${state}`)
        .set('Cookie', [`panelscan_oauth_state=${cookieVal}`]);

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain('ticket=');
      expect(response.headers.location).toContain('from=%2Fdashboard');
      // Verify tokens are NOT leaked directly in the redirect URL
      expect(response.headers.location).not.toContain('eyJ'); // not a JWT
    });
  });

  describe('POST /api/auth/google/exchange (One-time ticket exchange)', () => {
    it('rejects an invalid or expired ticket with 400', async () => {
      const response = await request(app).post('/api/auth/google/exchange').send({
        ticket: 'non-existent-ticket',
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/invalid or expired/i);
    });

    it('redeems a ticket once and immediately destroys it (single-use / replay protection)', async () => {
      const fakeUser = { id: 'test-id', email: 'test@panelscan.test', role: 'CUSTOMER' };
      const ticket = googleAuthService.createExchangeTicket({
        user: fakeUser,
        token: 'fake-jwt-token',
        refreshToken: 'fake-refresh-token',
      });

      // First exchange: succeeds
      const firstResponse = await request(app).post('/api/auth/google/exchange').send({ ticket });

      expect(firstResponse.status).toBe(200);
      expect(firstResponse.body.success).toBe(true);
      expect(firstResponse.body.data.token).toBe('fake-jwt-token');
      expect(firstResponse.body.data.user.email).toBe('test@panelscan.test');

      // Second exchange with the same ticket: must be rejected (replay attack prevention)
      const secondResponse = await request(app).post('/api/auth/google/exchange').send({ ticket });

      expect(secondResponse.status).toBe(400);
      expect(secondResponse.body.success).toBe(false);
      expect(secondResponse.body.message).toMatch(/invalid or expired/i);
    });
  });

  describe('POST /api/auth/google (Direct ID token / credential verification)', () => {
    it('rejects an unverified Google email with 400', async () => {
      vi.spyOn(googleAuthService, 'verifyIdToken').mockResolvedValue({
        sub: 'unverified-sub',
        email: 'unverified@panelscan.test',
        emailVerified: false,
      });

      const response = await request(app).post('/api/auth/google').send({
        credential: 'mock-unverified-credential',
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/not verified/i);
    });

    it('registers a new customer when no account exists, assigning only CUSTOMER role', async () => {
      vi.spyOn(googleAuthService, 'verifyIdToken').mockResolvedValue({
        sub: 'google-sub-new-customer-123',
        email: 'brandnew.google@panelscan.test',
        emailVerified: true,
        firstName: 'Google',
        lastName: 'Newbie',
      });

      const response = await request(app).post('/api/auth/google').send({
        credential: 'valid-google-id-token',
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe('brandnew.google@panelscan.test');
      expect(response.body.data.user.role).toBe('CUSTOMER');
      expect(response.body.data.user.password).toBeUndefined();
      expect(typeof response.body.data.token).toBe('string');
      expect(typeof response.body.data.refreshToken).toBe('string');

      const dbUser = await prisma.user.findUnique({ where: { email: 'brandnew.google@panelscan.test' } });
      expect(dbUser).not.toBeNull();
      expect(dbUser?.googleId).toBe('google-sub-new-customer-123');
      expect(dbUser?.role).toBe('CUSTOMER');
      expect(dbUser?.password).toBeNull();
    });

    it('authenticates a returning Google customer without creating a duplicate record', async () => {
      vi.spyOn(googleAuthService, 'verifyIdToken').mockResolvedValue({
        sub: 'google-sub-returning-456',
        email: 'returning.google@panelscan.test',
        emailVerified: true,
        firstName: 'Returning',
        lastName: 'Customer',
      });

      // First sign-in
      const first = await request(app).post('/api/auth/google').send({ credential: 'token-1' });
      expect(first.status).toBe(200);
      const firstUserId = first.body.data.user.id;

      // Repeated sign-in
      const second = await request(app).post('/api/auth/google').send({ credential: 'token-2' });
      expect(second.status).toBe(200);
      expect(second.body.data.user.id).toBe(firstUserId);

      // Verify only 1 record exists in the database
      const count = await prisma.user.count({ where: { googleId: 'google-sub-returning-456' } });
      expect(count).toBe(1);
    });

    it('securely links an existing email/password account when verified email matches', async () => {
      const email = 'existing.password.user@panelscan.test';
      const { user: existingUser, password } = await createTestUser({ email });
      expect(existingUser.googleId).toBeNull();

      vi.spyOn(googleAuthService, 'verifyIdToken').mockResolvedValue({
        sub: 'google-sub-linked-789',
        email,
        emailVerified: true,
        firstName: 'Linked',
        lastName: 'Account',
      });

      const response = await request(app).post('/api/auth/google').send({ credential: 'valid-token' });

      expect(response.status).toBe(200);
      expect(response.body.data.user.id).toBe(existingUser.id);

      // Verify database updated with googleId while preserving password
      const updatedUser = await prisma.user.findUnique({ where: { id: existingUser.id } });
      expect(updatedUser?.googleId).toBe('google-sub-linked-789');
      expect(updatedUser?.password).not.toBeNull();

      // Verify the user can STILL log in with their original password
      const pwdLogin = await request(app).post('/api/auth/login').send({ email, password });
      expect(pwdLogin.status).toBe(200);
      expect(pwdLogin.body.data.user.id).toBe(existingUser.id);
    });

    it('rejects login if the matching account is deactivated (403)', async () => {
      const email = 'inactive.google@panelscan.test';
      await createTestUser({ email, isActive: false });

      vi.spyOn(googleAuthService, 'verifyIdToken').mockResolvedValue({
        sub: 'google-sub-inactive',
        email,
        emailVerified: true,
      });

      const response = await request(app).post('/api/auth/google').send({ credential: 'token' });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/deactivated/i);
    });

    it('verifies that the issued session token works with /api/auth/me and protected customer routes', async () => {
      vi.spyOn(googleAuthService, 'verifyIdToken').mockResolvedValue({
        sub: 'google-sub-session-verify',
        email: 'session.test@panelscan.test',
        emailVerified: true,
        firstName: 'Session',
        lastName: 'Tester',
      });

      const loginRes = await request(app).post('/api/auth/google').send({ credential: 'token' });
      expect(loginRes.status).toBe(200);
      const token = loginRes.body.data.token;

      // GET /api/auth/me
      const meRes = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
      expect(meRes.status).toBe(200);
      expect(meRes.body.data.user.email).toBe('session.test@panelscan.test');
      expect(meRes.body.data.user.role).toBe('CUSTOMER');
    });

    it('preserves price visibility business rule: hidden logged out, visible after Google login', async () => {
      // 1. Unauthenticated guest: product price is null (hidden)
      const guestRes = await request(app).get('/api/products');
      expect(guestRes.status).toBe(200);
      const products = guestRes.body.data.products;
      if (products.length > 0) {
        expect(products[0].price).toBeNull();
      }

      // 2. Authenticated via Google: product price is visible
      vi.spyOn(googleAuthService, 'verifyIdToken').mockResolvedValue({
        sub: 'google-sub-price-check',
        email: 'price.check@panelscan.test',
        emailVerified: true,
      });

      const loginRes = await request(app).post('/api/auth/google').send({ credential: 'token' });
      const token = loginRes.body.data.token;

      const authRes = await request(app).get('/api/products').set('Authorization', `Bearer ${token}`);
      expect(authRes.status).toBe(200);
      const authProducts = authRes.body.data.products;
      if (authProducts.length > 0) {
        expect(authProducts[0].price).not.toBeNull();
      }
    });
  });
});
