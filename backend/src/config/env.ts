import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required.'),

  // Supabase PostgreSQL backup/disaster-recovery database (see
  // prisma/schema.backup.prisma and scripts/syncToBackup.ts). Entirely
  // optional - the app boots and runs fine with these unset, since
  // CockroachDB (DATABASE_URL above) remains the only database the
  // running application reads/writes. These are only consulted by the
  // backup Prisma client and the one-way sync job.
  BACKUP_DATABASE_URL: z.string().optional(),
  BACKUP_DIRECT_URL: z.string().optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters long.'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  CORS_ORIGIN: z.string().default('*'),

  // Every common Node host (Vercel, Render, Railway, Fly.io, Heroku, or a
  // VPS behind nginx) puts the app behind a reverse proxy that sets
  // X-Forwarded-For, so Express needs `trust proxy` configured or it reads
  // the proxy's own IP for every request - collapsing every client into one
  // express-rate-limit bucket. "1" (trust one hop) is correct for that
  // single-proxy-layer default; set to "false" for a directly-exposed
  // process with no proxy in front, or to a specific number/IP list for a
  // more layered topology. See app.ts.
  TRUST_PROXY: z.string().default('1'),

  // Local disk directory (relative to process.cwd(), or absolute) that
  // uploaded product images are written to and served from (see app.ts's
  // /uploads static route and upload.routes.ts). Configurable so a host
  // that mounts a persistent volume at a different path - or a container
  // image with a different working directory - doesn't need a code change.
  UPLOAD_DIR: z.string().default('uploads'),

  // Refresh Token Authentication (backend/src/modules/auth). Governs how
  // long an issued refresh token stays valid before it must be re-obtained
  // via a fresh login. Access tokens (JWT_EXPIRES_IN above) are unrelated
  // and unchanged by this - refresh tokens exist so a client can silently
  // obtain a new access token without forcing the user to log in again.
  REFRESH_TOKEN_EXPIRES_IN_DAYS: z.coerce.number().int().positive().default(7),

  // PayMongo (Payment module). Optional at the process level - unlike
  // DATABASE_URL/JWT_SECRET, no other module depends on these, so a missing
  // key shouldn't block the whole server from booting. payment.service.ts
  // checks for PAYMONGO_SECRET_KEY itself and fails only the payment
  // creation request (500) if it's absent.
  PAYMONGO_SECRET_KEY: z.string().optional(),
  PAYMONGO_WEBHOOK_SECRET: z.string().optional(),
  PAYMONGO_API_URL: z.string().url().default('https://api.paymongo.com/v1'),
  PAYMENT_SUCCESS_URL: z.string().url().default('http://localhost:3000/payment/success'),
  PAYMENT_CANCEL_URL: z.string().url().default('http://localhost:3000/payment/cancel'),

  // Google OAuth 2.0 (Customer Authentication).
  // Optional at process startup so the backend boots even before credentials
  // are configured in development or testing. Routes under /api/auth/google
  // check for their presence and return a friendly error (503) if missing.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),

  // Rate limiting (backend/src/middleware/rateLimit.middleware.ts). Two
  // buckets: a strict one for POST /api/auth/register + POST
  // /api/auth/login (brute-force protection), and a looser one for every
  // other /api/* route. Both are optional with production-appropriate
  // defaults, so a fresh checkout works without any extra config.
  RATE_LIMIT_AUTH_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_API_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_API_MAX: z.coerce.number().int().positive().default(100),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('\n❌ Invalid or missing environment variables:');
  for (const issue of parsedEnv.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsedEnv.data;
export type Env = typeof env;
