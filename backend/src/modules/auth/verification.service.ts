import { UserRole, type User } from '@prisma/client';

import { prisma } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { sendMail } from '../../utils/mailer';
import { hashPassword } from '../../utils/password';
import {
  VERIFICATION_CODE_TTL_MS,
  VERIFICATION_MAX_ATTEMPTS,
  VERIFICATION_RESEND_COOLDOWN_MS,
  generateVerificationCode,
  hashVerificationCode,
  verificationCodeMatches,
  type VerificationPurpose,
} from '../../utils/verificationCode';
import { buildEmailVerificationMail, buildPasswordResetMail } from './auth.mail';

// One message for every way a code can be wrong (no such account, no code
// pending, expired, used up, mistyped), so a response never reveals which.
const INVALID_CODE_MESSAGE = 'The code is invalid or has expired.';

interface CodeRow {
  id: string;
  codeHash: string;
  expiresAt: Date;
  attempts: number;
  createdAt: Date;
}

/**
 * Both one-time-code tables (password_reset_codes, email_verification_codes)
 * have the same shape and follow the same lifecycle rules, so each is wrapped
 * in this small adapter and the rules are implemented once below. They stay
 * separate tables so a code issued for one purpose can never be redeemed for
 * the other.
 */
interface CodeStore {
  purpose: VerificationPurpose;
  latest(userId: string): Promise<CodeRow | null>;
  /** Replaces any existing code for the user, so only one is ever live. */
  replace(userId: string, codeHash: string, expiresAt: Date): Promise<void>;
  /** Atomically spends one guess. False when the code's guess allowance is already used up. */
  claimAttempt(id: string): Promise<boolean>;
  refundAttempt(id: string): Promise<void>;
  clear(userId: string): Promise<void>;
}

const passwordResetStore: CodeStore = {
  purpose: 'password-reset',
  latest: (userId) => prisma.passwordResetCode.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } }),
  replace: async (userId, codeHash, expiresAt) => {
    await prisma.$transaction([
      prisma.passwordResetCode.deleteMany({ where: { userId } }),
      prisma.passwordResetCode.create({ data: { userId, codeHash, expiresAt } }),
    ]);
  },
  claimAttempt: async (id) => {
    const { count } = await prisma.passwordResetCode.updateMany({
      where: { id, attempts: { lt: VERIFICATION_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    return count === 1;
  },
  refundAttempt: async (id) => {
    await prisma.passwordResetCode.updateMany({ where: { id, attempts: { gt: 0 } }, data: { attempts: { decrement: 1 } } });
  },
  clear: async (userId) => {
    await prisma.passwordResetCode.deleteMany({ where: { userId } });
  },
};

const emailVerificationStore: CodeStore = {
  purpose: 'email-verification',
  latest: (userId) => prisma.emailVerificationCode.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } }),
  replace: async (userId, codeHash, expiresAt) => {
    await prisma.$transaction([
      prisma.emailVerificationCode.deleteMany({ where: { userId } }),
      prisma.emailVerificationCode.create({ data: { userId, codeHash, expiresAt } }),
    ]);
  },
  claimAttempt: async (id) => {
    const { count } = await prisma.emailVerificationCode.updateMany({
      where: { id, attempts: { lt: VERIFICATION_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    return count === 1;
  },
  refundAttempt: async (id) => {
    await prisma.emailVerificationCode.updateMany({ where: { id, attempts: { gt: 0 } }, data: { attempts: { decrement: 1 } } });
  },
  clear: async (userId) => {
    await prisma.emailVerificationCode.deleteMany({ where: { userId } });
  },
};

/**
 * Creates a fresh code for the user and returns the plaintext (only ever
 * held in memory long enough to be emailed - the database gets an HMAC).
 * Returns null while the resend cooldown from the previous code is running,
 * which is what stops the endpoint being used to flood someone's inbox.
 */
const issueCode = async (store: CodeStore, userId: string): Promise<string | null> => {
  const latest = await store.latest(userId);
  if (latest && Date.now() - latest.createdAt.getTime() < VERIFICATION_RESEND_COOLDOWN_MS) {
    return null;
  }

  const code = generateVerificationCode();
  await store.replace(userId, hashVerificationCode(store.purpose, userId, code), new Date(Date.now() + VERIFICATION_CODE_TTL_MS));
  return code;
};

/**
 * Spends one guess against the user's current code and reports whether it
 * matched, returning that code row's id (null = no match for any reason).
 *
 * The guess is claimed atomically BEFORE the comparison, with the attempt
 * cap enforced in the same UPDATE. Checking the counter first and
 * incrementing afterwards would let a burst of parallel requests all read
 * "attempts = 0" and each get a free guess.
 */
const checkCode = async (store: CodeStore, userId: string, code: string): Promise<string | null> => {
  const latest = await store.latest(userId);
  if (!latest || latest.expiresAt <= new Date()) return null;
  if (!(await store.claimAttempt(latest.id))) return null;
  return verificationCodeMatches(store.purpose, userId, code, latest.codeHash) ? latest.id : null;
};

/** Password recovery is only for real, active customer accounts whose email has been verified. */
const findRecoverableUser = async (email: string): Promise<User | null> => {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.isActive || user.role !== UserRole.CUSTOMER || !user.emailVerified) return null;
  return user;
};

export class VerificationService {
  // ---------------------------------------------------------------
  // Email verification (signed-in customer proves they own their email)
  // ---------------------------------------------------------------

  async sendEmailVerification(userId: string): Promise<{ alreadyVerified: boolean }> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError('User not found.', 404);
    }
    if (user.emailVerified) {
      return { alreadyVerified: true };
    }

    const code = await issueCode(emailVerificationStore, user.id);
    if (!code) {
      throw new AppError('A verification code was sent recently. Please wait a minute before requesting another.', 429);
    }

    try {
      await sendMail(buildEmailVerificationMail(user.email, user.firstName, code));
    } catch (error) {
      // Drop the unusable code so the cooldown doesn't block an immediate retry.
      await emailVerificationStore.clear(user.id);
      console.error('[auth] Could not send the email verification code:', error);
      throw new AppError('We could not send the verification email. Please try again shortly.', 503);
    }

    return { alreadyVerified: false };
  }

  async verifyEmail(userId: string, code: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError('User not found.', 404);
    }
    if (user.emailVerified) {
      return;
    }

    const codeId = await checkCode(emailVerificationStore, user.id, code);
    if (!codeId) {
      throw new AppError(INVALID_CODE_MESSAGE, 400);
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } }),
      prisma.emailVerificationCode.deleteMany({ where: { userId: user.id } }),
    ]);
  }

  // ---------------------------------------------------------------
  // Password recovery (public - the caller is, by definition, signed out)
  // ---------------------------------------------------------------

  /**
   * Always resolves the same way whether or not the address belongs to a
   * recoverable account, so the endpoint can't be used to find out who has
   * an account. Delivery problems are logged, not reported, for the same
   * reason (an error only for real accounts would give them away).
   */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await findRecoverableUser(email);
    if (!user) return;

    const code = await issueCode(passwordResetStore, user.id);
    if (!code) return; // Cooling down - the previous code is still valid.

    try {
      await sendMail(buildPasswordResetMail(user.email, user.firstName, code));
    } catch (error) {
      await passwordResetStore.clear(user.id);
      console.error('[auth] Could not send the password reset code:', error);
    }
  }

  /**
   * Lets the reset screen tell the customer their code is right before they
   * choose a new password. Checking does not use the code up (a refund
   * undoes the spent guess): redeeming it is reset-password's job, which
   * re-checks it, so nothing here can be skipped or replayed.
   */
  async verifyPasswordResetCode(email: string, code: string): Promise<void> {
    const user = await findRecoverableUser(email);
    const codeId = user ? await checkCode(passwordResetStore, user.id, code) : null;
    if (!user || !codeId) {
      throw new AppError(INVALID_CODE_MESSAGE, 400);
    }

    await passwordResetStore.refundAttempt(codeId);
  }

  async resetPassword(email: string, code: string, newPassword: string): Promise<void> {
    const user = await findRecoverableUser(email);
    const codeId = user ? await checkCode(passwordResetStore, user.id, code) : null;
    if (!user || !codeId) {
      throw new AppError(INVALID_CODE_MESSAGE, 400);
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.$transaction(async (tx) => {
      // Deleting this exact row is the single-use guarantee: if a parallel
      // request redeemed the same code first, nothing is left to delete and
      // this one changes nothing.
      const redeemed = await tx.passwordResetCode.deleteMany({ where: { id: codeId } });
      if (redeemed.count !== 1) {
        throw new AppError(INVALID_CODE_MESSAGE, 400);
      }

      await tx.user.update({ where: { id: user.id }, data: { password: passwordHash } });
      await tx.passwordResetCode.deleteMany({ where: { userId: user.id } });
      // Anyone already signed in with the old password (including whoever the
      // customer is recovering the account from) must log in again.
      await tx.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
    });
  }
}

export const verificationService = new VerificationService();
