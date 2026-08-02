import { type User, UserRole } from '@prisma/client';

import { env } from '../../config/env';
import { prisma } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { signToken } from '../../utils/jwt';
import { comparePassword, hashPassword } from '../../utils/password';
import { generateRefreshToken, hashRefreshToken } from '../../utils/refreshToken';
import type { LoginInput, RegisterInput } from './auth.validation';

type SanitizedUser = Omit<User, 'password'>;

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
  role: user.role,
  isActive: user.isActive,
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
        role: UserRole.CUSTOMER,
      },
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

    const isPasswordValid = await comparePassword(input.password, user.password);
    if (!isPasswordValid) {
      throw new AppError('Invalid email or password.', 401);
    }

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
