import { UserRole } from '@prisma/client';
import type { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { catchAsync } from '../../utils/catchAsync';
import { sendSuccess } from '../../utils/response';
import { ProjectService, projectService } from './project.service';
import type { ProjectFilters } from './project.types';

interface Requester {
  id: string;
  role: UserRole;
}

const getRequester = (req: Request): Requester => {
  if (!req.user) {
    throw new AppError('Authentication required.', 401);
  }
  return { id: req.user.id, role: req.user.role };
};

/**
 * `validate.middleware` only rewrites `req.body`, not `req.query` (query
 * values stay as raw strings even after Zod validation passes), so filters
 * are parsed here from the already-format-validated query string.
 */
const parseProjectFilters = (query: Request['query']): ProjectFilters => {
  const sortBy =
    query.sortBy === 'name' || query.sortBy === 'createdAt' || query.sortBy === 'startDate' || query.sortBy === 'endDate'
      ? query.sortBy
      : undefined;
  const sortOrder = query.sortOrder === 'asc' || query.sortOrder === 'desc' ? query.sortOrder : undefined;

  return {
    page: typeof query.page === 'string' ? Number(query.page) : undefined,
    limit: typeof query.limit === 'string' ? Number(query.limit) : undefined,
    status: typeof query.status === 'string' ? (query.status as ProjectFilters['status']) : undefined,
    customerId: typeof query.customerId === 'string' ? query.customerId : undefined,
    moderatorId: typeof query.moderatorId === 'string' ? query.moderatorId : undefined,
    ownerId: typeof query.ownerId === 'string' ? query.ownerId : undefined,
    dateFrom: typeof query.dateFrom === 'string' ? new Date(`${query.dateFrom}T00:00:00.000Z`) : undefined,
    dateTo: typeof query.dateTo === 'string' ? new Date(`${query.dateTo}T23:59:59.999Z`) : undefined,
    search: typeof query.search === 'string' ? query.search : undefined,
    sortBy,
    sortOrder,
  };
};

export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  create = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const project = await this.projectService.createProject(requester.id, req.body);
    sendSuccess(res, 201, 'Project created successfully.', { project });
  });

  /** OWNER: every project. MODERATOR: assigned projects only. CUSTOMER: own projects only. */
  getAll = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const filters = parseProjectFilters(req.query);
    const result =
      requester.role === UserRole.OWNER
        ? await this.projectService.getAllProjects(filters)
        : requester.role === UserRole.MODERATOR
          ? await this.projectService.getAssignedProjects(requester.id, filters)
          : await this.projectService.getMyProjects(requester.id, filters);
    sendSuccess(res, 200, 'Projects retrieved successfully.', result);
  });

  getById = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const project = await this.projectService.getProjectById(req.params.id as string, requester.id, requester.role);
    sendSuccess(res, 200, 'Project retrieved successfully.', { project });
  });

  update = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const project = await this.projectService.updateProject(req.params.id as string, requester.id, requester.role, req.body);
    sendSuccess(res, 200, 'Project updated successfully.', { project });
  });

  updateStatus = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const project = await this.projectService.updateProjectStatus(
      req.params.id as string,
      requester.id,
      requester.role,
      req.body.status,
    );
    sendSuccess(res, 200, 'Project status updated successfully.', { project });
  });

  assign = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const project = await this.projectService.assignProject(req.params.id as string, req.body);
    sendSuccess(res, 200, 'Project assignment updated successfully.', { project });
  });

  remove = catchAsync(async (req: Request, res: Response): Promise<void> => {
    await this.projectService.deleteProject(req.params.id as string);
    sendSuccess(res, 200, 'Project deleted successfully.');
  });
}

export const projectController = new ProjectController(projectService);
