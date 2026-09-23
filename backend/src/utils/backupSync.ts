/**
 * Shared upsert-with-retry logic against the Supabase backup database - used
 * by both the periodic full-table batch job (scripts/syncToBackup.ts) and
 * real-time single-record syncs triggered from request handlers (currently:
 * a customer's confirmed delivery-location pin, and a moderator's manual
 * coordinate fix - see order.service.ts and delivery.service.ts). One
 * implementation so the two never drift apart.
 */
import { getBackupPrisma } from '../config/backupDatabase';

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 500;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Upserts one row into one backup-database model delegate, retrying
 * transient failures up to MAX_RETRIES times. Never throws - returns false
 * (after logging) once every attempt has failed, so a backup outage never
 * takes down whatever main-database write triggered the sync.
 */
export async function upsertBackupRow(backupDelegate: Record<string, (...args: unknown[]) => unknown>, row: Record<string, unknown>): Promise<boolean> {
  const upsert = backupDelegate.upsert;
  if (typeof upsert !== 'function') {
    console.error(`[backup-sync] Backup delegate has no upsert method (id=${row.id as string}).`);
    return false;
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await upsert({ where: { id: row.id }, create: row, update: row });
      return true;
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        console.error(`[backup-sync] Upsert failed for id=${row.id as string}: ${(err as Error).message}`);
        return false;
      }
      await sleep(RETRY_DELAY_MS * attempt);
    }
  }
  return false;
}

/**
 * Real-time, single-record sync to the backup database, for data this app
 * wants the backup to reflect immediately rather than waiting for the next
 * scheduled/manual `npm run backup:sync` full-table run.
 *
 * Sequencing contract for callers: only call this AFTER the corresponding
 * write to the MAIN database has already committed successfully. On
 * failure here, do NOT roll back or fail the main write - log it (callers
 * write a BACKUP_SYNC_FAILED ActivityLog row) and let the row be picked up
 * from CockroachDB, correctly, next time the batch job runs. That existing
 * batch job is this system's retry mechanism - there is no separate queue.
 *
 * `row` must be the FULL flat scalar row for `modelName` (no relations,
 * matching exactly what a plain `findUnique`/`findMany` without `include`
 * returns) - an upsert against a backup row that doesn't exist yet needs
 * every required column for its `create` branch.
 */
export async function syncRecordToBackup(modelName: string, row: Record<string, unknown>): Promise<boolean> {
  const backupPrisma = getBackupPrisma();
  if (!backupPrisma) {
    console.warn(`[backup-sync] Skipped real-time sync of ${modelName} id=${row.id as string} - BACKUP_DATABASE_URL is not configured.`);
    return false;
  }

  const backupDelegate = (backupPrisma as unknown as Record<string, Record<string, (...args: unknown[]) => unknown>>)[modelName];
  if (!backupDelegate) {
    console.error(`[backup-sync] No backup model named "${modelName}".`);
    return false;
  }

  return upsertBackupRow(backupDelegate, row);
}
