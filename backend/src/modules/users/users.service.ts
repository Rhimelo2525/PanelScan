import { Prisma, UserRole } from '@prisma/client';

import { prisma } from '../../config/database';
import { ActivityAction, buildActivityLogData, type RequestAuditContext } from '../../utils/activityLog';
import { AppError } from '../../utils/AppError';
import { DISPOSABLE_EMAIL_MESSAGE, isDisposableEmail } from '../../utils/disposableEmail';
import { screenStaffEmail } from '../../utils/emailScreening';
import { isInvitationPending, staffInvitationService } from './staffInvitation.service';

const userSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

// The extra columns that tell a pending invitation apart (never sent out).
const teamSelect = { ...userSelect, emailVerified: true, password: true, googleId: true, deletedAt: true } satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof userSelect }>;

/** A team-list row: `invitationPending` while an invited staff member has not activated the account yet. */
export type TeamUser = PublicUser & { invitationPending: boolean };

export interface CreateUserInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role?: UserRole;
}

export interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  /** null clears the number. */
  phone?: string | null;
}

const toTeamUser = (row: Prisma.UserGetPayload<{ select: typeof teamSelect }>): TeamUser => {
  const { emailVerified: _emailVerified, password: _password, googleId: _googleId, deletedAt: _deletedAt, ...user } = row;
  return { ...user, invitationPending: isInvitationPending(row) };
};

/** A live (not removed) account, or 404. */
const findLiveUser = async (id: string) => {
  const user = await prisma.user.findFirst({ where: { id, deletedAt: null }, select: teamSelect });
  if (!user) {
    throw new AppError('User not found.', 404);
  }
  return user;
};

export class UsersService {
  /**
   * Invites a staff member: the account is created inactive, with no
   * password, and an emailed code + link lets them verify the address and
   * choose their own password (StaffInvitationService.accept), which is
   * what activates it. If the email can't be sent, nothing is kept.
   */
  /**
   * Every rule a staff invitation's email must pass, without creating
   * anything: not temp mail, not already used, a big provider or the business
   * domain, and a mailbox that exists. The Add Moderator form runs it before
   * asking for confirmation; createUser runs it again.
   */
  async checkStaffEmail(email: string): Promise<void> {
    // Staff accounts get the same email screening as customer sign-up.
    if (isDisposableEmail(email)) {
      throw new AppError(DISPOSABLE_EMAIL_MESSAGE, 400);
    }

    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) {
      throw new AppError(
        existing.deletedAt ? 'This email address belonged to a removed account and cannot be used again.' : 'An account with this email address already exists.',
        409,
      );
    }

    // Staff addresses must be on a big provider or the business domain, and
    // the mailbox must exist (utils/emailScreening.ts). Last, as it may call
    // a paid API.
    await screenStaffEmail(email);
  }

  async createUser(input: CreateUserInput, actorId: string, context: RequestAuditContext): Promise<TeamUser> {
    await this.checkStaffEmail(input.email);

    const user = await prisma.user.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email.toLowerCase(),
        password: null,
        phone: input.phone,
        role: input.role ?? UserRole.MODERATOR,
        isActive: false,
        emailVerified: false,
      },
      select: teamSelect,
    });

    try {
      await staffInvitationService.send(user);
    } catch (error) {
      // No invitation went out, so don't leave an account nobody can activate.
      await prisma.user.delete({ where: { id: user.id } });
      throw error;
    }

    await prisma.activityLog.create({ data: buildActivityLogData(actorId, ActivityAction.STAFF_INVITED, context, { targetUserId: user.id, email: user.email, role: user.role }) });
    return toTeamUser(user);
  }

  /** OWNER: emails a new code to a staff member who has not activated the account yet. */
  async resendInvitation(id: string, actorId: string, context: RequestAuditContext): Promise<TeamUser> {
    const user = await findLiveUser(id);
    if (!isInvitationPending(user)) {
      throw new AppError('This account is not waiting for an invitation to be accepted.', 409);
    }
    await staffInvitationService.send(user);
    await prisma.activityLog.create({ data: buildActivityLogData(actorId, ActivityAction.STAFF_INVITATION_RESENT, context, { targetUserId: user.id, email: user.email }) });
    return toTeamUser(user);
  }

  async getAllUsers(): Promise<TeamUser[]> {
    const users = await prisma.user.findMany({ where: { deletedAt: null }, select: teamSelect, orderBy: { createdAt: 'desc' } });
    return users.map(toTeamUser);
  }

  async getUserById(id: string, requesterId: string, requesterRole: UserRole): Promise<PublicUser> {
    if (id !== requesterId && requesterRole === UserRole.CUSTOMER) {
      throw new AppError('You do not have permission to view this user.', 403);
    }

    const user = await prisma.user.findFirst({ where: { id, deletedAt: null }, select: userSelect });
    if (!user) {
      throw new AppError('User not found.', 404);
    }
    return user;
  }

  async updateUser(id: string, requesterId: string, requesterRole: UserRole, data: UpdateUserInput): Promise<PublicUser> {
    if (id !== requesterId && requesterRole !== UserRole.OWNER) {
      throw new AppError('You do not have permission to update this user.', 403);
    }

    await findLiveUser(id);
    return prisma.user.update({ where: { id }, data, select: userSelect });
  }

  async deactivateUser(id: string): Promise<PublicUser> {
    await findLiveUser(id);
    return prisma.user.update({ where: { id }, data: { isActive: false }, select: userSelect });
  }

  /** Undoes a restriction: the account can sign in again with its existing password. */
  async reactivateUser(id: string): Promise<PublicUser> {
    const user = await findLiveUser(id);
    if (isInvitationPending(user)) {
      throw new AppError('This account has not been activated yet. Resend the invitation instead.', 409);
    }
    return prisma.user.update({ where: { id }, data: { isActive: true }, select: userSelect });
  }

  /**
   * OWNER: permanently removes a restricted account, or cancels an
   * invitation that was never accepted. Never the owner's own account or
   * another owner's, and never an account that can still sign in - it has
   * to be restricted first.
   *
   * A cancelled invitation is deleted outright (nothing refers to it). A
   * real account is kept as a removed row so its orders, requests and
   * history stay intact, but it loses its password and Google link, every
   * session is revoked, pending codes are dropped, and it disappears from
   * every account list for good.
   */
  async removeUser(id: string, actorId: string, context: RequestAuditContext): Promise<void> {
    if (id === actorId) {
      throw new AppError('You cannot remove your own account.', 400);
    }
    const user = await findLiveUser(id);
    if (user.role === UserRole.OWNER) {
      throw new AppError('Owner accounts cannot be removed.', 403);
    }

    const audit = { targetUserId: user.id, email: user.email, role: user.role, name: `${user.firstName} ${user.lastName}` };

    if (isInvitationPending(user)) {
      await prisma.$transaction([
        prisma.user.delete({ where: { id: user.id } }),
        prisma.activityLog.create({ data: buildActivityLogData(actorId, ActivityAction.STAFF_INVITATION_CANCELLED, context, audit) }),
      ]);
      return;
    }

    if (user.isActive) {
      throw new AppError('Restrict this account before removing it.', 409);
    }

    const now = new Date();
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { deletedAt: now, isActive: false, password: null, googleId: null } }),
      prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } }),
      prisma.emailVerificationCode.deleteMany({ where: { userId: user.id } }),
      prisma.passwordResetCode.deleteMany({ where: { userId: user.id } }),
      prisma.activityLog.create({ data: buildActivityLogData(actorId, ActivityAction.ACCOUNT_REMOVED, context, audit) }),
    ]);
  }
}

export const usersService = new UsersService();
