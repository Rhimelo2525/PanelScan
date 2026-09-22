import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '../../src/config/database';
import { hashVerificationCode, VERIFICATION_MAX_ATTEMPTS } from '../../src/utils/verificationCode';
import { authHeader, createCustomer, createOwner } from '../helpers/factories';
import { mailbox } from '../helpers/mailbox';
import app from '../helpers/testApp';

vi.mock('../../src/utils/mailer', () => ({
  sendMail: (...args: Parameters<typeof mailbox.send>) => mailbox.send(...args),
}));

beforeEach(() => mailbox.reset());

const sendCode = (token: string) => request(app).post('/api/auth/send-verification-email').set(authHeader(token));
const verify = (token: string, code: string) => request(app).post('/api/auth/verify-email').set(authHeader(token)).send({ code });
const wrongCodeFor = (code: string): string => (code === '000000' ? '111111' : '000000');

const skipCooldown = (userId: string) =>
  prisma.emailVerificationCode.updateMany({ where: { userId }, data: { createdAt: new Date(Date.now() - 5 * 60 * 1000) } });

describe('Email verification', () => {
  describe('POST /api/auth/send-verification-email', () => {
    it("emails a 6-digit code to the account's own address", async () => {
      const { token, user } = await createCustomer({ email: 'ev-send@panelscan.test' });

      const response = await sendCode(token);

      expect(response.status).toBe(200);
      expect(response.body.data.alreadyVerified).toBe(false);
      expect(mailbox.to(user.email)).toHaveLength(1);
      expect(mailbox.lastCodeFor(user.email)).toMatch(/^\d{6}$/);
    });

    it('stores only a keyed hash of the code', async () => {
      const { token, user } = await createCustomer({ email: 'ev-hash@panelscan.test' });

      await sendCode(token);

      const code = mailbox.lastCodeFor(user.email);
      const row = await prisma.emailVerificationCode.findFirstOrThrow({ where: { userId: user.id } });
      expect(row.codeHash).not.toBe(code);
      expect(row.codeHash).toBe(hashVerificationCode('email-verification', user.id, code));
    });

    it('does not resend to an address that is already verified', async () => {
      const { token, user } = await createCustomer({ email: 'ev-already@panelscan.test', emailVerified: true });

      const response = await sendCode(token);

      expect(response.status).toBe(200);
      expect(response.body.data.alreadyVerified).toBe(true);
      expect(mailbox.to(user.email)).toHaveLength(0);
    });

    it('enforces a resend cooldown', async () => {
      const { token, user } = await createCustomer({ email: 'ev-cooldown@panelscan.test' });

      await sendCode(token);
      const second = await sendCode(token);

      expect(second.status).toBe(429);
      expect(mailbox.to(user.email)).toHaveLength(1);
    });

    it('allows another code once the cooldown has passed, replacing the first', async () => {
      const { token, user } = await createCustomer({ email: 'ev-resend@panelscan.test' });
      await sendCode(token);
      const oldRow = await prisma.emailVerificationCode.findFirstOrThrow({ where: { userId: user.id } });
      await skipCooldown(user.id);

      const response = await sendCode(token);

      expect(response.status).toBe(200);
      expect(mailbox.to(user.email)).toHaveLength(2);
      expect(await prisma.emailVerificationCode.findUnique({ where: { id: oldRow.id } })).toBeNull();
      expect(await prisma.emailVerificationCode.count({ where: { userId: user.id } })).toBe(1);
    });

    it('reports a delivery failure and leaves nothing that would block an immediate retry', async () => {
      const { token, user } = await createCustomer({ email: 'ev-smtp@panelscan.test' });
      mailbox.failing = true;

      const failed = await sendCode(token);

      expect(failed.status).toBe(503);
      expect(await prisma.emailVerificationCode.count({ where: { userId: user.id } })).toBe(0);

      mailbox.failing = false;
      expect((await sendCode(token)).status).toBe(200);
    });

    it('requires authentication', async () => {
      const response = await request(app).post('/api/auth/send-verification-email');
      expect(response.status).toBe(401);
    });

    it('is customer-only', async () => {
      const { token } = await createOwner({ email: 'ev-owner@panelscan.test' });
      const response = await sendCode(token);
      expect(response.status).toBe(403);
    });
  });

  describe('POST /api/auth/verify-email', () => {
    it('marks the email verified and returns the updated user', async () => {
      const { token, user } = await createCustomer({ email: 'ev-ok@panelscan.test' });
      await sendCode(token);

      const response = await verify(token, mailbox.lastCodeFor(user.email));

      expect(response.status).toBe(200);
      expect(response.body.data.user.emailVerified).toBe(true);
      expect(response.body.data.user.password).toBeUndefined();
      expect((await prisma.user.findUnique({ where: { id: user.id } }))?.emailVerified).toBe(true);
      expect(await prisma.emailVerificationCode.count({ where: { userId: user.id } })).toBe(0);
    });

    it('rejects a wrong code and stays unverified', async () => {
      const { token, user } = await createCustomer({ email: 'ev-wrong@panelscan.test' });
      await sendCode(token);

      const response = await verify(token, wrongCodeFor(mailbox.lastCodeFor(user.email)));

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('The code is invalid or has expired.');
      expect((await prisma.user.findUnique({ where: { id: user.id } }))?.emailVerified).toBe(false);
    });

    it('rejects an expired code', async () => {
      const { token, user } = await createCustomer({ email: 'ev-expired@panelscan.test' });
      await sendCode(token);
      const code = mailbox.lastCodeFor(user.email);
      await prisma.emailVerificationCode.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

      const response = await verify(token, code);

      expect(response.status).toBe(400);
      expect((await prisma.user.findUnique({ where: { id: user.id } }))?.emailVerified).toBe(false);
    });

    it('locks the code after too many wrong guesses, even for the correct code afterwards', async () => {
      const { token, user } = await createCustomer({ email: 'ev-lock@panelscan.test' });
      await sendCode(token);
      const code = mailbox.lastCodeFor(user.email);

      for (let i = 0; i < VERIFICATION_MAX_ATTEMPTS; i += 1) {
        expect((await verify(token, wrongCodeFor(code))).status).toBe(400);
      }

      expect((await verify(token, code)).status).toBe(400);
      expect((await prisma.user.findUnique({ where: { id: user.id } }))?.emailVerified).toBe(false);
    });

    it('is single use', async () => {
      const { token, user } = await createCustomer({ email: 'ev-once@panelscan.test' });
      await sendCode(token);
      const code = mailbox.lastCodeFor(user.email);

      expect((await verify(token, code)).status).toBe(200);
      // Already verified now, so a repeat is a harmless no-op rather than an error.
      expect((await verify(token, code)).status).toBe(200);
      expect(await prisma.emailVerificationCode.count({ where: { userId: user.id } })).toBe(0);
    });

    it('does not accept a password-reset code', async () => {
      const { token, user } = await createCustomer({ email: 'ev-cross@panelscan.test', emailVerified: false });
      const resetCode = '482913';
      await prisma.passwordResetCode.create({
        data: {
          userId: user.id,
          codeHash: hashVerificationCode('password-reset', user.id, resetCode),
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      });

      const response = await verify(token, resetCode);

      expect(response.status).toBe(400);
      expect((await prisma.user.findUnique({ where: { id: user.id } }))?.emailVerified).toBe(false);
    });

    it('rejects a malformed code', async () => {
      const { token } = await createCustomer({ email: 'ev-format@panelscan.test' });

      for (const code of ['12345', '1234567', 'abcdef', '']) {
        expect((await verify(token, code)).status).toBe(400);
      }
    });

    it('requires authentication', async () => {
      const response = await request(app).post('/api/auth/verify-email').send({ code: '123456' });
      expect(response.status).toBe(401);
    });

    it('is customer-only', async () => {
      const { token } = await createOwner({ email: 'ev-verify-owner@panelscan.test' });
      const response = await verify(token, '123456');
      expect(response.status).toBe(403);
    });
  });

  describe('gating password recovery', () => {
    it('only offers recovery once the email has been verified', async () => {
      const { token, user } = await createCustomer({ email: 'ev-gate@panelscan.test' });

      await request(app).post('/api/auth/forgot-password').send({ email: user.email });
      expect(mailbox.to(user.email)).toHaveLength(0);

      await sendCode(token);
      await verify(token, mailbox.lastCodeFor(user.email));
      mailbox.reset();

      await request(app).post('/api/auth/forgot-password').send({ email: user.email });
      expect(mailbox.to(user.email)).toHaveLength(1);
    });
  });
});
