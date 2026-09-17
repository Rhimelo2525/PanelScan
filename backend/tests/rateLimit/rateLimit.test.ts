import express from 'express';
import type { Application } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { globalErrorHandler } from '../../src/middleware/error.middleware';
import { createRateLimiter } from '../../src/middleware/rateLimit.middleware';
import type { RateLimiterOptions } from '../../src/middleware/rateLimit.middleware';
import { sendSuccess } from '../../src/utils/response';
import app from '../helpers/testApp';

/**
 * A fresh, throwaway Express app per call - its own brand-new
 * createRateLimiter() instance with its own virgin in-memory store, so
 * tests never share counters with each other or with the real shared
 * `app` (which skips rate limiting entirely under NODE_ENV=test - see
 * rateLimit.middleware.ts). Deliberately does NOT pass `skip`, so these
 * instances always enforce, regardless of NODE_ENV.
 */
const buildLimitedApp = (options: RateLimiterOptions): Application => {
  const testApp = express();
  testApp.get('/ping', createRateLimiter(options), (_req, res) => {
    sendSuccess(res, 200, 'pong');
  });
  testApp.use(globalErrorHandler);
  return testApp;
};

const expectApiSuccess = (response: request.Response, status: number): void => {
  expect(response.status).toBe(status);
  expect(response.body.success).toBe(true);
};

const expectRateLimited = (response: request.Response): void => {
  expect(response.status).toBe(429);
  expect(response.body.success).toBe(false);
  expect(typeof response.body.message).toBe('string');
  expect(response.body.errors).toBeUndefined();
};

describe('Rate limiting', () => {
  // ================================================================
  // BASIC BEHAVIOR
  // ================================================================
  describe('Basic behavior', () => {
    it('lets every request through while under the limit', async () => {
      const testApp = buildLimitedApp({ windowMs: 60_000, max: 3, message: 'Too many requests.' });

      for (let i = 0; i < 3; i += 1) {
        const response = await request(testApp).get('/ping');
        expectApiSuccess(response, 200);
      }
    });

    it('returns 429 with the project\'s standard error envelope once the limit is exceeded', async () => {
      const testApp = buildLimitedApp({ windowMs: 60_000, max: 3, message: 'Too many requests. Please try again later.' });

      for (let i = 0; i < 3; i += 1) {
        await request(testApp).get('/ping');
      }

      const response = await request(testApp).get('/ping');
      expectRateLimited(response);
      expect(response.body.message).toBe('Too many requests. Please try again later.');
    });

    it('keeps rejecting further requests within the same window after the limit is hit', async () => {
      const testApp = buildLimitedApp({ windowMs: 60_000, max: 2, message: 'Too many requests.' });

      await request(testApp).get('/ping');
      await request(testApp).get('/ping');
      const first429 = await request(testApp).get('/ping');
      const second429 = await request(testApp).get('/ping');

      expectRateLimited(first429);
      expectRateLimited(second429);
    });
  });

  // ================================================================
  // HEADERS
  // ================================================================
  describe('RateLimit headers', () => {
    it('returns standard RateLimit-* headers and omits the legacy X-RateLimit-* headers', async () => {
      const testApp = buildLimitedApp({ windowMs: 60_000, max: 5, message: 'Too many requests.' });

      const response = await request(testApp).get('/ping');

      expect(response.headers['ratelimit-limit']).toBe('5');
      expect(response.headers['ratelimit-remaining']).toBeDefined();
      expect(response.headers['ratelimit-reset']).toBeDefined();
      expect(response.headers['x-ratelimit-limit']).toBeUndefined();
      expect(response.headers['x-ratelimit-remaining']).toBeUndefined();
    });

    it('decrements the remaining count on each successful request', async () => {
      const testApp = buildLimitedApp({ windowMs: 60_000, max: 5, message: 'Too many requests.' });

      const first = await request(testApp).get('/ping');
      const second = await request(testApp).get('/ping');

      expect(Number(first.headers['ratelimit-remaining'])).toBe(4);
      expect(Number(second.headers['ratelimit-remaining'])).toBe(3);
    });

    it('includes a Retry-After header on a 429 response', async () => {
      const testApp = buildLimitedApp({ windowMs: 60_000, max: 1, message: 'Too many requests.' });

      await request(testApp).get('/ping');
      const response = await request(testApp).get('/ping');

      expectRateLimited(response);
      expect(response.headers['retry-after']).toBeDefined();
    });
  });

  // ================================================================
  // RESET BEHAVIOR
  // ================================================================
  describe('Window reset', () => {
    it('allows requests again once the window elapses', async () => {
      const testApp = buildLimitedApp({ windowMs: 300, max: 2, message: 'Too many requests.' });

      await request(testApp).get('/ping');
      await request(testApp).get('/ping');
      const throttled = await request(testApp).get('/ping');
      expectRateLimited(throttled);

      await new Promise((resolve) => setTimeout(resolve, 400));

      const afterReset = await request(testApp).get('/ping');
      expectApiSuccess(afterReset, 200);
    });
  });

  // ================================================================
  // THE EXACT SPEC'D CONFIGURATIONS (5/window for auth, 100/window for general API)
  // ================================================================
  describe('Spec-exact configurations', () => {
    it('an auth-style limiter (max 5) allows exactly 5 requests then 429s on the 6th', async () => {
      const testApp = buildLimitedApp({
        windowMs: 60_000,
        max: 5,
        message: 'Too many authentication attempts. Please try again later.',
      });

      for (let i = 0; i < 5; i += 1) {
        const response = await request(testApp).get('/ping');
        expectApiSuccess(response, 200);
      }

      const sixth = await request(testApp).get('/ping');
      expectRateLimited(sixth);
      expect(sixth.body.message).toBe('Too many authentication attempts. Please try again later.');
    });

    it('a general-API-style limiter (max 100) allows exactly 100 requests then 429s on the 101st', async () => {
      const testApp = buildLimitedApp({ windowMs: 60_000, max: 100, message: 'Too many requests. Please try again later.' });

      for (let i = 0; i < 100; i += 1) {
        const response = await request(testApp).get('/ping');
        expect(response.status).toBe(200);
      }

      const overLimit = await request(testApp).get('/ping');
      expectRateLimited(overLimit);
    }, 30_000);
  });

  // ================================================================
  // REAL APP WIRING
  // ================================================================
  describe('Wired into the real app', () => {
    it('GET /health is never rate-limited and carries no RateLimit headers', async () => {
      let lastResponse: request.Response | undefined;
      for (let i = 0; i < 20; i += 1) {
        lastResponse = await request(app).get('/health');
        expect(lastResponse.status).toBe(200);
      }

      expect(lastResponse?.headers['ratelimit-limit']).toBeUndefined();
    });

    it('normal /api traffic still succeeds in the automated test environment (rate limiting skipped for NODE_ENV=test)', async () => {
      const response = await request(app).get('/api/categories');
      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('POST /api/auth/register still succeeds normally (auth limiter mounted but skipped for NODE_ENV=test)', async () => {
      const response = await request(app).post('/api/auth/register').send({
        firstName: 'Rate',
        lastName: 'Limit',
        email: `rate-limit-${Date.now()}@panelscan.test`,
        password: 'Passw0rd123',
      });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
    });
  });
});
