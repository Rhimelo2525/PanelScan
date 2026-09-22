import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import { comparePassword } from '../../src/utils/password';
import { authHeader, createCustomer, createOwner, createTestRefreshToken, TEST_PASSWORD } from '../helpers/factories';
import app from '../helpers/testApp';

const NEW_PASSWORD = 'N3w-Str0ng!Pass';

const changePassword = (token: string, body: Record<string, unknown>) =>
  request(app).post('/api/auth/change-password').set(authHeader(token)).send(body);

const validBody = (overrides: Record<string, unknown> = {}) => ({
  currentPassword: TEST_PASSWORD,
  newPassword: NEW_PASSWORD,
  confirmPassword: NEW_PASSWORD,
  ...overrides,
});

describe('POST /api/auth/change-password', () => {
  it('changes the password when the current one is correct', async () => {
    const { token, user } = await createCustomer({ email: 'cp-ok@panelscan.test' });

    const response = await changePassword(token, validBody());

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Password changed successfully.');

    const newLogin = await request(app).post('/api/auth/login').send({ email: user.email, password: NEW_PASSWORD });
    expect(newLogin.status).toBe(200);
    const oldLogin = await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
    expect(oldLogin.status).toBe(401);
  });

  it('stores only a bcrypt hash of the new password', async () => {
    const { token, user } = await createCustomer({ email: 'cp-hash@panelscan.test' });

    await changePassword(token, validBody());

    const stored = await prisma.user.findUnique({ where: { id: user.id } });
    expect(stored?.password).not.toBe(NEW_PASSWORD);
    expect(stored?.password).toMatch(/^\$2[aby]\$/);
    expect(await comparePassword(NEW_PASSWORD, stored!.password!)).toBe(true);
  });

  it('rejects a wrong current password with 400 (not 401, which would log the customer out) and changes nothing', async () => {
    const { token, user } = await createCustomer({ email: 'cp-wrong@panelscan.test' });

    const response = await changePassword(token, validBody({ currentPassword: 'Wr0ng-Current!1' }));

    expect(response.status).toBe(400);
    expect(response.body.message).toBe('Your current password is incorrect.');
    const stored = await prisma.user.findUnique({ where: { id: user.id } });
    expect(await comparePassword(TEST_PASSWORD, stored!.password!)).toBe(true);
  });

  it('rejects a new password that matches the current one', async () => {
    const { token } = await createCustomer({ email: 'cp-same@panelscan.test', password: NEW_PASSWORD });

    const response = await changePassword(token, validBody({ currentPassword: NEW_PASSWORD }));

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body.errors)).toContain('must be different');
  });

  it.each([
    ['too short', 'Ab1!'],
    ['no uppercase letter', 'n3w-str0ng!pass'],
    ['no number', 'New-Strong!Pass'],
    ['no special character', 'N3wStr0ngPass'],
    ['containing a space', 'N3w Str0ng!Pass'],
    ['too common', 'Password123!'],
    ['longer than 16 characters', 'N3w-Str0ng!Pass-Too-Long'],
  ])('enforces the password policy: %s', async (_label, newPassword) => {
    const { token } = await createCustomer({ email: `cp-policy-${Math.random().toString(36).slice(2, 8)}@panelscan.test` });

    const response = await changePassword(token, validBody({ newPassword, confirmPassword: newPassword }));

    expect(response.status).toBe(400);
  });

  it('rejects a confirmation that does not match', async () => {
    const { token } = await createCustomer({ email: 'cp-mismatch@panelscan.test' });

    const response = await changePassword(token, validBody({ confirmPassword: 'Different-1!Pass' }));

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body.errors)).toContain('do not match');
  });

  it('requires the current password field', async () => {
    const { token } = await createCustomer({ email: 'cp-missing@panelscan.test' });

    const response = await changePassword(token, { newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD });

    expect(response.status).toBe(400);
  });

  it("signs out the customer's other sessions but keeps the one making the request", async () => {
    const { token, user } = await createCustomer({ email: 'cp-sessions@panelscan.test' });
    const thisDevice = await createTestRefreshToken({ userId: user.id });
    const otherDevice = await createTestRefreshToken({ userId: user.id });

    const response = await changePassword(token, validBody({ refreshToken: thisDevice.plainToken }));

    expect(response.status).toBe(200);
    expect((await prisma.refreshToken.findUnique({ where: { id: thisDevice.record.id } }))?.revokedAt).toBeNull();
    expect((await prisma.refreshToken.findUnique({ where: { id: otherDevice.record.id } }))?.revokedAt).not.toBeNull();
  });

  it('signs out every session when no current refresh token is supplied', async () => {
    const { token, user } = await createCustomer({ email: 'cp-all@panelscan.test' });
    const session = await createTestRefreshToken({ userId: user.id });

    await changePassword(token, validBody());

    expect((await prisma.refreshToken.findUnique({ where: { id: session.record.id } }))?.revokedAt).not.toBeNull();
  });

  it('explains that a Google-only account has no password to change', async () => {
    const { token } = await createCustomer({ email: 'cp-google@panelscan.test', password: null, emailVerified: true });

    const response = await changePassword(token, validBody());

    expect(response.status).toBe(400);
    expect(response.body.message).toContain('Google');
  });

  it('requires authentication', async () => {
    const response = await request(app).post('/api/auth/change-password').send(validBody());
    expect(response.status).toBe(401);
  });

  it('is customer-only, so staff accounts are unaffected', async () => {
    const { token } = await createOwner({ email: 'cp-owner@panelscan.test' });

    const response = await changePassword(token, validBody());

    expect(response.status).toBe(403);
  });
});
