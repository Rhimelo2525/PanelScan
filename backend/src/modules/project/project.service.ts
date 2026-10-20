import path from 'path';
import { NotificationType, Prisma, ProjectSource, ProjectStatus, UserRole } from '@prisma/client';
import sharp from 'sharp';

import { prisma } from '../../config/database';
import { notifyStaff } from '../notifications/notification.triggers';
import { AppError } from '../../utils/AppError';
import { ALLOWED_IMAGE_EXTENSIONS, detectImageType } from '../../utils/imageSniff';
import { isWallPhotoPathOwnedBy, purgeWallPhotos, saveWallPhoto, wallPhotoVersion } from '../../utils/wallPhotoStorage';
import { parseProjectCode, projectCodeFor } from './project.code';
import { projectInclude } from './project.types';
import type {
  CustomerFilters,
  PaginatedProjectCustomers,
  PaginatedProjects,
  ProjectFilters,
  ProjectView,
  ProjectWithRelations,
} from './project.types';
import type { MobileProjectInput } from './project.validation';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

const buildOrderBy = (
  sortBy: ProjectFilters['sortBy'],
  sortOrder: ProjectFilters['sortOrder'],
): Prisma.ProjectOrderByWithRelationInput => {
  const direction = sortOrder ?? 'desc';
  if (sortBy === 'name') return { name: direction };
  if (sortBy === 'startDate') return { startDate: direction };
  if (sortBy === 'endDate') return { endDate: direction };
  return { createdAt: direction };
};

/** The longest side a stored wall photo keeps, and its JPEG quality. */
const WALL_PHOTO_MAX_SIDE_PX = 1600;
const WALL_PHOTO_QUALITY = 82;
const MAX_WALL_PHOTO_BYTES = 5 * 1024 * 1024;
// sharp refuses a "decompression bomb" (tiny file, enormous declared size) above this.
const MAX_INPUT_PIXELS = 40_000_000;

export interface UploadedWallPhoto {
  buffer: Buffer;
  originalname: string;
}

/** Every project the API returns carries its reference code, and its wall photo as a staff URL, never the stored location. */
const withCode = (project: ProjectWithRelations): ProjectView => {
  const { arDataUrl, ...rest } = project;
  const version = arDataUrl ? wallPhotoVersion(arDataUrl) : null;
  return {
    ...rest,
    projectCode: projectCodeFor(project),
    wallPhotoUrl: version ? `/projects/${project.id}/wall-photo?v=${version}` : null,
  };
};

/** Each word must match the customer's first name, last name or email ("Justin Ablog" finds Justin Andre Ablog). */
const customerSearch = (search: string | undefined): Prisma.UserWhereInput => {
  const words = search?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (words.length === 0) return {};
  return {
    AND: words.map((word) => ({
      OR: [
        { firstName: { contains: word, mode: 'insensitive' } },
        { lastName: { contains: word, mode: 'insensitive' } },
        { email: { contains: word, mode: 'insensitive' } },
      ],
    })),
  };
};

/**
 * Customer projects. Customers create them (from the mobile app) and may
 * delete their own; the owner and moderators can only view them - there is
 * deliberately no staff write path in this module.
 */
export class ProjectService {
  /** OWNER and MODERATOR: every project, view-only. */
  async getAllProjects(filters: ProjectFilters): Promise<PaginatedProjects> {
    return this.listProjects(filters);
  }

  /** CUSTOMER: own projects only. */
  async getMyProjects(customerId: string, filters: ProjectFilters): Promise<PaginatedProjects> {
    return this.listProjects({ ...filters, customerId });
  }

  /**
   * OWNER and MODERATOR: the customers who have projects, most recently
   * active first, with how many projects each has - the Projects page's
   * first level, before opening one customer's projects.
   */
  async listProjectCustomers(filters: CustomerFilters): Promise<PaginatedProjectCustomers> {
    const page = filters.page ?? DEFAULT_PAGE;
    const limit = filters.limit ?? DEFAULT_LIMIT;
    const where: Prisma.ProjectWhereInput = {
      ...(filters.source ? { source: filters.source } : {}),
      customer: customerSearch(filters.search),
    };

    const [groups, allGroups] = await Promise.all([
      prisma.project.groupBy({
        by: ['customerId'],
        where,
        _count: { _all: true },
        _max: { createdAt: true },
        orderBy: { _max: { createdAt: 'desc' } },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.project.groupBy({ by: ['customerId'], where }),
    ]);

    const users = await prisma.user.findMany({
      where: { id: { in: groups.map((group) => group.customerId) } },
      select: { id: true, firstName: true, lastName: true, email: true, phone: true },
    });
    const byId = new Map(users.map((user) => [user.id, user]));

    const customers = groups.flatMap((group) => {
      const user = byId.get(group.customerId);
      return user ? [{ ...user, projectCount: group._count._all, lastProjectAt: group._max.createdAt }] : [];
    });
    const total = allGroups.length;
    return { customers, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  }

  private async listProjects(filters: ProjectFilters): Promise<PaginatedProjects> {
    const page = filters.page ?? DEFAULT_PAGE;
    const limit = filters.limit ?? DEFAULT_LIMIT;

    // A reference code names one project: its id prefix and the year it was made.
    const code = filters.code ? parseProjectCode(filters.code) : null;

    const where: Prisma.ProjectWhereInput = {
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.moderatorId ? { moderatorId: filters.moderatorId } : {}),
      ...(filters.ownerId ? { ownerId: filters.ownerId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.source ? { source: filters.source } : {}),
      ...(filters.externalProjectId ? { externalProjectId: filters.externalProjectId } : {}),
      ...(filters.search ? { name: { contains: filters.search, mode: 'insensitive' } } : {}),
      ...(code ? { id: { gte: code.idFrom, lte: code.idTo } } : {}),
      AND: [
        filters.dateFrom || filters.dateTo
          ? {
              createdAt: {
                ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
                ...(filters.dateTo ? { lte: filters.dateTo } : {}),
              },
            }
          : {},
        code ? { createdAt: { gte: code.createdFrom, lt: code.createdBefore } } : {},
      ],
    };

    const [projects, total] = await Promise.all([
      prisma.project.findMany({
        where,
        include: projectInclude,
        orderBy: buildOrderBy(filters.sortBy, filters.sortOrder),
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.project.count({ where }),
    ]);

    return {
      projects: projects.map(withCode),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  /** OWNER and MODERATOR: any project. CUSTOMER: their own (404 otherwise, so ids can't be probed). */
  async getProjectById(projectId: string, requesterId: string, requesterRole: UserRole): Promise<ProjectView> {
    const project = await prisma.project.findUnique({ where: { id: projectId }, include: projectInclude });
    if (!project) {
      throw new AppError('Project not found.', 404);
    }
    if (requesterRole === UserRole.CUSTOMER && project.customerId !== requesterId) {
      throw new AppError('Project not found.', 404);
    }
    return withCode(project);
  }

  /**
   * CUSTOMER: saves a project from the mobile app (AR measurement + panel
   * estimate) as a MOBILE_AR_3D project. Keyed by the app's project id, so
   * saving the same project again updates it instead of adding another.
   */
  async syncMobileProject(customerId: string, input: MobileProjectInput): Promise<ProjectView> {
    await this.assertCustomer(customerId);
    const data = {
      name: input.name,
      description: input.description,
      budget: input.budget,
      arMetadata: input.arMetadata ? (input.arMetadata as Prisma.InputJsonValue) : undefined,
    };

    const existing = await prisma.project.findFirst({
      where: { customerId, source: ProjectSource.MOBILE_AR_3D, externalProjectId: input.externalProjectId },
    });
    if (existing) {
      return withCode(await prisma.project.update({ where: { id: existing.id }, data, include: projectInclude }));
    }

    const created = withCode(
      await prisma.project.create({
        data: {
          ...data,
          customerId,
          status: ProjectStatus.PENDING,
          source: ProjectSource.MOBILE_AR_3D,
          externalProjectId: input.externalProjectId,
        },
        include: projectInclude,
      }),
    );

    // Staff can look it up by its code; saving it again is not news.
    const customerName = `${created.customer.firstName} ${created.customer.lastName}`.trim();
    await notifyStaff({
      type: NotificationType.SYSTEM,
      title: 'New project from the mobile app',
      message: `${customerName} saved "${created.name}" (${created.projectCode}) from the PanelScan app.`,
      metadata: { projectId: created.id, projectCode: created.projectCode, event: 'MOBILE_PROJECT_CREATED' },
    });

    return created;
  }

  /**
   * CUSTOMER: deletes their own mobile project, only while nobody from the
   * team has taken it on (still PENDING, no moderator assigned).
   */
  async deleteMobileProject(customerId: string, externalProjectId: string): Promise<void> {
    const existing = await prisma.project.findFirst({
      where: { customerId, source: ProjectSource.MOBILE_AR_3D, externalProjectId },
    });
    if (!existing) {
      throw new AppError('Project not found.', 404);
    }
    if (existing.status !== ProjectStatus.PENDING || existing.moderatorId) {
      throw new AppError('This project is already being handled by the PanelScan team and can no longer be deleted.', 400);
    }
    await prisma.project.delete({ where: { id: existing.id } });
    await purgeWallPhotos(existing.id).catch((error) => console.error('[project] Could not remove wall photos:', error));
  }

  /**
   * CUSTOMER: the photo of the measured wall for one of their mobile projects,
   * drawn on by the app with the measured outline and its width and height.
   * It is checked (extension, real image bytes, decodable), then re-encoded:
   * no EXIF (so no location) and at most 1600 px on its longest side. Saving
   * again replaces the earlier photo.
   */
  async setWallPhoto(customerId: string, externalProjectId: string, file: UploadedWallPhoto): Promise<ProjectView> {
    const project = await prisma.project.findFirst({
      where: { customerId, source: ProjectSource.MOBILE_AR_3D, externalProjectId },
      select: { id: true },
    });
    if (!project) {
      throw new AppError('Project not found.', 404);
    }

    if (file.buffer.length > MAX_WALL_PHOTO_BYTES) {
      throw new AppError('Image size must be less than 5MB.', 413);
    }
    const extension = path.extname(file.originalname ?? '').toLowerCase();
    if (!ALLOWED_IMAGE_EXTENSIONS.has(extension) || detectImageType(file.buffer) === null) {
      throw new AppError('Please upload a JPG, PNG, or WEBP image.', 400);
    }
    let processed: Buffer;
    try {
      processed = await sharp(file.buffer, { limitInputPixels: MAX_INPUT_PIXELS })
        .rotate()
        .resize(WALL_PHOTO_MAX_SIDE_PX, WALL_PHOTO_MAX_SIDE_PX, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: WALL_PHOTO_QUALITY })
        .toBuffer();
    } catch {
      throw new AppError("We couldn't read that image. Please try again.", 400);
    }

    let stored: string;
    try {
      stored = await saveWallPhoto(project.id, processed);
    } catch (error) {
      console.error('[project] Could not store the wall photo:', error);
      throw new AppError("We couldn't save the wall photo right now. Please try again shortly.", 503);
    }
    const updated = await prisma.project.update({ where: { id: project.id }, data: { arDataUrl: stored }, include: projectInclude });
    // Only once the project points at the new photo is the old one removed.
    await purgeWallPhotos(project.id, stored).catch((error) => console.error('[project] Could not remove old wall photos:', error));
    return withCode(updated);
  }

  /** OWNER and MODERATOR: where the project's wall photo is stored (a Blob URL or a relative disk path). */
  async getWallPhotoFile(projectId: string): Promise<string> {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { arDataUrl: true } });
    // The path check is a second guard: even a tampered value can't serve another project's file.
    if (!project?.arDataUrl || !isWallPhotoPathOwnedBy(project.arDataUrl, projectId)) {
      throw new AppError('Wall photo not found.', 404);
    }
    return project.arDataUrl;
  }

  private async assertCustomer(customerId: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: customerId } });
    if (!user) {
      throw new AppError('Customer not found.', 404);
    }
    if (user.role !== UserRole.CUSTOMER) {
      throw new AppError('The provided user is not a customer.', 400);
    }
  }
}

export const projectService = new ProjectService();
