import type { Installer } from '@prisma/client';

import { prisma } from '../../config/database';
import { AppError } from '../../utils/AppError';
import type { InstallerFilters, PaginatedInstallers } from './installer.types';
import type { CreateInstallerInput, UpdateInstallerInput } from './installer.validation';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

export class InstallerService {
  async createInstaller(input: CreateInstallerInput): Promise<Installer> {
    if (input.email) {
      const existing = await prisma.installer.findUnique({ where: { email: input.email } });
      if (existing) {
        throw new AppError('An installer with this email already exists.', 409);
      }
    }

    return prisma.installer.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        specialty: input.specialty,
      },
    });
  }

  async getActiveInstallers(filters: InstallerFilters): Promise<PaginatedInstallers> {
    const page = filters.page ?? DEFAULT_PAGE;
    const limit = filters.limit ?? DEFAULT_LIMIT;
    const where = { isActive: true };

    const [installers, total] = await Promise.all([
      prisma.installer.findMany({ where, orderBy: { firstName: 'asc' }, skip: (page - 1) * limit, take: limit }),
      prisma.installer.count({ where }),
    ]);

    return { installers, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  }

  async getInstallerById(id: string): Promise<Installer> {
    const installer = await prisma.installer.findUnique({ where: { id } });
    if (!installer) {
      throw new AppError('Installer not found.', 404);
    }
    return installer;
  }

  async updateInstaller(id: string, input: UpdateInstallerInput): Promise<Installer> {
    const existing = await prisma.installer.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Installer not found.', 404);
    }

    return prisma.installer.update({ where: { id }, data: input });
  }

  async deactivateInstaller(id: string): Promise<Installer> {
    const existing = await prisma.installer.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Installer not found.', 404);
    }

    return prisma.installer.update({ where: { id }, data: { isActive: false } });
  }
}

export const installerService = new InstallerService();
