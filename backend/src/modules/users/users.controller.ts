import type { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { catchAsync } from '../../utils/catchAsync';
import { sendSuccess } from '../../utils/response';
import { UsersService, usersService } from './users.service';

export class UsersController {
  constructor(private readonly usersService: UsersService) {}

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
}

export const usersController = new UsersController(usersService);
