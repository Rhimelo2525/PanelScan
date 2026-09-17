import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { AnyZodObject } from 'zod';

/**
 * Validates `{ body, query, params }` against a Zod schema and, on success,
 * replaces `req.body` with the parsed (and transformed, e.g. trimmed/lower-cased)
 * value. Validation failures are forwarded to the global error handler as `ZodError`.
 */
export const validate = (schema: AnyZodObject): RequestHandler => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      }) as { body?: unknown };

      if (parsed.body !== undefined) {
        req.body = parsed.body;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};
