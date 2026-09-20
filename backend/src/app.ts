import path from 'path';
import compression from 'compression';
import cors from 'cors';
import express, { type Application, type Request, type Response } from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';

import { env } from './config/env';
import { checkBackupHealth, checkPrimaryHealth } from './config/database';
import { globalErrorHandler } from './middleware/error.middleware';
import { notFound } from './middleware/notFound.middleware';
import { apiRateLimiter } from './middleware/rateLimit.middleware';
import routes from './routes';

const app: Application = express();

// Trust the reverse proxy every common host runs this app behind (Vercel,
// Render, Railway, Fly.io, Heroku, nginx on a VPS), so req.ip and the
// X-Forwarded-* headers `cors`/`express-rate-limit`/`morgan` rely on reflect
// the real client instead of the proxy. See TRUST_PROXY in config/env.ts.
const trustProxySetting: string | boolean | number =
  env.TRUST_PROXY === 'true' ? true : env.TRUST_PROXY === 'false' ? false : /^\d+$/.test(env.TRUST_PROXY) ? Number(env.TRUST_PROXY) : env.TRUST_PROXY;
app.set('trust proxy', trustProxySetting);

// Security & parsing middleware
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
// Gzips JSON/text responses; already-compressed formats (images, etc.) are
// skipped automatically via the default `compressible` mime check. Works
// identically on every Node host (Vercel, Render, Railway, VPS, Docker) -
// no platform-specific CDN compression required.
app.use(compression());
app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'));

// Serve persisted uploaded files (product images, etc.) with client caching
const uploadsDirectory = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME)
  ? path.join('/tmp', 'uploads')
  : path.resolve(process.cwd(), env.UPLOAD_DIR);

app.use(
  '/uploads',
  express.static(uploadsDirectory, {
    maxAge: '7d',
    immutable: true,
  }),
);

// PayMongo webhook signature verification needs the exact raw request body,
// so this one route gets raw-body parsing registered BEFORE the global JSON
// parser below (Express applies app.use() middleware in registration order,
// scoped to matching paths) - every other route is unaffected.
app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// Health check
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Monitoring only - reports connectivity of both the production database
// (CockroachDB) and the backup/disaster-recovery database (Supabase). Does
// NOT switch which database the application uses; that remains CockroachDB
// unconditionally (see DATABASE_URL / src/config/database.ts).
app.get('/health/backup-status', async (_req: Request, res: Response) => {
  const [primary, backup] = await Promise.all([checkPrimaryHealth(), checkBackupHealth()]);
  res.status(200).json({
    timestamp: new Date().toISOString(),
    cockroachdb: primary,
    supabaseBackup: backup,
  });
});

// API routes - rate limiter scoped to /api so /health above is never throttled.
app.use('/api', apiRateLimiter, routes);

// 404 + global error handling (must be registered last)
app.use(notFound);
app.use(globalErrorHandler);

export default app;
