import { ProjectSource, UserRole } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { catchAsync } from '../../utils/catchAsync';
import { sendSuccess } from '../../utils/response';
import { uploadsRoot } from '../../utils/profilePictureStorage';
import { isWallPhotoUrl } from '../../utils/wallPhotoStorage';
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
    source: typeof query.source === 'string' ? (query.source as ProjectFilters['source']) : undefined,
    externalProjectId: typeof query.externalProjectId === 'string' ? query.externalProjectId : undefined,
    customerId: typeof query.customerId === 'string' ? query.customerId : undefined,
    moderatorId: typeof query.moderatorId === 'string' ? query.moderatorId : undefined,
    ownerId: typeof query.ownerId === 'string' ? query.ownerId : undefined,
    dateFrom: typeof query.dateFrom === 'string' ? new Date(`${query.dateFrom}T00:00:00.000Z`) : undefined,
    dateTo: typeof query.dateTo === 'string' ? new Date(`${query.dateTo}T23:59:59.999Z`) : undefined,
    search: typeof query.search === 'string' ? query.search : undefined,
    code: typeof query.code === 'string' ? query.code : undefined,
    sortBy,
    sortOrder,
  };
};

export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  /** CUSTOMER: saves (or updates) a project from the mobile app. */
  syncMobile = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const project = await this.projectService.syncMobileProject(requester.id, req.body);
    sendSuccess(res, 200, 'Project saved successfully.', { project });
  });

  /** CUSTOMER: deletes their own mobile project while it is still pending. */
  removeMobile = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    await this.projectService.deleteMobileProject(requester.id, req.params.externalProjectId as string);
    sendSuccess(res, 200, 'Project deleted successfully.');
  });

  /** CUSTOMER: the photo of the measured wall for one of their mobile projects (multipart, field "image"). */
  uploadWallPhoto = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    if (!req.file) {
      throw new AppError('Please provide an image file to upload.', 400);
    }
    const project = await this.projectService.setWallPhoto(requester.id, req.params.externalProjectId as string, req.file);
    sendSuccess(res, 200, 'Wall photo saved successfully.', { project });
  });

  /** The project's wall photo: staff see any, a customer their own. The ?v= version names one photo, so a matching one is cached for good. */
  viewWallPhoto = catchAsync(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const requester = getRequester(req);
    const stored = await this.projectService.getWallPhotoFile(req.params.id as string, requester.id, requester.role);
    const cache = typeof req.query.v === 'string' && stored.includes(req.query.v) ? 'private, max-age=31536000, immutable' : 'private, no-cache';
    // Blob mode: the access check already ran, so the unguessable Blob URL can be handed over.
    if (isWallPhotoUrl(stored)) {
      res.set('Cache-Control', cache);
      res.redirect(302, stored);
      return;
    }
    res.sendFile(
      stored,
      {
        root: uploadsRoot,
        dotfiles: 'deny',
        cacheControl: false,
        headers: { 'Cache-Control': cache, 'Content-Type': 'image/jpeg', 'X-Content-Type-Options': 'nosniff' },
      },
      (error) => {
        if (error && !res.headersSent) next(new AppError('Wall photo not found.', 404));
      },
    );
  });

  /** OWNER and MODERATOR: every project (view-only). CUSTOMER: own projects only. */
  getAll = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const filters = parseProjectFilters(req.query);
    const result =
      requester.role === UserRole.OWNER || requester.role === UserRole.MODERATOR
        ? await this.projectService.getAllProjects(filters)
        : await this.projectService.getMyProjects(requester.id, filters);
    sendSuccess(res, 200, 'Projects retrieved successfully.', result);
  });

  /** OWNER and MODERATOR: customers with projects, for the Projects page's customer directory. */
  getCustomers = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const query = req.query;
    const result = await this.projectService.listProjectCustomers({
      page: typeof query.page === 'string' ? Number(query.page) : undefined,
      limit: typeof query.limit === 'string' ? Number(query.limit) : undefined,
      source: typeof query.source === 'string' ? (query.source as ProjectSource) : undefined,
      search: typeof query.search === 'string' ? query.search : undefined,
    });
    sendSuccess(res, 200, 'Customers retrieved successfully.', result);
  });

  getById = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const project = await this.projectService.getProjectById(req.params.id as string, requester.id, requester.role);
    sendSuccess(res, 200, 'Project retrieved successfully.', { project });
  });
}

export const projectController = new ProjectController(projectService);
