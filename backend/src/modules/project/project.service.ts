import { NotificationType, Prisma, ProjectStatus, UserRole } from '@prisma/client';

import { prisma } from '../../config/database';
import { createNotification } from '../notifications/notification.service';
import { AppError } from '../../utils/AppError';
import { projectInclude } from './project.types';
import type { PaginatedProjects, ProjectFilters, ProjectWithRelations } from './project.types';
import type { AssignProjectInput, CreateProjectInput, UpdateProjectInput } from './project.validation';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

/**
 * PENDING -> IN_PROGRESS -> COMPLETED, with CANCELLED reachable from either
 * non-terminal state. COMPLETED and CANCELLED are both terminal - matches
 * this module's explicit "COMPLETED -> PENDING/IN_PROGRESS" and
 * "CANCELLED -> IN_PROGRESS" rejected-transition list.
 */
const ALLOWED_STATUS_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  [ProjectStatus.PENDING]: [ProjectStatus.IN_PROGRESS, ProjectStatus.CANCELLED],
  [ProjectStatus.IN_PROGRESS]: [ProjectStatus.COMPLETED, ProjectStatus.CANCELLED],
  [ProjectStatus.COMPLETED]: [],
  [ProjectStatus.CANCELLED]: [],
};

/** MODERATOR may only touch schedule + notes via PATCH /:id - name/description/budget are OWNER-only. */
const MODERATOR_UPDATABLE_FIELDS: ReadonlySet<keyof UpdateProjectInput> = new Set(['startDate', 'endDate', 'notes']);

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

export class ProjectService {
  async createProject(ownerId: string, input: CreateProjectInput): Promise<ProjectWithRelations> {
    await this.assertCustomer(input.customerId);
    if (input.moderatorId) {
      await this.assertActiveModerator(input.moderatorId);
    }

    const project = await prisma.project.create({
      data: {
        customerId: input.customerId,
        ownerId,
        moderatorId: input.moderatorId,
        name: input.name,
        description: input.description,
        notes: input.notes,
        budget: input.budget,
        startDate: input.startDate,
        endDate: input.endDate,
        status: ProjectStatus.PENDING,
      },
      include: projectInclude,
    });

    await createNotification({
      userId: input.customerId,
      type: NotificationType.SYSTEM,
      title: 'Project created',
      message: `Your project "${project.name}" has been created.`,
      metadata: { projectId: project.id, event: 'PROJECT_CREATED', status: project.status },
    });

    if (input.moderatorId) {
      await createNotification({
        userId: input.moderatorId,
        type: NotificationType.SYSTEM,
        title: 'Moderator assigned',
        message: `You have been assigned to project "${project.name}".`,
        metadata: { projectId: project.id, event: 'MODERATOR_ASSIGNED' },
      });
    }

    return project;
  }

  /** OWNER: every project. */
  async getAllProjects(filters: ProjectFilters): Promise<PaginatedProjects> {
    return this.listProjects(filters);
  }

  /** MODERATOR: assigned projects only. */
  async getAssignedProjects(moderatorId: string, filters: ProjectFilters): Promise<PaginatedProjects> {
    return this.listProjects({ ...filters, moderatorId });
  }

  /** CUSTOMER: own projects only. */
  async getMyProjects(customerId: string, filters: ProjectFilters): Promise<PaginatedProjects> {
    return this.listProjects({ ...filters, customerId });
  }

  private async listProjects(filters: ProjectFilters): Promise<PaginatedProjects> {
    const page = filters.page ?? DEFAULT_PAGE;
    const limit = filters.limit ?? DEFAULT_LIMIT;

    const where: Prisma.ProjectWhereInput = {
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.moderatorId ? { moderatorId: filters.moderatorId } : {}),
      ...(filters.ownerId ? { ownerId: filters.ownerId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.search ? { name: { contains: filters.search, mode: 'insensitive' } } : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
            createdAt: {
              ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
              ...(filters.dateTo ? { lte: filters.dateTo } : {}),
            },
          }
        : {}),
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

    return { projects, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  }

  async getProjectById(projectId: string, requesterId: string, requesterRole: UserRole): Promise<ProjectWithRelations> {
    const project = await prisma.project.findUnique({ where: { id: projectId }, include: projectInclude });
    if (!project) {
      throw new AppError('Project not found.', 404);
    }
    if (requesterRole === UserRole.CUSTOMER && project.customerId !== requesterId) {
      throw new AppError('Project not found.', 404);
    }
    if (requesterRole === UserRole.MODERATOR && project.moderatorId !== requesterId) {
      throw new AppError('Project not found.', 404);
    }
    return project;
  }

  /**
   * OWNER can update every field below. MODERATOR can only touch their own
   * assigned project (404 otherwise, same ID-enumeration-prevention policy
   * as everywhere else in this codebase) and only schedule/notes fields -
   * name/description/budget are rejected with 403 rather than silently
   * dropped, so a MODERATOR's request never appears to "partially succeed"
   * without telling them why.
   */
  async updateProject(
    projectId: string,
    requesterId: string,
    requesterRole: UserRole,
    input: UpdateProjectInput,
  ): Promise<ProjectWithRelations> {
    const existing = await prisma.project.findUnique({ where: { id: projectId } });
    if (!existing) {
      throw new AppError('Project not found.', 404);
    }

    if (requesterRole === UserRole.MODERATOR) {
      if (existing.moderatorId !== requesterId) {
        throw new AppError('Project not found.', 404);
      }
      const disallowedFields = (Object.keys(input) as Array<keyof UpdateProjectInput>).filter(
        (field) => !MODERATOR_UPDATABLE_FIELDS.has(field),
      );
      if (disallowedFields.length > 0) {
        throw new AppError(`You do not have permission to update: ${disallowedFields.join(', ')}.`, 403);
      }
    }

    const nextStartDate = input.startDate ?? existing.startDate ?? undefined;
    const nextEndDate = input.endDate ?? existing.endDate ?? undefined;
    if (nextStartDate && nextEndDate && nextEndDate < nextStartDate) {
      throw new AppError('endDate cannot be before startDate.', 400);
    }

    return prisma.project.update({
      where: { id: projectId },
      data: {
        name: input.name,
        description: input.description,
        notes: input.notes,
        budget: input.budget,
        startDate: input.startDate,
        endDate: input.endDate,
      },
      include: projectInclude,
    });
  }

  async updateProjectStatus(
    projectId: string,
    requesterId: string,
    requesterRole: UserRole,
    newStatus: ProjectStatus,
  ): Promise<ProjectWithRelations> {
    return prisma.$transaction(async (tx) => {
      const project = await tx.project.findUnique({ where: { id: projectId } });
      if (!project) {
        throw new AppError('Project not found.', 404);
      }
      if (requesterRole === UserRole.MODERATOR && project.moderatorId !== requesterId) {
        throw new AppError('Project not found.', 404);
      }

      const allowedNext = ALLOWED_STATUS_TRANSITIONS[project.status];
      if (!allowedNext.includes(newStatus)) {
        throw new AppError(`Cannot change project status from ${project.status} to ${newStatus}.`, 400);
      }

      const updated = await tx.project.update({ where: { id: projectId }, data: { status: newStatus }, include: projectInclude });

      const { title, message } = this.describeStatusChange(project.name, newStatus);
      await createNotification(
        {
          userId: project.customerId,
          type: NotificationType.SYSTEM,
          title,
          message,
          metadata: { projectId: project.id, event: 'PROJECT_STATUS_CHANGED', status: newStatus },
        },
        tx,
      );

      return updated;
    });
  }

  private describeStatusChange(projectName: string, status: ProjectStatus): { title: string; message: string } {
    if (status === ProjectStatus.IN_PROGRESS) {
      return { title: 'Project started', message: `Your project "${projectName}" is now in progress.` };
    }
    if (status === ProjectStatus.COMPLETED) {
      return { title: 'Project completed', message: `Your project "${projectName}" has been completed.` };
    }
    return { title: 'Project cancelled', message: `Your project "${projectName}" has been cancelled.` };
  }

  /** OWNER-only. Reassigns any combination of customer/moderator/owner in one call. */
  async assignProject(projectId: string, input: AssignProjectInput): Promise<ProjectWithRelations> {
    const existing = await prisma.project.findUnique({ where: { id: projectId } });
    if (!existing) {
      throw new AppError('Project not found.', 404);
    }

    if (input.customerId) {
      await this.assertCustomer(input.customerId);
    }
    if (input.moderatorId) {
      await this.assertActiveModerator(input.moderatorId);
    }
    if (input.ownerId) {
      await this.assertOwner(input.ownerId);
    }

    const updated = await prisma.project.update({
      where: { id: projectId },
      data: {
        customerId: input.customerId,
        moderatorId: input.moderatorId,
        ownerId: input.ownerId,
      },
      include: projectInclude,
    });

    if (input.moderatorId && input.moderatorId !== existing.moderatorId) {
      await createNotification({
        userId: input.moderatorId,
        type: NotificationType.SYSTEM,
        title: 'Moderator assigned',
        message: `You have been assigned to project "${updated.name}".`,
        metadata: { projectId: updated.id, event: 'MODERATOR_ASSIGNED' },
      });
    }

    if (input.ownerId && input.ownerId !== existing.ownerId) {
      await createNotification({
        userId: input.ownerId,
        type: NotificationType.SYSTEM,
        title: 'Owner assigned',
        message: `You have been assigned as owner of project "${updated.name}".`,
        metadata: { projectId: updated.id, event: 'OWNER_ASSIGNED' },
      });
    }

    return updated;
  }

  /** OWNER-only. Project has no soft-delete column and nothing else references it via FK, so this is a real delete. */
  async deleteProject(projectId: string): Promise<void> {
    const existing = await prisma.project.findUnique({ where: { id: projectId } });
    if (!existing) {
      throw new AppError('Project not found.', 404);
    }
    await prisma.project.delete({ where: { id: projectId } });
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

  private async assertActiveModerator(moderatorId: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: moderatorId } });
    if (!user) {
      throw new AppError('Moderator not found.', 404);
    }
    if (user.role !== UserRole.MODERATOR) {
      throw new AppError('The provided user is not a moderator.', 400);
    }
    if (!user.isActive) {
      throw new AppError('Cannot assign an inactive moderator.', 400);
    }
  }

  private async assertOwner(ownerId: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: ownerId } });
    if (!user) {
      throw new AppError('Owner not found.', 404);
    }
    if (user.role !== UserRole.OWNER) {
      throw new AppError('The provided user is not an owner.', 400);
    }
  }
}

export const projectService = new ProjectService();
