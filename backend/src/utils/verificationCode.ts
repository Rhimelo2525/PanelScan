import { createHmac, randomInt, timingSafeEqual } from 'crypto';

import { env } from '../config/env';

/**
 * One-time emailed codes (email verification, password recovery). A code is
 * a short, human-typable secret, so the protections live around it rather
 * than in its length: it expires quickly, only a limited number of guesses
 * are allowed per code, and a new one can only be requested after a
 * cooldown (see modules/auth/verification.service.ts).
 */
export type VerificationPurpose = 'password-reset' | 'email-verification';

export const VERIFICATION_CODE_LENGTH = 6;
export const VERIFICATION_CODE_TTL_MS = 10 * 60 * 1000;
export const VERIFICATION_CODE_TTL_MINUTES = VERIFICATION_CODE_TTL_MS / 60_000;
export const VERIFICATION_MAX_ATTEMPTS = 5;
export const VERIFICATION_RESEND_COOLDOWN_MS = 60 * 1000;

/** Uniformly random, zero-padded (so "004821" is as likely as "739205"). Uses the CSPRNG, never Math.random(). */
export const generateVerificationCode = (): string =>
  randomInt(0, 10 ** VERIFICATION_CODE_LENGTH)
    .toString()
    .padStart(VERIFICATION_CODE_LENGTH, '0');

/**
 * Keyed HMAC-SHA256 - not a bare hash. A 6-digit code has only a million
 * possibilities, so an unkeyed digest of it could be reversed instantly
 * from a leaked database dump; keying it with the server secret means the
 * stored value is useless without also having compromised the server.
 * The purpose and user id are mixed in so a hash issued for one flow or
 * account can never validate for another.
 */
export const hashVerificationCode = (purpose: VerificationPurpose, userId: string, code: string): string =>
  createHmac('sha256', env.JWT_SECRET).update(`${purpose}:${userId}:${code}`).digest('hex');

/** Constant-time comparison, so response timing can't be used to learn how many leading characters matched. */
export const verificationCodeMatches = (
  purpose: VerificationPurpose,
  userId: string,
  code: string,
  storedHash: string,
): boolean => {
  const candidate = Buffer.from(hashVerificationCode(purpose, userId, code), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  return candidate.length === stored.length && timingSafeEqual(candidate, stored);
};
