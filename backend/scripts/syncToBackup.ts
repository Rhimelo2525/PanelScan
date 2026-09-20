/**
 * One-way backup sync: CockroachDB (production) -> Supabase (backup/DR copy).
 *
 * READS from the primary database only. WRITES to the Supabase backup
 * database only. Never the reverse - this script must never be pointed at
 * production as a write target. Safe to re-run repeatedly (upserts by id),
 * and a failure on one table does not abort the rest of the run.
 *
 * Usage:
 *   npm run backup:sync
 *
 * Requires BACKUP_DATABASE_URL to be set (see .env.example) and the backup
 * Prisma client to have been generated at least once:
 *   npm run prisma:backup:generate
 */
import { prisma } from '../src/config/database';
import { getBackupPrisma } from '../src/config/backupDatabase';

// Dependency order matters: a row can only be inserted into the backup
// database after any row it has a foreign key to already exists there.
// This mirrors the parent-before-child ordering already used in
// prisma/schema.prisma.
const SYNC_ORDER = [
  'user',
  'category',
  'product',
  'productImage',
  'inventory',
  'cart',
  'cartItem',
  'order',
  'orderItem',
  'payment',
  'delivery',
  'installer',
  'booking',
  'measurement',
  'feedback',
  'chatRoom',
  'chatParticipant',
  'message',
  'notification',
  'project',
  'request',
  'refreshToken',
] as const;

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

interface TableReport {
  table: string;
  recordsRead: number;
  recordsWritten: number;
  failed: number;
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SKIPPED';
  error?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const upsertWithRetry = async (
  backupDelegate: Record<string, (...args: unknown[]) => unknown>,
  row: Record<string, unknown>,
): Promise<boolean> => {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await backupDelegate.upsert({
        where: { id: row.id },
        create: row,
        update: row,
      });
      return true;
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        console.error(`  [FAILED] id=${row.id as string}: ${(err as Error).message}`);
        return false;
      }
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }
  return false;
};

const syncTable = async (
  modelName: string,
  primaryClient: Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>,
  backupClient: Record<string, Record<string, (...args: unknown[]) => unknown>>,
): Promise<TableReport> => {
  const primaryDelegate = primaryClient[modelName];
  const backupDelegate = backupClient[modelName];

  try {
    const rows = (await primaryDelegate.findMany({})) as Record<string, unknown>[];
    let written = 0;
    let failed = 0;

    for (const row of rows) {
      const ok = await upsertWithRetry(backupDelegate, row);
      if (ok) written++;
      else failed++;
    }

    const status: TableReport['status'] = failed === 0 ? 'SUCCESS' : written === 0 ? 'FAILED' : 'PARTIAL';

    return { table: modelName, recordsRead: rows.length, recordsWritten: written, failed, status };
  } catch (err) {
    return {
      table: modelName,
      recordsRead: 0,
      recordsWritten: 0,
      failed: 0,
      status: 'FAILED',
      error: (err as Error).message,
    };
  }
};

const main = async () => {
  const startedAt = new Date();
  console.log(`\n[backup-sync] Started at ${startedAt.toISOString()}`);
  console.log('[backup-sync] Direction: CockroachDB (read-only) -> Supabase (write target)');

  const backupPrisma = getBackupPrisma();
  if (!backupPrisma) {
    console.error('[backup-sync] BACKUP_DATABASE_URL is not configured (or the backup Prisma client has not been generated).');
    console.error('[backup-sync] Run "npm run prisma:backup:generate" and set BACKUP_DATABASE_URL in .env first. Aborting - no changes made.');
    process.exitCode = 1;
    return;
  }

  const primaryClient = prisma as unknown as Record<string, Record<string, (...args: unknown[]) => Promise<unknown>>>;
  const backupClient = backupPrisma as unknown as Record<string, Record<string, (...args: unknown[]) => unknown>>;

  const reports: TableReport[] = [];

  for (const modelName of SYNC_ORDER) {
    process.stdout.write(`[backup-sync] Syncing ${modelName}... `);
    const report = await syncTable(modelName, primaryClient, backupClient);
    reports.push(report);
    console.log(`${report.status} (${report.recordsWritten}/${report.recordsRead} written${report.failed ? `, ${report.failed} failed` : ''})`);
  }

  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();
  const totalRecords = reports.reduce((sum, r) => sum + r.recordsWritten, 0);
  const totalFailed = reports.reduce((sum, r) => sum + r.failed, 0);
  const overallStatus = reports.some((r) => r.status === 'FAILED')
    ? 'FAILED'
    : reports.some((r) => r.status === 'PARTIAL')
      ? 'PARTIAL'
      : 'SUCCESS';

  console.log('\n========== BACKUP SYNC REPORT ==========');
  console.log(`Timestamp:      ${finishedAt.toISOString()}`);
  console.log(`Duration:       ${(durationMs / 1000).toFixed(1)}s`);
  console.log(`Tables synced:  ${reports.length}`);
  console.log(`Records copied: ${totalRecords}`);
  console.log(`Records failed: ${totalFailed}`);
  console.log(`Overall status: ${overallStatus}`);
  console.log('-----------------------------------------');
  for (const r of reports) {
    console.log(`  ${r.table.padEnd(18)} ${r.status.padEnd(8)} ${r.recordsWritten}/${r.recordsRead}${r.error ? `  ERROR: ${r.error}` : ''}`);
  }
  console.log('==========================================\n');

  await prisma.$disconnect();
  await backupPrisma.$disconnect();

  if (overallStatus === 'FAILED') process.exitCode = 1;
};

main().catch(async (err) => {
  console.error('[backup-sync] Unexpected fatal error:', err);
  await prisma.$disconnect();
  process.exitCode = 1;
});
