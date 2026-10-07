import { NotificationType, UserRole, type User } from '@prisma/client';

import { env } from '../../config/env';
import { prisma } from '../../config/database';
import { ActivityAction, buildActivityLogData, type RequestAuditContext } from '../../utils/activityLog';
import { AppError } from '../../utils/AppError';
import { sendMail } from '../../utils/mailer';
import { hashPassword } from '../../utils/password';
import {
  STAFF_PASSWORD_RESET_TTL_MS,
  VERIFICATION_MAX_ATTEMPTS,
  VERIFICATION_RESEND_COOLDOWN_MS,
  generateVerificationCode,
  hashVerificationCode,
  verificationCodeMatches,
} from '../../utils/verificationCode';
import { buildStaffPasswordResetMail } from '../auth/auth.mail';
import { clearLoginFailures, loginIdentifier } from '../auth/loginLockout';
import { notifyUser } from '../notifications/notification.triggers';

// One message for every way a reset can fail to redeem (no such account,
// not staff, expired, out of guesses, mistyped), so the public endpoint
// never reveals which.
const INVALID_RESET_MESSAGE = 'The code is invalid or has expired. Ask the owner to send a new password reset.';

/** A moderator who can sign in today (active, activated, not removed) - the only accounts this reset is for. */
const isResettableStaff = (user: Pick<User, 'role' | 'isActive' | 'password' | 'deletedAt'>): boolean =>
  user.role === UserRole.MODERATOR && user.isActive && user.password !== null && user.deletedAt === null;

/** The page the emailed link opens, with the address and code filled in. */
const resetUrl = (email: string, code: string): string =>
  `${env.FRONTEND_URL.replace(/\/+$/, '')}/staff/reset-password?${new URLSearchParams({ email, code }).toString()}`;

/**
 * Owner-started password reset for a moderator. The owner never sees or sets
 * the password: the moderator gets an emailed code (kept as a keyed hash in
 * password_reset_codes under its own purpose, so the customer reset flow can
 * never redeem it) and chooses a new one, which signs them out everywhere.
 */
export class StaffPasswordResetService {
  /** OWNER: emails a reset code to an active moderator. 429 inside the resend cooldown, 503 if the email can't be sent. */
  async send(userId: string, actorId: string, context: RequestAuditContext): Promise<{ email: string }> {
    const user = await prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) {
      throw new AppError('User not found.', 404);
    }
    if (!isResettableStaff(user)) {
      throw new AppError('Password resets can only be sent to active moderator accounts.', 409);
    }

    const latest = await prisma.passwordResetCode.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
    if (latest && Date.now() - latest.createdAt.getTime() < VERIFICATION_RESEND_COOLDOWN_MS) {
      throw new AppError('A password reset was sent a moment ago. Please wait a minute before sending another.', 429);
    }

    const code = generateVerificationCode();
    await prisma.$transaction([
      prisma.passwordResetCode.deleteMany({ where: { userId: user.id } }),
      prisma.passwordResetCode.create({
        data: { userId: user.id, codeHash: hashVerificationCode('staff-password-reset', user.id, code), expiresAt: new Date(Date.now() + STAFF_PASSWORD_RESET_TTL_MS) },
      }),
    ]);

    try {
      await sendMail(buildStaffPasswordResetMail(user.email, user.firstName, code, resetUrl(user.email, code)));
    } catch (error) {
      // An unsent code is useless; drop it so the cooldown can't block a retry.
      await prisma.passwordResetCode.deleteMany({ where: { userId: user.id } });
      console.error('[users] Could not send the staff password reset email:', error);
      throw new AppError('We could not send the password reset email. Please try again shortly.', 503);
    }

    await prisma.activityLog.create({ data: buildActivityLogData(actorId, ActivityAction.STAFF_PASSWORD_RESET_SENT, context, { targetUserId: user.id, email: user.email }) });
    return { email: user.email };
  }

  /**
   * Public: the moderator redeems the code and sets a new password. Single
   * use, limited guesses (claimed atomically before comparing), and every
   * existing session is revoked so whoever else was signed in is logged out.
   */
  async reset(email: string, code: string, password: string, context: RequestAuditContext): Promise<void> {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !isResettableStaff(user)) {
      throw new AppError(INVALID_RESET_MESSAGE, 400);
    }

    const pending = await prisma.passwordResetCode.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
    if (!pending || pending.expiresAt <= new Date()) {
      throw new AppError(INVALID_RESET_MESSAGE, 400);
    }
    const { count: claimed } = await prisma.passwordResetCode.updateMany({
      where: { id: pending.id, attempts: { lt: VERIFICATION_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (claimed !== 1 || !verificationCodeMatches('staff-password-reset', user.id, code, pending.codeHash)) {
      throw new AppError(INVALID_RESET_MESSAGE, 400);
    }

    const passwordHash = await hashPassword(password);
    await prisma.$transaction(async (tx) => {
      // Deleting this exact row is the single-use guarantee.
      const redeemed = await tx.passwordResetCode.deleteMany({ where: { id: pending.id } });
      if (redeemed.count !== 1) {
        throw new AppError(INVALID_RESET_MESSAGE, 400);
      }
      await tx.user.update({ where: { id: user.id }, data: { password: passwordHash } });
      await tx.passwordResetCode.deleteMany({ where: { userId: user.id } });
      await tx.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await tx.activityLog.create({ data: buildActivityLogData(user.id, ActivityAction.STAFF_PASSWORD_RESET_COMPLETED, context, { email: user.email }) });
    });

    // They just proved control of the mailbox, so a login lockout no longer applies.
    await clearLoginFailures(loginIdentifier(user.email));
    await notifyUser({
      userId: user.id,
      type: NotificationType.SYSTEM,
      title: 'Password changed',
      message: "Your staff password was reset and every device was signed out. If this wasn't you, contact the PanelScan owner right away.",
      metadata: { event: 'PASSWORD_CHANGED' },
    });
  }
}

export const staffPasswordResetService = new StaffPasswordResetService();
