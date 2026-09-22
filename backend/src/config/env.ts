import dotenv from 'dotenv';
import { z } from 'zod';

// During tests, `dotenv -e .env.test -- vitest run` (see package.json) has
// already fully populated process.env from .env.test before this file ever
// runs. Loading the real .env here too would silently fill in any var that
// happens to be ABSENT from .env.test with its real production value
// (dotenv.config() never overrides an already-set var, only fills gaps) -
// exactly what happened when a real MAPBOX_ACCESS_TOKEN leaked into a test
// run this way and made a live, unmocked API call. Skipping it under test
// means .env.test is the complete, sole source of truth there, by design.
if (process.env.NODE_ENV !== 'test') {
  dotenv.config();
}

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

  // Transactional email (backend/src/utils/mailer.ts) - the one-time codes
  // sent for email verification and password recovery. Entirely optional at
  // startup so the backend boots without SMTP credentials: outside
  // production the code is printed to the server console instead, and in
  // production the send fails with a 503 until SMTP_HOST is configured.
  // Works with any SMTP account (Gmail app password, Brevo, SES, Mailtrap...).
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  // "true" = implicit TLS (normally port 465). Leave "false" for STARTTLS on 587.
  SMTP_SECURE: z
    .enum(['true', 'false'])
    .default('false')
    .transform((value) => value === 'true'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().min(1).default('PanelScan <no-reply@panelscan.local>'),

  // Rate limiting (backend/src/middleware/rateLimit.middleware.ts). Two
  // buckets: a strict one for POST /api/auth/register + POST
  // /api/auth/login (brute-force protection), and a looser one for every
  // other /api/* route. Both are optional with production-appropriate
  // defaults, so a fresh checkout works without any extra config.
  RATE_LIMIT_AUTH_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_AUTH_MAX: z.coerce.number().int().positive().default(5),
  RATE_LIMIT_API_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_API_MAX: z.coerce.number().int().positive().default(100),
  // Account-security bucket: change password, email verification and the
  // three password-recovery endpoints. Kept apart from the 5-attempt login
  // bucket above because recovery is a multi-request flow (request a code,
  // check it, reset) that a single typo would otherwise lock out.
  RATE_LIMIT_ACCOUNT_SECURITY_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_ACCOUNT_SECURITY_MAX: z.coerce.number().int().positive().default(10),
  // Profile picture upload/remove. Each upload costs real CPU (a full image
  // decode and re-encode), so it gets its own modest bucket.
  RATE_LIMIT_UPLOAD_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_UPLOAD_MAX: z.coerce.number().int().positive().default(20),

  // Lalamove (Delivery module, src/modules/delivery). Optional at the process
  // level, like PAYMONGO_* above - the server boots without them, but every
  // delivery.service.ts method that calls the provider checks for them itself
  // and fails only that one request (503) until they're configured.
  LALAMOVE_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  LALAMOVE_API_KEY: z.string().optional(),
  LALAMOVE_API_SECRET: z.string().optional(),
  // A long random token embedded in the webhook URL itself
  // (POST /api/delivery/webhook/:token) - see lalamove.provider.ts for why:
  // Lalamove's webhook *signature* scheme isn't in their public API docs, so
  // this is the disclosed, standard fallback (a GitHub-style secret-URL
  // webhook) rather than a guessed-and-possibly-wrong HMAC check.
  LALAMOVE_WEBHOOK_TOKEN: z.string().optional(),

  // PanelScan warehouse / pickup point (src/modules/delivery/providers/lalamove.config.ts).
  // Deliberately has NO fallback defaults, unlike most config above: a wrong
  // or placeholder pickup address/coordinates would send a real Lalamove
  // driver to a real wrong location. Every field must be explicitly set
  // before a quotation/booking is attempted; delivery.service.ts checks for
  // all of them together and refuses with a clear error otherwise.
  PANELSCAN_WAREHOUSE_NAME: z.string().optional(),
  PANELSCAN_WAREHOUSE_PHONE: z.string().optional(),
  PANELSCAN_WAREHOUSE_ADDRESS: z.string().optional(),
  PANELSCAN_WAREHOUSE_BARANGAY: z.string().optional(),
  PANELSCAN_WAREHOUSE_CITY: z.string().optional(),
  PANELSCAN_WAREHOUSE_PROVINCE: z.string().optional(),
  PANELSCAN_WAREHOUSE_POSTAL: z.string().optional(),
  // Real GPS coordinates of the warehouse - never a city/barangay centroid.
  PANELSCAN_WAREHOUSE_LAT: z.coerce.number().min(-90).max(90).optional(),
  PANELSCAN_WAREHOUSE_LNG: z.coerce.number().min(-180).max(180).optional(),

  // Google Maps Geocoding API - kept defined but currently unused (see
  // MAPBOX_ACCESS_TOKEN below); left here in case of a future switch back,
  // never read by geocoding.service.ts while that's the case.
  GOOGLE_MAPS_API_KEY: z.string().optional(),

  // Mapbox Geocoding API v6 (src/modules/delivery/services/geocoding.service.ts) -
  // turns a customer's typed delivery address into real coordinates for
  // Lalamove. Optional: unset behaves exactly as before (coordinates stay
  // null, geocodingStatus "pending"), so checkout and existing tests are
  // unaffected until a token is configured.
  MAPBOX_ACCESS_TOKEN: z.string().optional(),
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
