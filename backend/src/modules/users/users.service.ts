import { Prisma, UserRole } from '@prisma/client';

import { prisma } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { hashPassword } from '../../utils/password';

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

export type PublicUser = Prisma.UserGetPayload<{ select: typeof userSelect }>;

export interface CreateUserInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone?: string;
  role?: UserRole;
}

export interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  phone?: string;
}

export class UsersService {
  async createUser(input: CreateUserInput): Promise<PublicUser> {
    const existing = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
    if (existing) {
      throw new AppError('An account with this email address already exists.', 409);
    }

    const hashedPassword = await hashPassword(input.password);

    return prisma.user.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email.toLowerCase(),
        password: hashedPassword,
        phone: input.phone,
        role: input.role ?? UserRole.MODERATOR,
        isActive: true,
      },
      select: userSelect,
    });
  }

  async getAllUsers(): Promise<PublicUser[]> {
    return prisma.user.findMany({ select: userSelect, orderBy: { createdAt: 'desc' } });
  }

  async getUserById(id: string, requesterId: string, requesterRole: UserRole): Promise<PublicUser> {
    if (id !== requesterId && requesterRole === UserRole.CUSTOMER) {
      throw new AppError('You do not have permission to view this user.', 403);
    }

    const user = await prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!user) {
      throw new AppError('User not found.', 404);
    }
    return user;
  }

  async updateUser(id: string, requesterId: string, requesterRole: UserRole, data: UpdateUserInput): Promise<PublicUser> {
    if (id !== requesterId && requesterRole !== UserRole.OWNER) {
      throw new AppError('You do not have permission to update this user.', 403);
    }

    return prisma.user.update({ where: { id }, data, select: userSelect });
  }

  async deactivateUser(id: string): Promise<PublicUser> {
    return prisma.user.update({ where: { id }, data: { isActive: false }, select: userSelect });
  }
}

export const usersService = new UsersService();
