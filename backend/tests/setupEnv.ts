import os from 'os';
import path from 'path';

/**
 * Runs BEFORE tests/setup.ts (see vitest.config.ts), and deliberately imports
 * nothing from src/: setup.ts loads config/env.ts, which reads UPLOAD_DIR once
 * at import, so this has to be set first or it is too late.
 *
 * It points every test at a throwaway uploads folder, unconditionally. Without
 * it, any test that exercises file storage would write into the real
 * backend/uploads directory - which holds the live product images.
 */
process.env.UPLOAD_DIR = path.join(os.tmpdir(), `panelscan-test-uploads-${process.pid}`);

/**
 * Pins vars that .env.test deliberately leaves unset, BEFORE Prisma Client
 * is ever imported anywhere in the test process. `@prisma/client` has its
 * own internal dotenv loading (independent of anything in src/config/env.ts)
 * that runs the moment it's first required/imported, and - like any dotenv
 * call - only fills a var that ISN'T already present in process.env. Without
 * this, the first Prisma import (from tests/setup.ts or any test's db
 * helpers, all of which run after this file) would silently backfill these
 * from the real backend/.env, exactly as happened once already with a real
 * MAPBOX_ACCESS_TOKEN leaking into and being used by an unmocked test. `''`
 * is falsy, so env.ts's `if (!env.MAPBOX_ACCESS_TOKEN)` "not configured"
 * check still behaves exactly as if the var were unset.
 */
for (const key of ['MAPBOX_ACCESS_TOKEN', 'GOOGLE_MAPS_API_KEY']) {
  if (!(key in process.env)) process.env[key] = '';
}
