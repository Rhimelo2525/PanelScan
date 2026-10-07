import type { Request, Response } from 'express';

import { getRequestAuditContext } from '../../utils/activityLog';
import { AppError } from '../../utils/AppError';
import { catchAsync } from '../../utils/catchAsync';
import { sendSuccess } from '../../utils/response';
import { UsersService, usersService } from './users.service';

export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** OWNER: invites a staff member, who activates the account from the emailed code. */
  create = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new AppError('Authentication required.', 401);
    }
    const user = await this.usersService.createUser(req.body, req.user.id, getRequestAuditContext(req));
    sendSuccess(res, 201, `Invitation sent to ${user.email}.`, { user });
  });

  resendInvitation = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new AppError('Authentication required.', 401);
    }
    const user = await this.usersService.resendInvitation(req.params.id as string, req.user.id, getRequestAuditContext(req));
    sendSuccess(res, 200, `Invitation sent again to ${user.email}.`, { user });
  });

  remove = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new AppError('Authentication required.', 401);
    }
    await this.usersService.removeUser(req.params.id as string, req.user.id, getRequestAuditContext(req));
    sendSuccess(res, 200, 'Account removed.');
  });

  getAll = catchAsync(async (_req: Request, res: Response): Promise<void> => {
    const users = await this.usersService.getAllUsers();
    sendSuccess(res, 200, 'Users retrieved successfully.', { users });
  });

  getById = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new AppError('Authentication required.', 401);
    }
    const user = await this.usersService.getUserById(req.params.id as string, req.user.id, req.user.role);
    sendSuccess(res, 200, 'User retrieved successfully.', { user });
  });

  update = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new AppError('Authentication required.', 401);
    }
    const user = await this.usersService.updateUser(req.params.id as string, req.user.id, req.user.role, req.body);
    sendSuccess(res, 200, 'User updated successfully.', { user });
  });

  deactivate = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const user = await this.usersService.deactivateUser(req.params.id as string);
    sendSuccess(res, 200, 'User deactivated successfully.', { user });
  });

  reactivate = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const user = await this.usersService.reactivateUser(req.params.id as string);
    sendSuccess(res, 200, 'User reactivated successfully.', { user });
  });
}

export const usersController = new UsersController(usersService);
