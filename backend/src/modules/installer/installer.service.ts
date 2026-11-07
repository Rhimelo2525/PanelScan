import type { Installer, Prisma } from '@prisma/client';

import { prisma } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { DISPOSABLE_EMAIL_MESSAGE, isDisposableEmail } from '../../utils/disposableEmail';
import { screenNewAccountEmail } from '../../utils/emailScreening';
import { containsText, searchWords } from '../../utils/searchWhere';
import type { InstallerFilters, PaginatedInstallers } from './installer.types';
import type { CreateInstallerInput, UpdateInstallerInput } from './installer.validation';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

export class InstallerService {
  async createInstaller(input: CreateInstallerInput): Promise<Installer> {
    if (input.email) {
      // Same email screening as customer sign-up and new moderators.
      if (isDisposableEmail(input.email)) {
        throw new AppError(DISPOSABLE_EMAIL_MESSAGE, 400);
      }
      const existing = await prisma.installer.findUnique({ where: { email: input.email } });
      if (existing) {
        throw new AppError('An installer with this email already exists.', 409);
      }
      // Unknown temp-mail domains and mailboxes that do not exist. Last, as it may call a paid API.
      await screenNewAccountEmail(input.email, { checkMailbox: true });
    }

    return prisma.installer.create({
      data: {
        firstName: input.firstName,
        middleInitial: input.middleInitial,
        lastName: input.lastName,
        email: input.email,
        phone: input.phone,
        specialty: input.specialty,
      },
    });
  }

  async getInstallers(filters: InstallerFilters): Promise<PaginatedInstallers> {
    const page = filters.page ?? DEFAULT_PAGE;
    const limit = filters.limit ?? DEFAULT_LIMIT;
    const search = searchWords<Prisma.InstallerWhereInput>(filters.search, (word) => [
      { firstName: containsText(word) },
      { lastName: containsText(word) },
      { email: containsText(word) },
      { phone: containsText(word.replace(/^0/, '')) },
      { specialty: containsText(word) },
    ]);
    const status = filters.status ?? 'active';
    const where: Prisma.InstallerWhereInput = {
      ...(status === 'all' ? {} : { isActive: status === 'active' }),
      ...search,
    };

    const [installers, total] = await Promise.all([
      prisma.installer.findMany({ where, orderBy: [{ isActive: 'desc' }, { firstName: 'asc' }], skip: (page - 1) * limit, take: limit }),
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

  async activateInstaller(id: string): Promise<Installer> {
    const existing = await prisma.installer.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Installer not found.', 404);
    }

    return prisma.installer.update({ where: { id }, data: { isActive: true } });
  }

  /**
   * Removes an installer for good. Only one with no bookings: deleting one that
   * has any would blank the installer on those bookings (onDelete: SetNull) and
   * lose who did the work, so those stay on record and can only be deactivated.
   * One statement, so a booking assigned at the same moment cannot be blanked.
   */
  async deleteInstaller(id: string): Promise<void> {
    const { count } = await prisma.installer.deleteMany({ where: { id, bookings: { none: {} } } });
    if (count > 0) return;

    const existing = await prisma.installer.findUnique({ where: { id }, select: { _count: { select: { bookings: true } } } });
    if (!existing) {
      throw new AppError('Installer not found.', 404);
    }
    const bookings = existing._count.bookings;
    throw new AppError(
      `This installer has ${bookings} installation ${bookings === 1 ? 'booking' : 'bookings'} on record, so they can't be deleted. Deactivate them instead to keep that history.`,
      409,
    );
  }
}

export const installerService = new InstallerService();
