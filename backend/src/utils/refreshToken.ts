import { randomBytes, createHash } from 'crypto';

/** A cryptographically random, high-entropy opaque token - never a JWT, never predictable. */
export const generateRefreshToken = (): string => randomBytes(40).toString('hex');

/**
 * Deterministic SHA-256 digest used both to store and to look up refresh
 * tokens. Deterministic (unlike bcrypt) is required so a token can be found
 * with `findUnique({ where: { tokenHash } })` instead of scanning every row.
 */
export const hashRefreshToken = (plainToken: string): string => createHash('sha256').update(plainToken).digest('hex');
