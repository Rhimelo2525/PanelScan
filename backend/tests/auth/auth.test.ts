import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import { createTestUser } from '../helpers/factories';
import app from '../helpers/testApp';

describe('Auth module', () => {
  describe('POST /api/auth/register', () => {
    it('registers a new user, hashes the password, and always assigns CUSTOMER', async () => {
      const response = await request(app).post('/api/auth/register').send({
        firstName: 'Justin',
        lastName: 'Ablog',
        email: 'justin.register@panelscan.test',
        password: 'P@nelScan2026',
        phone: '09123456789',
        acceptedTerms: true,
      });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('User registered successfully.');
      expect(response.body.data.user.email).toBe('justin.register@panelscan.test');
      expect(response.body.data.user.role).toBe('CUSTOMER');
      expect(response.body.data.user.password).toBeUndefined();
      expect(typeof response.body.data.token).toBe('string');

      const dbUser = await prisma.user.findUnique({ where: { email: 'justin.register@panelscan.test' } });
      expect(dbUser).not.toBeNull();
      expect(dbUser?.password).not.toBe('P@nelScan2026');
      expect(dbUser?.role).toBe('CUSTOMER');
      expect(dbUser?.termsAcceptedAt).not.toBeNull();
    });

    it('ignores a client-supplied role and still creates a CUSTOMER', async () => {
      const response = await request(app).post('/api/auth/register').send({
        firstName: 'Sneaky',
        lastName: 'User',
        email: 'sneaky@panelscan.test',
        password: 'P@nelScan2026',
        role: 'OWNER',
        acceptedTerms: true,
      });

      expect(response.status).toBe(201);
      expect(response.body.data.user.role).toBe('CUSTOMER');
    });

    it('rejects a duplicate email with 409 and does not create a second row', async () => {
      const payload = {
        firstName: 'Dup',
        lastName: 'User',
        email: 'dup@panelscan.test',
        password: 'P@nelScan2026',
        acceptedTerms: true,
      };

      const first = await request(app).post('/api/auth/register').send(payload);
      expect(first.status).toBe(201);

      const second = await request(app).post('/api/auth/register').send(payload);

      expect(second.status).toBe(409);
      expect(second.body.success).toBe(false);
      expect(second.body.message).toMatch(/already exists/i);

      const count = await prisma.user.count({ where: { email: 'dup@panelscan.test' } });
      expect(count).toBe(1);
    });

    it('rejects registration with acceptedTerms: false → FAIL (400)', async () => {
      const response = await request(app).post('/api/auth/register').send({
        firstName: 'Terms',
        lastName: 'Declined',
        email: 'terms.declined@panelscan.test',
        password: 'P@nelScan2026',
        acceptedTerms: false,
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(JSON.stringify(response.body.errors)).toMatch(/Terms of Use and Privacy Policy/i);
    });

    it('rejects registration missing acceptedTerms consent → FAIL (400)', async () => {
      const response = await request(app).post('/api/auth/register').send({
        firstName: 'Missing',
        lastName: 'Consent',
        email: 'missing.consent@panelscan.test',
        password: 'P@nelScan2026',
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(JSON.stringify(response.body.errors)).toMatch(/Terms of Use and Privacy Policy/i);
    });

    it('rejects invalid registration input with 400 and field-level errors', async () => {
      const response = await request(app).post('/api/auth/register').send({
        firstName: 'A',
        lastName: 'User',
        email: 'not-an-email',
        password: 'short',
        acceptedTerms: true,
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed.');
      expect(Array.isArray(response.body.errors)).toBe(true);
      expect(response.body.errors.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/auth/login', () => {
    it('logs in successfully with correct credentials', async () => {
      const { user, password } = await createTestUser({ email: 'login-ok@panelscan.test' });

      const response = await request(app).post('/api/auth/login').send({ email: user.email, password });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Login successful.');
      expect(response.body.data.user.id).toBe(user.id);
      expect(typeof response.body.data.token).toBe('string');
    });

    it('rejects an invalid password with 401', async () => {
      const { user } = await createTestUser({ email: 'login-bad@panelscan.test' });

      const response = await request(app).post('/api/auth/login').send({ email: user.email, password: 'WrongPassword123' });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid email or password.');
    });

    it('rejects login for a deactivated account with 403', async () => {
      const { user, password } = await createTestUser({ email: 'login-inactive@panelscan.test', isActive: false });

      const response = await request(app).post('/api/auth/login').send({ email: user.email, password });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/auth/me (JWT authentication)', () => {
    it('returns the authenticated user profile for a valid token', async () => {
      const { user, token } = await createTestUser({ email: 'me@panelscan.test' });

      const response = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.id).toBe(user.id);
      expect(response.body.data.user.email).toBe(user.email);
      expect(response.body.data.user.password).toBeUndefined();
    });

    it('returns 401 for a request with no token', async () => {
      const response = await request(app).get('/api/auth/me');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('returns 401 for a request with a malformed token', async () => {
      const response = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-real-token');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });
});
