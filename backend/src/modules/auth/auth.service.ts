import { type User, UserRole } from '@prisma/client';

import { prisma } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { signToken } from '../../utils/jwt';
import { comparePassword, hashPassword } from '../../utils/password';
import type { LoginInput, RegisterInput } from './auth.validation';

type SanitizedUser = Omit<User, 'password'>;

interface AuthResult {
  user: SanitizedUser;
  token: string;
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

  async login(input: LoginInput): Promise<AuthResult> {
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
    return { user: sanitizeUser(user), token };
  }

  async getCurrentUser(userId: string): Promise<SanitizedUser> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError('User not found.', 404);
    }
    return sanitizeUser(user);
  }
}

export const authService = new AuthService();
