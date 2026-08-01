import type { Response } from 'express';

import type { ApiSuccessResponse } from '../types/api.types';

export const sendSuccess = <T>(res: Response, statusCode: number, message: string, data?: T): void => {
  const payload: ApiSuccessResponse<T> = {
    success: true,
    message,
    ...(data !== undefined ? { data } : {}),
  };
  res.status(statusCode).json(payload);
};
