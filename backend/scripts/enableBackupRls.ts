/**
 * Enables Row Level Security (RLS) with no policies (default-deny) on every
 * table in the Supabase backup database.
 *
 * Why: `prisma db push` creates tables with RLS OFF by default. This backup
 * project has Supabase's Data API (PostgREST) enabled, which means without
 * RLS, anyone holding the project's publishable/anon key could read or
 * write every row over the public REST endpoint - including password
 * hashes, refresh token hashes, and customer PII synced from production.
 *
 * This does NOT affect scripts/syncToBackup.ts or the health check: both
 * connect as the `postgres` role, which is the table owner and bypasses RLS
 * in Supabase by default. Enabling RLS here only blocks the `anon` /
 * `authenticated` roles PostgREST uses - nothing this codebase runs as.
 *
 * Re-run this after any `npm run prisma:backup:push` against a fresh
 * database, since `db push` does not preserve RLS state.
 *
 * Usage: npx tsx scripts/enableBackupRls.ts
 */
import { getBackupPrisma } from '../src/config/backupDatabase';

const TABLES = [
  'users',
  'categories',
  'products',
  'product_images',
  'inventory',
  'carts',
  'cart_items',
  'orders',
  'order_items',
  'payments',
  'deliveries',
  'installers',
  'bookings',
  'measurements',
  'feedbacks',
  'chat_rooms',
  'chat_participants',
  'messages',
  'notifications',
  'projects',
  'requests',
  'refresh_tokens',
];

const main = async () => {
  const backupPrisma = getBackupPrisma();
  if (!backupPrisma) {
    console.error('[enable-rls] BACKUP_DATABASE_URL is not configured. Aborting.');
    process.exitCode = 1;
    return;
  }

  console.log(`[enable-rls] Enabling RLS (default-deny, no policies) on ${TABLES.length} tables...`);

  for (const table of TABLES) {
    try {
      await backupPrisma.$executeRawUnsafe(`ALTER TABLE "public"."${table}" ENABLE ROW LEVEL SECURITY;`);
      console.log(`  [OK] ${table}`);
    } catch (err) {
      console.error(`  [FAILED] ${table}: ${(err as Error).message}`);
    }
  }

  console.log('[enable-rls] Done. anon/authenticated roles (PostgREST) are now denied by default.');
  console.log('[enable-rls] The postgres role (used by Prisma/this backend) is unaffected - it bypasses RLS as table owner.');

  await backupPrisma.$disconnect();
};

main().catch(async (err) => {
  console.error('[enable-rls] Unexpected fatal error:', err);
  process.exitCode = 1;
});
