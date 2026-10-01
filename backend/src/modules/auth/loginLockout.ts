import { createHmac } from 'crypto';

import { env } from '../../config/env';
import { prisma } from '../../config/database';
import { AppError } from '../../utils/AppError';

/**
 * Progressive lockout for password login. Every wrong password for an email
 * address is counted on the server (table login_throttles); after
 * LOGIN_LOCK_THRESHOLD of them, password login for that address is refused
 * for 5 minutes, then 10, 15, 20... - each lock 5 minutes longer than the
 * last. A successful password login clears it all.
 *
 * The state lives only in the database, so refreshing the page, clearing
 * browser storage, a private window or calling the API directly change
 * nothing. It is keyed per address, so one account's failures never affect
 * anyone else. Google sign-in does not use a password and is not affected.
 */
export const LOGIN_LOCK_THRESHOLD = 10;
export const LOGIN_LOCK_STEP_MS = 5 * 60 * 1000;
/** Escalation stops here (still enforced, just not longer). */
export const LOGIN_LOCK_MAX_MS = 24 * 60 * 60 * 1000;
/** A full day without a wrong password (and no lock running) starts the escalation over. */
export const LOGIN_LOCK_FORGET_AFTER_MS = 24 * 60 * 60 * 1000;

/** Error for a locked address. Carries only the time left, never the counters. */
export class LoginLockedError extends AppError {
  public readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(`Too many failed login attempts. Please try again in ${formatWait(retryAfterSeconds)}.`, 429);
    this.retryAfterSeconds = retryAfterSeconds;
    Object.setPrototypeOf(this, LoginLockedError.prototype);
  }
}

/** "5 minutes", "4 minutes 32 seconds", "1 minute", "45 seconds". */
export const formatWait = (totalSeconds: number): string => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const parts = [
    minutes > 0 ? `${minutes} minute${minutes === 1 ? '' : 's'}` : null,
    seconds > 0 || minutes === 0 ? `${seconds} second${seconds === 1 ? '' : 's'}` : null,
  ];
  return parts.filter(Boolean).join(' ');
};

/**
 * Keyed HMAC of the normalized address: the table never holds an email in
 * plaintext, and an address with no account is tracked exactly like one that
 * has one, so a lockout can't be used to find out who is registered.
 */
export const loginIdentifier = (email: string): string =>
  createHmac('sha256', env.JWT_SECRET).update(`login-lockout:${email.trim().toLowerCase()}`).digest('hex');

export const lockDurationMs = (lockNumber: number): number => Math.min(LOGIN_LOCK_STEP_MS * lockNumber, LOGIN_LOCK_MAX_MS);

const secondsUntil = (date: Date): number => Math.max(1, Math.ceil((date.getTime() - Date.now()) / 1000));

/** Throws LoginLockedError while the address is locked. Checked before the password is even looked at. */
export const assertLoginAllowed = async (identifier: string): Promise<void> => {
  const throttle = await prisma.loginThrottle.findUnique({ where: { identifierHash: identifier } });
  if (throttle?.lockedUntil && throttle.lockedUntil > new Date()) {
    throw new LoginLockedError(secondsUntil(throttle.lockedUntil));
  }
};

/**
 * Counts one wrong password. Returns the lock when this attempt was the one
 * that reached the threshold, so the caller can say so straight away.
 *
 * Each step is a single conditional statement, so parallel requests can't
 * skip the count or start the same lock twice: the lock only applies while
 * the counter is still at or above the threshold, and it resets the counter
 * in the same statement.
 */
export const recordFailedLogin = async (identifier: string): Promise<Date | null> => {
  const now = new Date();

  // Long quiet period: forget the old escalation before counting this one.
  await prisma.loginThrottle.updateMany({
    where: {
      identifierHash: identifier,
      lastFailedAt: { lt: new Date(now.getTime() - LOGIN_LOCK_FORGET_AFTER_MS) },
      OR: [{ lockedUntil: null }, { lockedUntil: { lt: now } }],
    },
    data: { failedAttempts: 0, lockCount: 0 },
  });

  const throttle = await prisma.loginThrottle.upsert({
    where: { identifierHash: identifier },
    create: { identifierHash: identifier, failedAttempts: 1, lastFailedAt: now },
    update: { failedAttempts: { increment: 1 }, lastFailedAt: now },
  });
  if (throttle.failedAttempts < LOGIN_LOCK_THRESHOLD) return null;

  const lockedUntil = new Date(now.getTime() + lockDurationMs(throttle.lockCount + 1));
  const { count } = await prisma.loginThrottle.updateMany({
    where: { id: throttle.id, failedAttempts: { gte: LOGIN_LOCK_THRESHOLD } },
    data: { failedAttempts: 0, lockCount: { increment: 1 }, lockedUntil },
  });
  return count === 1 ? lockedUntil : null;
};

/** Counts the wrong password and throws the matching error: a lock if this attempt started one, otherwise `error`. */
export const failLogin = async (identifier: string, error: AppError): Promise<never> => {
  const lockedUntil = await recordFailedLogin(identifier);
  if (lockedUntil) throw new LoginLockedError(secondsUntil(lockedUntil));
  throw error;
};

/** A successful password login (or a completed password reset) clears the address's history. */
export const clearLoginFailures = async (identifier: string): Promise<void> => {
  await prisma.loginThrottle.deleteMany({ where: { identifierHash: identifier } });
};
