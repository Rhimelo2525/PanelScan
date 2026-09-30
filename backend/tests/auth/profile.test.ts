import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '../../src/config/database';
import { authService } from '../../src/modules/auth/auth.service';
import { authHeader, createCustomer, createOwner } from '../helpers/factories';
import { mailbox } from '../helpers/mailbox';
import app from '../helpers/testApp';

vi.mock('../../src/utils/mailer', () => ({
  sendMail: (...args: Parameters<typeof mailbox.send>) => mailbox.send(...args),
}));

beforeEach(() => mailbox.reset());

const daysFromNow = (days: number): string => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

describe('Customer profile', () => {
  describe('GET /api/auth/me', () => {
    it('returns the profile fields, verification status and hasPassword - never the password', async () => {
      const { token, user } = await createCustomer({ email: 'me-fields@panelscan.test' });
      await prisma.user.update({ where: { id: user.id }, data: { birthdate: new Date('1994-03-09T00:00:00.000Z'), address: '12 Rizal St, Manila' } });

      const response = await request(app).get('/api/auth/me').set(authHeader(token));

      expect(response.status).toBe(200);
      expect(response.body.data.user).toMatchObject({
        email: 'me-fields@panelscan.test',
        birthdate: '1994-03-09',
        address: '12 Rizal St, Manila',
        emailVerified: false,
        hasPassword: true,
      });
      expect(response.body.data.user.password).toBeUndefined();
    });

    it('reports hasPassword false for a Google-only account', async () => {
      const { token } = await createCustomer({ email: 'me-google@panelscan.test', password: null });

      const response = await request(app).get('/api/auth/me').set(authHeader(token));

      expect(response.body.data.user.hasPassword).toBe(false);
    });
  });

  describe('PATCH /api/auth/me', () => {
    it('saves name, phone, birthdate and address to the database', async () => {
      const { token, user } = await createCustomer({ email: 'profile-save@panelscan.test' });

      const response = await request(app)
        .patch('/api/auth/me')
        .set(authHeader(token))
        .send({ firstName: 'Maria', lastName: 'Santos', phone: '+63 917 123 4567', birthdate: '1990-05-20', address: '  45 Mabini Ave, Quezon City  ' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Profile updated successfully.');
      expect(response.body.data.user).toMatchObject({
        firstName: 'Maria',
        lastName: 'Santos',
        phone: '+639171234567',
        birthdate: '1990-05-20',
        address: '45 Mabini Ave, Quezon City',
      });
      expect(response.body.data.user.password).toBeUndefined();

      const stored = await prisma.user.findUnique({ where: { id: user.id } });
      expect(stored?.firstName).toBe('Maria');
      expect(stored?.address).toBe('45 Mabini Ave, Quezon City');
      expect(stored?.birthdate?.toISOString().slice(0, 10)).toBe('1990-05-20');
    });

    it('supports a partial update and leaves other fields untouched', async () => {
      const { token, user } = await createCustomer({ email: 'profile-partial@panelscan.test', firstName: 'Ana', lastName: 'Reyes' });

      const response = await request(app).patch('/api/auth/me').set(authHeader(token)).send({ phone: '09171234567' });

      expect(response.status).toBe(200);
      const stored = await prisma.user.findUnique({ where: { id: user.id } });
      // A local 0917… number is accepted but always stored as +63.
      expect(stored?.phone).toBe('+639171234567');
      expect(stored?.firstName).toBe('Ana');
      expect(stored?.lastName).toBe('Reyes');
    });

    it('sets and clears the middle initial', async () => {
      const { token, user } = await createCustomer({ email: 'profile-middle@panelscan.test' });

      const set = await request(app).patch('/api/auth/me').set(authHeader(token)).send({ middleInitial: 'r.' });
      expect(set.status).toBe(200);
      expect(set.body.data.user.middleInitial).toBe('R');

      const cleared = await request(app).patch('/api/auth/me').set(authHeader(token)).send({ middleInitial: null });
      expect(cleared.status).toBe(200);
      expect((await prisma.user.findUnique({ where: { id: user.id } }))?.middleInitial).toBeNull();
    });

    it('clears birthdate and address when sent null / an empty string', async () => {
      const { token, user } = await createCustomer({ email: 'profile-clear@panelscan.test' });
      await prisma.user.update({ where: { id: user.id }, data: { birthdate: new Date('1990-01-01T00:00:00.000Z'), address: 'Somewhere' } });

      const response = await request(app).patch('/api/auth/me').set(authHeader(token)).send({ birthdate: null, address: '   ' });

      expect(response.status).toBe(200);
      expect(response.body.data.user.birthdate).toBeNull();
      expect(response.body.data.user.address).toBeNull();
    });

    it('never changes the email address, even if one is sent', async () => {
      const { token, user } = await createCustomer({ email: 'profile-email@panelscan.test' });

      const response = await request(app)
        .patch('/api/auth/me')
        .set(authHeader(token))
        .send({ firstName: 'Kept', email: 'attacker@panelscan.test' });

      expect(response.status).toBe(200);
      const stored = await prisma.user.findUnique({ where: { id: user.id } });
      expect(stored?.email).toBe('profile-email@panelscan.test');
      expect(stored?.firstName).toBe('Kept');
    });

    it('cannot be used to escalate role or verify the email', async () => {
      const { token, user } = await createCustomer({ email: 'profile-escalate@panelscan.test' });

      const response = await request(app)
        .patch('/api/auth/me')
        .set(authHeader(token))
        .send({ firstName: 'Sneaky', role: 'OWNER', emailVerified: true, isActive: false });

      expect(response.status).toBe(200);
      const stored = await prisma.user.findUnique({ where: { id: user.id } });
      expect(stored?.role).toBe('CUSTOMER');
      expect(stored?.emailVerified).toBe(false);
      expect(stored?.isActive).toBe(true);
    });

    it.each([
      ['an empty body', {}],
      ['only an email', { email: 'x@panelscan.test' }],
      ['a too-short first name', { firstName: 'A' }],
      ['an invalid phone number', { phone: 'not-a-phone' }],
      ['a phone with 9 digits after +63', { phone: '+63 912 345 678' }],
      ['a phone with 11 digits after +63', { phone: '+63 912 345 67895' }],
      ['a phone with letters', { phone: '+63 912 ABC 6789' }],
      ['a phone with a duplicated +63', { phone: '+63 +63 912 345 6789' }],
      ['a malformed birthdate', { birthdate: '20/05/1990' }],
      ['an impossible birthdate', { birthdate: '2023-02-31' }],
      ['a birthdate before 1900', { birthdate: '1899-12-31' }],
      ['a future birthdate', { birthdate: daysFromNow(30) }],
      ['an over-long address', { address: 'x'.repeat(256) }],
    ])('rejects %s', async (_label, body) => {
      const { token } = await createCustomer({ email: `profile-invalid-${Math.random().toString(36).slice(2, 8)}@panelscan.test` });

      const response = await request(app).patch('/api/auth/me').set(authHeader(token)).send(body);

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('requires authentication', async () => {
      const response = await request(app).patch('/api/auth/me').send({ firstName: 'Nobody' });
      expect(response.status).toBe(401);
    });

    it('is customer-only, so staff accounts are unaffected', async () => {
      const { token } = await createOwner({ email: 'profile-owner@panelscan.test' });

      const response = await request(app).patch('/api/auth/me').set(authHeader(token)).send({ firstName: 'Boss' });

      expect(response.status).toBe(403);
    });
  });

  describe('registration', () => {
    const registration = {
      firstName: 'Justin',
      lastName: 'Ablog',
      email: 'register-profile@panelscan.test',
      password: 'P@nelScan2026',
      phone: '09123456789',
      birthdate: '1995-06-15',
      acceptedTerms: true,
    };

    it('persists the birthdate collected by the form', async () => {
      const response = await request(app).post('/api/auth/register').send({ ...registration, birthdate: '1995-07-14' });

      expect(response.status).toBe(201);
      expect(response.body.data.user.birthdate).toBe('1995-07-14');
    });

    // The form requires these; the API does too, so it can't be used to skip them.
    it.each([
      ['first name', 'firstName'],
      ['last name', 'lastName'],
      ['birthdate', 'birthdate'],
      ['email address', 'email'],
      ['contact number', 'phone'],
    ] as const)('rejects a registration missing the %s and creates no account', async (_label, field) => {
      const body: Partial<typeof registration> = { ...registration };
      delete body[field];
      const response = await request(app).post('/api/auth/register').send(body);

      expect(response.status).toBe(400);
      expect(await prisma.user.count({ where: { email: registration.email } })).toBe(0);
    });

    it.each([
      ['an empty contact number', { phone: '' }],
      ['an incomplete contact number', { phone: '+63 912 345 678' }],
      ['an invalid email address', { email: 'not-an-email' }],
      ['an empty first name', { firstName: '   ' }],
      ['a first name with numbers', { firstName: '123123' }],
      ['a first name mixing letters and numbers', { firstName: 'Juan2' }],
      ['a last name with numbers', { lastName: 'Dela Cruz 3' }],
      ['a last name with symbols', { lastName: 'Cruz!' }],
      ['a numeric middle initial', { middleInitial: '123123' }],
      ['an invalid middle initial', { middleInitial: 'M1' }],
      ['a too-long middle initial', { middleInitial: 'ABCD' }],
    ])('rejects %s', async (_label, override) => {
      const response = await request(app).post('/api/auth/register').send({ ...registration, ...override });
      expect(response.status).toBe(400);
    });

    it('accepts real-world names with spaces, hyphens, apostrophes, periods and ñ', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({ ...registration, firstName: 'Ma. Cristina', lastName: "Dela Cruz-O'Neil Peñaflor" });

      expect(response.status).toBe(201);
      expect(response.body.data.user.lastName).toBe("Dela Cruz-O'Neil Peñaflor");
    });

    it('creates the account without a middle initial', async () => {
      const response = await request(app).post('/api/auth/register').send({ ...registration, middleInitial: '' });

      expect(response.status).toBe(201);
      expect(response.body.data.user.middleInitial).toBeNull();
    });

    it.each([
      ['M.', 'M'],
      ['m', 'M'],
      ['D. C.', 'DC'],
    ])('saves the middle initial %s as %s', async (input, stored) => {
      const response = await request(app).post('/api/auth/register').send({ ...registration, middleInitial: input });

      expect(response.status).toBe(201);
      expect(response.body.data.user.middleInitial).toBe(stored);
      const saved = await prisma.user.findUnique({ where: { email: registration.email } });
      expect(saved?.middleInitial).toBe(stored);
      expect(saved?.phone).toBe('+639123456789');
    });

    it('rejects an invalid birthdate', async () => {
      const response = await request(app).post('/api/auth/register').send({ ...registration, birthdate: daysFromNow(400) });
      expect(response.status).toBe(400);
    });

    it('creates the account unverified and emails a verification code', async () => {
      const response = await request(app).post('/api/auth/register').send(registration);

      expect(response.status).toBe(201);
      expect(response.body.data.user.emailVerified).toBe(false);
      expect(mailbox.to(registration.email)).toHaveLength(1);
      expect(mailbox.lastCodeFor(registration.email)).toMatch(/^\d{6}$/);
    });

    it('still creates the account when the verification email cannot be sent', async () => {
      mailbox.failing = true;

      const response = await request(app).post('/api/auth/register').send(registration);

      expect(response.status).toBe(201);
      const stored = await prisma.user.findUnique({ where: { email: registration.email } });
      expect(stored).not.toBeNull();
      expect(await prisma.emailVerificationCode.count({ where: { userId: stored!.id } })).toBe(0);
    });
  });

  describe('Google sign-in', () => {
    const profile = { sub: 'google-sub-1', email: 'google-new@panelscan.test', emailVerified: true, firstName: 'Gina', lastName: 'Lopez' };

    it('creates new Google customers with a verified email', async () => {
      const { user } = await authService.loginWithGoogle(profile);

      expect(user.emailVerified).toBe(true);
      expect(user.hasPassword).toBe(false);
    });

    it('marks an existing password account verified when Google links to it', async () => {
      const { user: existing } = await createCustomer({ email: profile.email });
      expect(existing.emailVerified).toBe(false);

      const { user } = await authService.loginWithGoogle(profile);

      expect(user.id).toBe(existing.id);
      expect(user.emailVerified).toBe(true);
    });
  });
});
