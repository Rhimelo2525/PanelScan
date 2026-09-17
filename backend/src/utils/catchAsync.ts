import type { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncRequestHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export const catchAsync = (fn: AsyncRequestHandler): RequestHandler => {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
};
