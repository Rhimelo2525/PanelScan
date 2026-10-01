import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '../../src/config/database';
import { authService } from '../../src/modules/auth/auth.service';
import { LOGIN_LOCK_THRESHOLD, formatWait, loginIdentifier } from '../../src/modules/auth/loginLockout';
import { createCustomer, createModerator } from '../helpers/factories';
import { mailbox } from '../helpers/mailbox';
import app from '../helpers/testApp';

vi.mock('../../src/utils/mailer', () => ({
  sendMail: (...args: Parameters<typeof mailbox.send>) => mailbox.send(...args),
}));

beforeEach(() => mailbox.reset());

const WRONG = 'Wr0ng!Pass';
const login = (email: string, password: string) => request(app).post('/api/auth/login').send({ email, password });

const failTimes = async (email: string, times: number) => {
  const responses = [];
  for (let i = 0; i < times; i += 1) responses.push(await login(email, WRONG));
  return responses;
};

/** Moves the running lock into the past, as if its time had passed. */
const expireLock = async (email: string) => {
  await prisma.loginThrottle.update({ where: { identifierHash: loginIdentifier(email) }, data: { lockedUntil: new Date(Date.now() - 1000) } });
};

const lockMessage = (minutes: number) => `Too many failed login attempts. Please try again in ${minutes} minutes.`;

describe('Progressive login lockout', () => {
  it('1 wrong password: the usual error, nothing about attempts', async () => {
    const { user } = await createCustomer();

    const response = await login(user.email, WRONG);

    expect(response.status).toBe(401);
    expect(response.body).toEqual({ success: false, message: 'Invalid email or password.' });
  });

  it('9 wrong passwords: still not locked, and the right password still works', async () => {
    const { user, password } = await createCustomer();

    const responses = await failTimes(user.email, 9);
    expect(responses.every((r) => r.status === 401)).toBe(true);

    expect((await login(user.email, password)).status).toBe(200);
  });

  it('10th wrong password locks for 5 minutes; the right password is refused while locked', async () => {
    const { user, password } = await createCustomer();

    const responses = await failTimes(user.email, LOGIN_LOCK_THRESHOLD);
    const tenth = responses.at(-1)!;
    expect(tenth.status).toBe(429);
    expect(tenth.body.message).toBe(lockMessage(5));
    expect(tenth.body.retryAfterSeconds).toBeGreaterThan(295);
    expect(tenth.body.retryAfterSeconds).toBeLessThanOrEqual(300);
    expect(tenth.headers['retry-after']).toBe(String(tenth.body.retryAfterSeconds));
    // Only the time left is exposed - no counters, no lock number.
    expect(Object.keys(tenth.body).sort()).toEqual(['message', 'retryAfterSeconds', 'success']);

    const whileLocked = await login(user.email, password);
    expect(whileLocked.status).toBe(429);
    expect(whileLocked.body.data).toBeUndefined();
    expect(whileLocked.body.retryAfterSeconds).toBeLessThanOrEqual(tenth.body.retryAfterSeconds);
  });

  it('the lock is server-side: a brand-new client (no cookies, no storage) is still refused', async () => {
    const { user, password } = await createCustomer();
    await failTimes(user.email, LOGIN_LOCK_THRESHOLD);

    // supertest sends each request with no cookies or client state, which is
    // exactly what a refresh, a reopened browser or a private window looks like.
    for (let i = 0; i < 3; i += 1) {
      expect((await login(user.email, password)).status).toBe(429);
    }
    // Different capitalisation and spacing are the same address.
    expect((await login(`  ${user.email.toUpperCase()} `, password)).status).toBe(429);
  });

  it('after the lock expires, login works again and the history is cleared', async () => {
    const { user, password } = await createCustomer();
    await failTimes(user.email, LOGIN_LOCK_THRESHOLD);
    await expireLock(user.email);

    expect((await login(user.email, password)).status).toBe(200);
    expect(await prisma.loginThrottle.count()).toBe(0);
  });

  it('each further 10 wrong passwords locks 5 minutes longer: 10, 15, 20 minutes', async () => {
    const { user } = await createCustomer();
    await failTimes(user.email, LOGIN_LOCK_THRESHOLD);

    for (const minutes of [10, 15, 20]) {
      await expireLock(user.email);
      const tenth = (await failTimes(user.email, LOGIN_LOCK_THRESHOLD)).at(-1)!;
      expect(tenth.status).toBe(429);
      expect(tenth.body.message).toBe(lockMessage(minutes));
      expect(tenth.body.retryAfterSeconds).toBeGreaterThan(minutes * 60 - 5);
    }
  });

  it('a successful login resets the counter', async () => {
    const { user, password } = await createCustomer();
    await failTimes(user.email, 9);
    expect((await login(user.email, password)).status).toBe(200);

    const nextNine = await failTimes(user.email, 9);
    expect(nextNine.every((r) => r.status === 401)).toBe(true);
  });

  it('one account being locked does not affect anyone else', async () => {
    const locked = await createCustomer();
    const other = await createModerator();
    await failTimes(locked.user.email, LOGIN_LOCK_THRESHOLD);

    expect((await login(other.user.email, other.password)).status).toBe(200);
  });

  it('an address with no account locks the same way (no hint about who is registered)', async () => {
    const responses = await failTimes('nobody-here@panelscan.test', LOGIN_LOCK_THRESHOLD);

    expect(responses.slice(0, 9).every((r) => r.status === 401 && r.body.message === 'Invalid email or password.')).toBe(true);
    expect(responses.at(-1)!.body.message).toBe(lockMessage(5));
  });

  it('never stores the email address itself', async () => {
    const { user } = await createCustomer();
    await failTimes(user.email, 2);

    const row = await prisma.loginThrottle.findFirstOrThrow();
    expect(JSON.stringify(row)).not.toContain(user.email);
    expect(row.identifierHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('parallel wrong passwords cannot start the same lock twice', async () => {
    const { user } = await createCustomer();

    const responses = await Promise.all(Array.from({ length: 15 }, () => login(user.email, WRONG)));

    expect(responses.some((r) => r.status === 429)).toBe(true);
    const row = await prisma.loginThrottle.findFirstOrThrow();
    expect(row.lockCount).toBe(1);
  });

  it('a long quiet period starts the escalation over', async () => {
    const { user } = await createCustomer();
    await prisma.loginThrottle.create({
      data: { identifierHash: loginIdentifier(user.email), failedAttempts: 9, lockCount: 3, lastFailedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    });

    expect((await login(user.email, WRONG)).status).toBe(401);
    const row = await prisma.loginThrottle.findFirstOrThrow();
    expect([row.failedAttempts, row.lockCount]).toEqual([1, 0]);
  });

  it('resetting the password through the emailed code lifts the lock', async () => {
    const { user } = await createCustomer({ emailVerified: true });
    await failTimes(user.email, LOGIN_LOCK_THRESHOLD);

    await request(app).post('/api/auth/forgot-password').send({ email: user.email });
    const code = mailbox.lastCodeFor(user.email);
    const reset = await request(app)
      .post('/api/auth/reset-password')
      .send({ email: user.email, code, newPassword: 'N3w!Panel2026', confirmPassword: 'N3w!Panel2026' });
    expect(reset.status).toBe(200);

    expect((await login(user.email, 'N3w!Panel2026')).status).toBe(200);
  });

  it('Google sign-in is not affected by a password lockout', async () => {
    const { user } = await createCustomer({ emailVerified: true });
    await failTimes(user.email, LOGIN_LOCK_THRESHOLD);

    const result = await authService.loginWithGoogle({ sub: 'google-lockout', email: user.email, emailVerified: true, firstName: 'Test', lastName: 'User' });
    expect(result.user.id).toBe(user.id);
  });

  it('formats the waiting time for people', () => {
    expect(formatWait(300)).toBe('5 minutes');
    expect(formatWait(272)).toBe('4 minutes 32 seconds');
    expect(formatWait(60)).toBe('1 minute');
    expect(formatWait(45)).toBe('45 seconds');
    expect(formatWait(61)).toBe('1 minute 1 second');
  });
});
