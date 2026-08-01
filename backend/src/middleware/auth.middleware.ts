import type { NextFunction, Request, Response } from 'express';

import { prisma } from '../config/database';
import { catchAsync } from '../utils/catchAsync';
import { AppError } from '../utils/AppError';
import { verifyToken } from '../utils/jwt';

/**
 * Verifies the JWT sent in the Authorization header, confirms the referenced
 * user still exists and is active, and attaches a minimal identity to `req.user`.
 */
export const authenticate = catchAsync(async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError('You are not logged in. Please provide a valid token.', 401);
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    throw new AppError('You are not logged in. Please provide a valid token.', 401);
  }

  const decoded = verifyToken(token);

  const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
  if (!user) {
    throw new AppError('The user belonging to this token no longer exists.', 401);
  }
  if (!user.isActive) {
    throw new AppError('This user account has been deactivated.', 403);
  }

  req.user = { id: user.id, email: user.email, role: user.role };
  next();
});
