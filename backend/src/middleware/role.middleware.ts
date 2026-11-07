import type { UserRole } from '@prisma/client';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { AppError } from '../utils/AppError';

/**
 * Restricts a route to the given roles. Must run after `authenticate`.
 */
export const restrictTo = (...allowedRoles: UserRole[]): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError('Authentication required.', 401));
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      next(new AppError('You do not have permission to perform this action.', 403));
      return;
    }

    next();
  };
};

/**
 * Keeps a customer who has not proven their email out of checkout and profile
 * edits. Must run after `authenticate`, on customer-only routes: `authenticate`
 * reads the flag on every request, so the route opens as soon as they verify.
 */
export const requireVerifiedEmail: RequestHandler = (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.user) {
    next(new AppError('Authentication required.', 401));
    return;
  }

  if (!req.user.emailVerified) {
    next(new AppError('Please verify your email address first. You can do this in your profile.', 403));
    return;
  }

  next();
};
