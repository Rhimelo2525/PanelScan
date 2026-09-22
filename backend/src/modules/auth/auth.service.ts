import { type Prisma, type User, UserRole } from '@prisma/client';

import { env } from '../../config/env';
import { prisma } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { signToken } from '../../utils/jwt';
import { comparePassword, hashPassword } from '../../utils/password';
import { generateRefreshToken, hashRefreshToken } from '../../utils/refreshToken';
import type { ChangePasswordInput, LoginInput, RegisterInput, UpdateProfileInput } from './auth.validation';
import type { VerifiedGoogleProfile } from './googleAuth.service';
import { verificationService } from './verification.service';

// `birthdate` goes out as a plain "YYYY-MM-DD" string (it is a calendar date,
// not a moment in time, so a full ISO timestamp would invite timezone
// off-by-one bugs on the client). `hasPassword` tells the client whether the
// account can sign in with a password (Google-only accounts can't) without
// ever exposing the hash itself. `profilePictureUrl` replaces the internal
// storage path (which never leaves the server): it is relative to the API
// base URL and carries the upload time as `?v=` so a new picture is a new URL.
type SanitizedUser = Omit<User, 'password' | 'birthdate' | 'profilePicturePath'> & {
  birthdate: string | null;
  hasPassword: boolean;
  profilePictureUrl: string | null;
};

interface AuthResult {
  user: SanitizedUser;
  token: string;
}

interface LoginResult extends AuthResult {
  refreshToken: string;
}

interface RefreshResult {
  token: string;
  refreshToken: string;
}

const sanitizeUser = (user: User): SanitizedUser => ({
  id: user.id,
  firstName: user.firstName,
  lastName: user.lastName,
  email: user.email,
  phone: user.phone,
  birthdate: user.birthdate ? user.birthdate.toISOString().slice(0, 10) : null,
  address: user.address,
  profilePictureUrl: user.profilePicturePath
    ? `/users/${user.id}/profile-picture?v=${user.profilePictureUpdatedAt?.getTime() ?? 0}`
    : null,
  profilePictureUpdatedAt: user.profilePictureUpdatedAt,
  googleId: user.googleId,
  role: user.role,
  isActive: user.isActive,
  emailVerified: user.emailVerified,
  hasPassword: Boolean(user.password),
  termsAcceptedAt: user.termsAcceptedAt,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

export class AuthService {
  async register(input: RegisterInput): Promise<AuthResult> {
    const existingUser = await prisma.user.findUnique({ where: { email: input.email } });
    if (existingUser) {
      throw new AppError('An account with this email already exists.', 409);
    }

    const hashedPassword = await hashPassword(input.password);

    const user = await prisma.user.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        password: hashedPassword,
        phone: input.phone,
        birthdate: input.birthdate ? new Date(`${input.birthdate}T00:00:00.000Z`) : undefined,
        role: UserRole.CUSTOMER,
        termsAcceptedAt: new Date(),
      },
    });

    // Best effort: a mail outage must never stop someone creating an account.
    // If this fails they can request the code again from their profile.
    await verificationService.sendEmailVerification(user.id).catch((error) => {
      console.error('[auth] Could not send the registration verification email:', error);
    });

    const token = signToken({ userId: user.id, role: user.role });
    return { user: sanitizeUser(user), token };
  }

  async login(input: LoginInput): Promise<LoginResult> {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user) {
      throw new AppError('Invalid email or password.', 401);
    }
    if (!user.isActive) {
      throw new AppError('This account has been deactivated. Please contact support.', 403);
    }

    if (!user.password) {
      throw new AppError('Invalid email or password.', 401);
    }

    const isPasswordValid = await comparePassword(input.password, user.password);
    if (!isPasswordValid) {
      throw new AppError('Invalid email or password.', 401);
    }

    const token = signToken({ userId: user.id, role: user.role });
    const refreshToken = await this.issueRefreshToken(user.id);
    return { user: sanitizeUser(user), token, refreshToken };
  }

  async loginWithGoogle(profile: VerifiedGoogleProfile, acceptedTerms?: boolean): Promise<LoginResult> {
    if (!profile.emailVerified) {
      throw new AppError('Google account email is not verified.', 400);
    }

    const email = profile.email.trim().toLowerCase();

    // CASE A: Returning Google customer (matched by stable googleId)
    let user = await prisma.user.findUnique({ where: { googleId: profile.sub } });

    if (user) {
      if (!user.isActive) {
        throw new AppError('This account has been deactivated. Please contact support.', 403);
      }
      const token = signToken({ userId: user.id, role: user.role });
      const refreshToken = await this.issueRefreshToken(user.id);
      return { user: sanitizeUser(user), token, refreshToken };
    }

    // CASE C: Existing account with same verified email (Secure Account Linking)
    const existingByEmail = await prisma.user.findUnique({ where: { email } });
    if (existingByEmail) {
      if (!existingByEmail.isActive) {
        throw new AppError('This account has been deactivated. Please contact support.', 403);
      }
      // Link Google identity to existing PanelScan user. Google has just
      // verified this same email address, so it counts as verified here too.
      user = await prisma.user.update({
        where: { id: existingByEmail.id },
        data: { googleId: profile.sub, emailVerified: true },
      });
      const token = signToken({ userId: user.id, role: user.role });
      const refreshToken = await this.issueRefreshToken(user.id);
      return { user: sanitizeUser(user), token, refreshToken };
    }

    // CASE B: New Google customer
    // A brand-new account created via Google customer login receives CUSTOMER role only.
    // Do NOT automatically mark a Google customer as having accepted Terms/Privacy without explicit user action.
    user = await prisma.user.create({
      data: {
        firstName: profile.firstName || 'Customer',
        lastName: profile.lastName || '',
        email,
        googleId: profile.sub,
        password: null,
        role: UserRole.CUSTOMER,
        isActive: true,
        emailVerified: true,
        termsAcceptedAt: acceptedTerms ? new Date() : null,
      },
    });

    const token = signToken({ userId: user.id, role: user.role });
    const refreshToken = await this.issueRefreshToken(user.id);
    return { user: sanitizeUser(user), token, refreshToken };
  }

  async getCurrentUser(userId: string): Promise<SanitizedUser> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError('User not found.', 404);
    }
    return sanitizeUser(user);
  }

  /**
   * Customer self-service profile edit. Email is deliberately not editable
   * here: it is the login identity and the target of verification and
   * password-recovery codes, so changing it needs its own re-verification
   * flow rather than a plain field update.
   */
  async updateProfile(userId: string, input: UpdateProfileInput): Promise<SanitizedUser> {
    const data: Prisma.UserUpdateInput = {};
    if (input.firstName !== undefined) data.firstName = input.firstName;
    if (input.lastName !== undefined) data.lastName = input.lastName;
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.birthdate !== undefined) {
      data.birthdate = input.birthdate === null ? null : new Date(`${input.birthdate}T00:00:00.000Z`);
    }
    if (input.address !== undefined) data.address = input.address;

    const user = await prisma.user.update({ where: { id: userId }, data });
    return sanitizeUser(user);
  }

  /**
   * Changes a signed-in customer's password after re-checking the current one
   * (so a stolen access token alone can't lock the real owner out). Every
   * other session is signed out; the caller's own refresh token, when
   * supplied, is kept so they aren't logged out of the device they are using.
   *
   * A wrong current password is a 400, not a 401: the web client treats any
   * 401 on an authenticated request as "session expired" and would log the
   * customer out for a simple typo.
   */
  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError('User not found.', 404);
    }
    if (!user.password) {
      throw new AppError(
        'This account signs in with Google and has no password yet. Use "Forgot password" on the login page to create one.',
        400,
      );
    }

    const isCurrentPasswordValid = await comparePassword(input.currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      throw new AppError('Your current password is incorrect.', 400);
    }

    const passwordHash = await hashPassword(input.newPassword);
    const keepTokenHash = input.refreshToken ? hashRefreshToken(input.refreshToken) : undefined;

    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { password: passwordHash } }),
      prisma.refreshToken.updateMany({
        where: { userId: user.id, revokedAt: null, ...(keepTokenHash ? { tokenHash: { not: keepTokenHash } } : {}) },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  /** Creates and persists (hash-only) a new refresh token row for a user, returning the plaintext token to hand to the client. */
  private async issueRefreshToken(userId: string): Promise<string> {
    const plainToken = generateRefreshToken();
    const tokenHash = hashRefreshToken(plainToken);
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000);

    await prisma.refreshToken.create({ data: { userId, tokenHash, expiresAt } });
    return plainToken;
  }

  /**
   * Validates a refresh token (exists, not expired, not revoked) and rotates
   * it: the presented token is revoked and a brand-new one is issued in the
   * same transaction, so a token can never be redeemed twice (replay
   * protection) and a mid-request crash can't leave the client holding a
   * dead token with no replacement.
   */
  async refresh(plainToken: string): Promise<RefreshResult> {
    const tokenHash = hashRefreshToken(plainToken);
    const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!existing) {
      throw new AppError('Invalid refresh token.', 401);
    }
    if (existing.revokedAt) {
      throw new AppError('This refresh token has been revoked.', 401);
    }
    if (existing.expiresAt < new Date()) {
      throw new AppError('This refresh token has expired.', 401);
    }

    const user = await prisma.user.findUnique({ where: { id: existing.userId } });
    if (!user) {
      throw new AppError('The user belonging to this token no longer exists.', 401);
    }
    if (!user.isActive) {
      throw new AppError('This user account has been deactivated.', 403);
    }

    const newPlainToken = generateRefreshToken();
    const newTokenHash = hashRefreshToken(newPlainToken);
    const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000);

    await prisma.$transaction([
      prisma.refreshToken.update({ where: { id: existing.id }, data: { revokedAt: new Date() } }),
      prisma.refreshToken.create({ data: { userId: user.id, tokenHash: newTokenHash, expiresAt } }),
    ]);

    const token = signToken({ userId: user.id, role: user.role });
    return { token, refreshToken: newPlainToken };
  }

  /**
   * Revokes exactly one refresh token - the one the client is holding - not
   * every session belonging to the user, so logging out on one device never
   * signs the user out of others. Unknown-or-someone-else's-token is
   * reported as 404 (never 403), matching the project's ownership-violation
   * convention of never confirming a token's existence/ownership to a
   * caller who isn't entitled to it.
   */
  async logout(userId: string, plainToken: string): Promise<void> {
    const tokenHash = hashRefreshToken(plainToken);
    const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });

    if (!existing || existing.userId !== userId) {
      throw new AppError('Refresh token not found.', 404);
    }

    if (!existing.revokedAt) {
      await prisma.refreshToken.update({ where: { id: existing.id }, data: { revokedAt: new Date() } });
    }
  }
}

export const authService = new AuthService();
