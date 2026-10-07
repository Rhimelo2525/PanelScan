import { UserRole, type User } from '@prisma/client';

import { env } from '../../config/env';
import { prisma } from '../../config/database';
import { ActivityAction, buildActivityLogData, type RequestAuditContext } from '../../utils/activityLog';
import { AppError } from '../../utils/AppError';
import { sendMail } from '../../utils/mailer';
import { hashPassword } from '../../utils/password';
import {
  STAFF_INVITATION_TTL_MS,
  VERIFICATION_MAX_ATTEMPTS,
  VERIFICATION_RESEND_COOLDOWN_MS,
  generateVerificationCode,
  hashVerificationCode,
  verificationCodeMatches,
} from '../../utils/verificationCode';
import { buildStaffInvitationMail } from '../auth/auth.mail';

// One message for every way an invitation can fail to redeem (no such
// account, already activated, expired, out of guesses, mistyped), so the
// public accept endpoint never reveals which.
const INVALID_INVITATION_MESSAGE = 'The code is invalid or has expired. Ask the owner to resend your invitation.';

type InvitationFields = Pick<User, 'role' | 'isActive' | 'emailVerified' | 'password' | 'googleId' | 'deletedAt'>;

/**
 * A staff account the owner has invited but whose holder has not yet proven
 * the email address and chosen a password. Until then it stays inactive and
 * has no way to sign in; nothing about it is stored beyond the row itself.
 */
export const isInvitationPending = (user: InvitationFields): boolean =>
  user.role !== UserRole.CUSTOMER && !user.isActive && !user.emailVerified && user.password === null && user.googleId === null && user.deletedAt === null;

/** The page the emailed link opens, with the address and code filled in. */
const acceptUrl = (email: string, code: string): string =>
  `${env.FRONTEND_URL.replace(/\/+$/, '')}/staff/accept-invite?${new URLSearchParams({ email, code }).toString()}`;

export class StaffInvitationService {
  /**
   * Emails a fresh invitation code (replacing any earlier one). The code is
   * kept as a keyed hash in email_verification_codes under its own purpose,
   * so it can never be redeemed by the customer email-verification flow.
   * Throws 429 inside the resend cooldown and 503 if the email can't be sent.
   */
  async send(user: Pick<User, 'id' | 'email' | 'firstName'>): Promise<void> {
    const latest = await prisma.emailVerificationCode.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
    if (latest && Date.now() - latest.createdAt.getTime() < VERIFICATION_RESEND_COOLDOWN_MS) {
      throw new AppError('An invitation was sent a moment ago. Please wait a minute before sending another.', 429);
    }

    const code = generateVerificationCode();
    await prisma.$transaction([
      prisma.emailVerificationCode.deleteMany({ where: { userId: user.id } }),
      prisma.emailVerificationCode.create({
        data: { userId: user.id, codeHash: hashVerificationCode('staff-invitation', user.id, code), expiresAt: new Date(Date.now() + STAFF_INVITATION_TTL_MS) },
      }),
    ]);

    try {
      await sendMail(buildStaffInvitationMail(user.email, user.firstName, code, acceptUrl(user.email, code)));
    } catch (error) {
      // An unsent code is useless; drop it so the cooldown can't block a retry.
      await prisma.emailVerificationCode.deleteMany({ where: { userId: user.id } });
      console.error('[users] Could not send the staff invitation email:', error);
      throw new AppError('We could not send the invitation email. Please try again shortly.', 503);
    }
  }

  /**
   * Public: the invited person proves the address with the emailed code and
   * chooses a password, which activates the account. The code is single-use
   * and limited to VERIFICATION_MAX_ATTEMPTS guesses, claimed atomically
   * before comparing (so parallel requests can't each get a free guess).
   */
  async accept(email: string, code: string, password: string, context: RequestAuditContext): Promise<void> {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !isInvitationPending(user)) {
      throw new AppError(INVALID_INVITATION_MESSAGE, 400);
    }

    const invitation = await prisma.emailVerificationCode.findFirst({ where: { userId: user.id }, orderBy: { createdAt: 'desc' } });
    if (!invitation || invitation.expiresAt <= new Date()) {
      throw new AppError(INVALID_INVITATION_MESSAGE, 400);
    }
    const { count: claimed } = await prisma.emailVerificationCode.updateMany({
      where: { id: invitation.id, attempts: { lt: VERIFICATION_MAX_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    if (claimed !== 1 || !verificationCodeMatches('staff-invitation', user.id, code, invitation.codeHash)) {
      throw new AppError(INVALID_INVITATION_MESSAGE, 400);
    }

    const passwordHash = await hashPassword(password);
    await prisma.$transaction(async (tx) => {
      // Deleting this exact row is the single-use guarantee: a parallel
      // request that redeemed it first leaves nothing to delete here.
      const redeemed = await tx.emailVerificationCode.deleteMany({ where: { id: invitation.id } });
      if (redeemed.count !== 1) {
        throw new AppError(INVALID_INVITATION_MESSAGE, 400);
      }
      await tx.user.update({ where: { id: user.id }, data: { password: passwordHash, emailVerified: true, isActive: true } });
      await tx.emailVerificationCode.deleteMany({ where: { userId: user.id } });
      await tx.activityLog.create({ data: buildActivityLogData(user.id, ActivityAction.STAFF_INVITATION_ACCEPTED, context, { email: user.email, role: user.role }) });
    });
  }
}

export const staffInvitationService = new StaffInvitationService();
