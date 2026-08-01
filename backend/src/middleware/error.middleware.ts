import { Prisma } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { ZodError } from 'zod';

import { env } from '../config/env';
import type { ApiErrorResponse, ApiValidationIssue } from '../types/api.types';
import { AppError } from '../utils/AppError';

const sendError = (res: Response, statusCode: number, body: ApiErrorResponse): void => {
  res.status(statusCode).json(body);
};

/**
 * Centralized error handler. Must be registered last, after all routes.
 * Express recognizes error-handling middleware by its 4-argument arity.
 */
export const globalErrorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  if (err instanceof AppError) {
    sendError(res, err.statusCode, { success: false, message: err.message });
    return;
  }

  if (err instanceof ZodError) {
    const errors: ApiValidationIssue[] = err.issues.map((issue) => ({
      path: issue.path.filter((segment) => segment !== 'body' && segment !== 'params' && segment !== 'query').join('.'),
      message: issue.message,
    }));
    sendError(res, 400, { success: false, message: 'Validation failed.', errors });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = Array.isArray(err.meta?.target) ? (err.meta.target as string[]).join(', ') : 'field';
      sendError(res, 409, { success: false, message: `A record with this ${target} already exists.` });
      return;
    }
    if (err.code === 'P2025') {
      sendError(res, 404, { success: false, message: 'The requested record was not found.' });
      return;
    }
  }

  if (err instanceof jwt.JsonWebTokenError) {
    sendError(res, 401, { success: false, message: 'Invalid token. Please log in again.' });
    return;
  }

  if (err instanceof jwt.TokenExpiredError) {
    sendError(res, 401, { success: false, message: 'Your session has expired. Please log in again.' });
    return;
  }

  console.error('💥 UNHANDLED ERROR:', err);
  sendError(res, 500, {
    success: false,
    message: env.NODE_ENV === 'production' ? 'Something went wrong.' : err instanceof Error ? err.message : 'Internal server error.',
  });
};
