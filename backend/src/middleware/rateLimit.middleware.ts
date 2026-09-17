import { rateLimit } from 'express-rate-limit';
import type { Request, RequestHandler } from 'express';

import { env } from '../config/env';
import { AppError } from '../utils/AppError';

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
  message: string;
  /** Omit to always enforce. Passed straight through to express-rate-limit's own `skip`. */
  skip?: (req: Request) => boolean;
}

/**
 * Reusable rate-limiter factory. `standardHeaders: true` + `legacyHeaders:
 * false` returns only the modern `RateLimit-*` response headers (no
 * `X-RateLimit-*` duplicates - nothing extra for a client to fingerprint).
 * The `handler` forwards a 429 AppError into `next()` instead of writing
 * its own response, so a throttled request gets exactly the same
 * `{ success: false, message }` envelope as every other error in this API
 * - all via the existing global error handler, no new response-shaping
 * code anywhere.
 */
export const createRateLimiter = (options: RateLimiterOptions): RequestHandler =>
  rateLimit({
    windowMs: options.windowMs,
    limit: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: options.skip,
    handler: (_req, _res, next) => next(new AppError(options.message, 429)),
  });

/**
 * The automated integration test suite (tests/**) shares one Express app
 * instance and one IP across 500+ pre-existing tests run back-to-back in a
 * single process - nowhere near a real 15-minute brute-force attempt, but
 * still far more than 5 or 100 requests to the same routes. Enforcing the
 * real limits there would throttle unrelated tests with unrelated 429s.
 * Skipped only for NODE_ENV=test; the exact configured behavior (429 after
 * N requests, headers, reset) is verified directly in
 * tests/rateLimit/rateLimit.test.ts using isolated `createRateLimiter(...)`
 * instances that do NOT set `skip`, so the real 5/100 numbers are still
 * genuinely exercised.
 */
const skipInAutomatedTests = (): boolean => env.NODE_ENV === 'test';

/**
 * Scoped to POST /api/auth/register and POST /api/auth/login only (see
 * auth.routes.ts) - not the whole /auth router, since GET /api/auth/me is
 * a normal authenticated read, not a brute-force target. Both routes share
 * ONE counter per IP, matching the "5 requests per 15 minutes" bucket for
 * authentication endpoints as a whole rather than 5 for each route
 * separately (an attacker alternating between the two shouldn't get 10
 * attempts). Apply this same limiter to Refresh Token / Forgot Password
 * routes when those are eventually built.
 */
export const authRateLimiter = createRateLimiter({
  windowMs: env.RATE_LIMIT_AUTH_WINDOW_MS,
  max: env.RATE_LIMIT_AUTH_MAX,
  message: 'Too many authentication attempts. Please try again later.',
  skip: skipInAutomatedTests,
});

/** Mounted on `/api` in app.ts, so every route under it is covered - `/health` is registered separately and is never touched by this limiter. */
export const apiRateLimiter = createRateLimiter({
  windowMs: env.RATE_LIMIT_API_WINDOW_MS,
  max: env.RATE_LIMIT_API_MAX,
  message: 'Too many requests. Please try again later.',
  skip: skipInAutomatedTests,
});
