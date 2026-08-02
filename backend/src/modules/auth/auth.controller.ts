import type { Request, Response } from 'express';

import { catchAsync } from '../../utils/catchAsync';
import { sendSuccess } from '../../utils/response';
import { AppError } from '../../utils/AppError';
import { AuthService, authService } from './auth.service';

export class AuthController {
  constructor(private readonly authService: AuthService) {}

  register = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { user, token } = await this.authService.register(req.body);
    sendSuccess(res, 201, 'User registered successfully.', { user, token });
  });

  login = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { user, token, refreshToken } = await this.authService.login(req.body);
    sendSuccess(res, 200, 'Login successful.', { user, token, refreshToken });
  });

  getMe = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new AppError('Authentication required.', 401);
    }
    const user = await this.authService.getCurrentUser(req.user.id);
    sendSuccess(res, 200, 'Current user retrieved successfully.', { user });
  });

  refresh = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { token, refreshToken } = await this.authService.refresh(req.body.refreshToken);
    sendSuccess(res, 200, 'Token refreshed successfully.', { token, refreshToken });
  });

  logout = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (!req.user) {
      throw new AppError('Authentication required.', 401);
    }
    await this.authService.logout(req.user.id, req.body.refreshToken);
    sendSuccess(res, 200, 'Logged out successfully.');
  });
}

export const authController = new AuthController(authService);
