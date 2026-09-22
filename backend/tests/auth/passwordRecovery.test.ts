import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '../../src/config/database';
import { comparePassword } from '../../src/utils/password';
import { hashVerificationCode, VERIFICATION_MAX_ATTEMPTS } from '../../src/utils/verificationCode';
import { createCustomer, createOwner, createTestRefreshToken, TEST_PASSWORD } from '../helpers/factories';
import { mailbox } from '../helpers/mailbox';
import app from '../helpers/testApp';

vi.mock('../../src/utils/mailer', () => ({
  sendMail: (...args: Parameters<typeof mailbox.send>) => mailbox.send(...args),
}));

beforeEach(() => mailbox.reset());

const NEW_PASSWORD = 'N3w-Str0ng!Pass';
const INVALID_CODE_MESSAGE = 'The code is invalid or has expired.';

const forgot = (email: string) => request(app).post('/api/auth/forgot-password').send({ email });
const verifyCode = (email: string, code: string) => request(app).post('/api/auth/verify-reset-code').send({ email, code });
const reset = (email: string, code: string, newPassword = NEW_PASSWORD, confirmPassword = newPassword) =>
  request(app).post('/api/auth/reset-password').send({ email, code, newPassword, confirmPassword });

/** A verified customer who has already requested a reset code. */
const customerWithCode = async (email: string) => {
  const created = await createCustomer({ email, emailVerified: true });
  await forgot(email);
  return { ...created, code: mailbox.lastCodeFor(email) };
};

const wrongCodeFor = (code: string): string => (code === '000000' ? '111111' : '000000');

/** Pretends the resend cooldown has elapsed, so another code can be requested. */
const skipCooldown = (userId: string) =>
  prisma.passwordResetCode.updateMany({ where: { userId }, data: { createdAt: new Date(Date.now() - 5 * 60 * 1000) } });

describe('Forgot password', () => {
  describe('POST /api/auth/forgot-password', () => {
    it('emails a 6-digit code to a verified customer', async () => {
      const { user } = await createCustomer({ email: 'fp-ok@panelscan.test', emailVerified: true });

      const response = await forgot(user.email);

      expect(response.status).toBe(200);
      expect(mailbox.to(user.email)).toHaveLength(1);
      expect(mailbox.lastCodeFor(user.email)).toMatch(/^\d{6}$/);
      expect(mailbox.to(user.email)[0]?.subject).toContain('password reset');
    });

    it('stores only a keyed hash of the code, expiring in about 10 minutes', async () => {
      const { user } = await createCustomer({ email: 'fp-hash@panelscan.test', emailVerified: true });

      await forgot(user.email);

      const code = mailbox.lastCodeFor(user.email);
      const row = await prisma.passwordResetCode.findFirst({ where: { userId: user.id } });
      expect(row).not.toBeNull();
      expect(row?.codeHash).not.toBe(code);
      expect(row?.codeHash).toBe(hashVerificationCode('password-reset', user.id, code));
      const minutesLeft = (row!.expiresAt.getTime() - Date.now()) / 60_000;
      expect(minutesLeft).toBeGreaterThan(9);
      expect(minutesLeft).toBeLessThanOrEqual(10);
    });

    it('answers identically for a real account and an unknown address, so accounts cannot be enumerated', async () => {
      await createCustomer({ email: 'fp-real@panelscan.test', emailVerified: true });

      const real = await forgot('fp-real@panelscan.test');
      const unknown = await forgot('fp-nobody@panelscan.test');

      expect(unknown.status).toBe(real.status);
      expect(unknown.body).toEqual(real.body);
      expect(mailbox.to('fp-nobody@panelscan.test')).toHaveLength(0);
    });

    it.each([
      ['an unverified email', { emailVerified: false }],
      ['a deactivated account', { emailVerified: true, isActive: false }],
    ])('sends nothing, with the same response, for %s', async (_label, options) => {
      const email = `fp-skip-${Math.random().toString(36).slice(2, 8)}@panelscan.test`;
      const { user } = await createCustomer({ email, ...options });
      const baseline = await forgot('fp-baseline@panelscan.test');

      const response = await forgot(email);

      expect(response.status).toBe(baseline.status);
      expect(response.body).toEqual(baseline.body);
      expect(mailbox.to(email)).toHaveLength(0);
      expect(await prisma.passwordResetCode.count({ where: { userId: user.id } })).toBe(0);
    });

    it('never offers recovery for staff accounts', async () => {
      const { user } = await createOwner({ email: 'fp-owner@panelscan.test' });
      await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });

      const response = await forgot(user.email);

      expect(response.status).toBe(200);
      expect(mailbox.to(user.email)).toHaveLength(0);
    });

    it('still answers the same when the email cannot be delivered, and leaves no dangling code', async () => {
      const { user } = await createCustomer({ email: 'fp-smtp@panelscan.test', emailVerified: true });
      const baseline = await forgot('fp-baseline@panelscan.test');
      mailbox.failing = true;

      const response = await forgot(user.email);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(baseline.body);
      expect(await prisma.passwordResetCode.count({ where: { userId: user.id } })).toBe(0);
    });

    it('enforces a resend cooldown so the endpoint cannot flood an inbox', async () => {
      const { user } = await createCustomer({ email: 'fp-cooldown@panelscan.test', emailVerified: true });

      await forgot(user.email);
      const second = await forgot(user.email);

      expect(second.status).toBe(200);
      expect(mailbox.to(user.email)).toHaveLength(1);
    });

    it('replaces the old code when a new one is issued, so only one is ever live', async () => {
      const { user } = await createCustomer({ email: 'fp-replace@panelscan.test', emailVerified: true });
      await forgot(user.email);
      const oldRow = await prisma.passwordResetCode.findFirstOrThrow({ where: { userId: user.id } });
      await skipCooldown(user.id);

      await forgot(user.email);

      expect(mailbox.to(user.email)).toHaveLength(2);
      expect(await prisma.passwordResetCode.findUnique({ where: { id: oldRow.id } })).toBeNull();
      const rows = await prisma.passwordResetCode.findMany({ where: { userId: user.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.codeHash).toBe(hashVerificationCode('password-reset', user.id, mailbox.lastCodeFor(user.email)));
    });

    it('rejects a malformed email', async () => {
      const response = await forgot('not-an-email');
      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/auth/verify-reset-code', () => {
    it('accepts the right code without using it up', async () => {
      const { user, code } = await customerWithCode('vc-ok@panelscan.test');

      const first = await verifyCode(user.email, code);
      const second = await verifyCode(user.email, code);

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      expect(await prisma.passwordResetCode.count({ where: { userId: user.id } })).toBe(1);
    });

    it('rejects a wrong code with a generic message', async () => {
      const { user, code } = await customerWithCode('vc-wrong@panelscan.test');

      const response = await verifyCode(user.email, wrongCodeFor(code));

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(INVALID_CODE_MESSAGE);
    });

    it('gives the same answer for an unknown email as for a wrong code', async () => {
      const { user, code } = await customerWithCode('vc-same@panelscan.test');

      const wrong = await verifyCode(user.email, wrongCodeFor(code));
      const unknown = await verifyCode('vc-nobody@panelscan.test', '123456');

      expect(unknown.status).toBe(wrong.status);
      expect(unknown.body).toEqual(wrong.body);
    });

    it('rejects a code that has expired', async () => {
      const { user, code } = await customerWithCode('vc-expired@panelscan.test');
      await prisma.passwordResetCode.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

      const response = await verifyCode(user.email, code);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(INVALID_CODE_MESSAGE);
    });

    it('locks the code after too many wrong guesses, even for the correct code afterwards', async () => {
      const { user, code } = await customerWithCode('vc-lock@panelscan.test');
      const wrong = wrongCodeFor(code);

      for (let i = 0; i < VERIFICATION_MAX_ATTEMPTS; i += 1) {
        expect((await verifyCode(user.email, wrong)).status).toBe(400);
      }

      expect((await verifyCode(user.email, code)).status).toBe(400);
      expect((await reset(user.email, code)).status).toBe(400);
    });

    it('does not let a correct check erode the guess allowance', async () => {
      const { user, code } = await customerWithCode('vc-refund@panelscan.test');

      for (let i = 0; i < VERIFICATION_MAX_ATTEMPTS + 2; i += 1) {
        expect((await verifyCode(user.email, code)).status).toBe(200);
      }
    });

    it("does not accept one customer's code for another customer's account", async () => {
      const first = await customerWithCode('vc-a@panelscan.test');
      const bystander = await createCustomer({ email: 'vc-b@panelscan.test', emailVerified: true });

      const verify = await verifyCode(bystander.user.email, first.code);
      const resetAttempt = await reset(bystander.user.email, first.code);

      expect(verify.status).toBe(400);
      expect(resetAttempt.status).toBe(400);
      const stored = await prisma.user.findUnique({ where: { id: bystander.user.id } });
      expect(await comparePassword(TEST_PASSWORD, stored!.password!)).toBe(true);
    });
  });

  describe('POST /api/auth/reset-password', () => {
    it('sets the new password: the old one stops working and the new one logs in', async () => {
      const { user, code } = await customerWithCode('rp-ok@panelscan.test');

      const response = await reset(user.email, code);

      expect(response.status).toBe(200);
      const stored = await prisma.user.findUnique({ where: { id: user.id } });
      expect(stored?.password).not.toBe(NEW_PASSWORD);
      expect(await comparePassword(NEW_PASSWORD, stored!.password!)).toBe(true);

      const newLogin = await request(app).post('/api/auth/login').send({ email: user.email, password: NEW_PASSWORD });
      expect(newLogin.status).toBe(200);
      const oldLogin = await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
      expect(oldLogin.status).toBe(401);
    });

    it('cannot be replayed: the code is single use', async () => {
      const { user, code } = await customerWithCode('rp-reuse@panelscan.test');

      expect((await reset(user.email, code)).status).toBe(200);
      const replay = await reset(user.email, code, 'An0ther-Str0ng!1');

      expect(replay.status).toBe(400);
      expect(await prisma.passwordResetCode.count({ where: { userId: user.id } })).toBe(0);
      const login = await request(app).post('/api/auth/login').send({ email: user.email, password: NEW_PASSWORD });
      expect(login.status).toBe(200);
    });

    it('rejects an expired code and leaves the password alone', async () => {
      const { user, code } = await customerWithCode('rp-expired@panelscan.test');
      await prisma.passwordResetCode.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

      const response = await reset(user.email, code);

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(INVALID_CODE_MESSAGE);
      const login = await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
      expect(login.status).toBe(200);
    });

    it('rejects a wrong code and leaves the password alone', async () => {
      const { user, code } = await customerWithCode('rp-wrong@panelscan.test');

      const response = await reset(user.email, wrongCodeFor(code));

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(INVALID_CODE_MESSAGE);
      const login = await request(app).post('/api/auth/login').send({ email: user.email, password: TEST_PASSWORD });
      expect(login.status).toBe(200);
    });

    it('rejects a weak new password without using up the code', async () => {
      const { user, code } = await customerWithCode('rp-weak@panelscan.test');

      const weak = await reset(user.email, code, 'password');
      expect(weak.status).toBe(400);

      expect((await reset(user.email, code)).status).toBe(200);
    });

    it('rejects a confirmation that does not match', async () => {
      const { user, code } = await customerWithCode('rp-mismatch@panelscan.test');

      const response = await reset(user.email, code, NEW_PASSWORD, 'Different-1!Pass');

      expect(response.status).toBe(400);
    });

    it('signs out every existing session', async () => {
      const { user, code } = await customerWithCode('rp-sessions@panelscan.test');
      const session = await createTestRefreshToken({ userId: user.id });

      await reset(user.email, code);

      expect((await prisma.refreshToken.findUnique({ where: { id: session.record.id } }))?.revokedAt).not.toBeNull();
    });

    it('lets a Google-only account create a password', async () => {
      const email = 'rp-google@panelscan.test';
      const { user } = await createCustomer({ email, password: null, emailVerified: true });
      await forgot(email);

      const response = await reset(email, mailbox.lastCodeFor(email));

      expect(response.status).toBe(200);
      const login = await request(app).post('/api/auth/login').send({ email: user.email, password: NEW_PASSWORD });
      expect(login.status).toBe(200);
    });

    it('does not accept a code for an account that is not eligible', async () => {
      const { user, code } = await customerWithCode('rp-deactivated@panelscan.test');
      await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });

      const response = await reset(user.email, code);

      expect(response.status).toBe(400);
    });

    it('issues a working code again after the cooldown and a lock-out', async () => {
      const { user, code } = await customerWithCode('rp-recover@panelscan.test');
      for (let i = 0; i < VERIFICATION_MAX_ATTEMPTS; i += 1) await verifyCode(user.email, wrongCodeFor(code));
      expect((await reset(user.email, code)).status).toBe(400);

      await skipCooldown(user.id);
      await forgot(user.email);

      expect((await reset(user.email, mailbox.lastCodeFor(user.email))).status).toBe(200);
    });
  });
});
