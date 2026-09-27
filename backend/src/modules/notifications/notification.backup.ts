/**
 * Real-time mirroring of Notification rows to the Supabase backup database.
 * Built on the same syncRecordToBackup()/upsert-by-id mechanism as every
 * other real-time backup sync (utils/backupSync.ts), so a re-sync of the
 * same notification can never create a duplicate backup row.
 *
 * Failure contract (identical to backupSync.ts): the main-database write
 * has already committed and is never rolled back; a failure is logged as a
 * BACKUP_SYNC_FAILED ActivityLog row and the periodic `npm run backup:sync`
 * batch job - which already includes the `notification` table - is the retry
 * mechanism. A failed notification sync deliberately does NOT raise a
 * "backup sync failed" staff notification: that notification would itself
 * need syncing to the same unavailable backup, so it could only loop.
 */
import type { Notification } from '@prisma/client';

import { getBackupPrisma } from '../../config/backupDatabase';
import { prisma } from '../../config/database';
import { ActivityAction, buildActivityLogData } from '../../utils/activityLog';
import { syncRecordToBackup } from '../../utils/backupSync';

const NO_REQUEST_CONTEXT = { ipAddress: null, userAgent: null };

// A notification created inside a caller's $transaction is not visible to
// other connections until that transaction commits, and this module can't
// know when that happens. Rows are re-read from the main database after a
// short delay instead; a row that still isn't there after the last attempt
// was either rolled back (nothing to sync) or will be caught by the batch job.
const DEFERRED_RETRY_DELAYS_MS: readonly number[] = [300, 1500, 5000];
const retryDelay = (attempt: number): number => DEFERRED_RETRY_DELAYS_MS[attempt] ?? 5000;

const pendingAttempts = new Map<string, number>();
let flushTimer: NodeJS.Timeout | null = null;

const isBackupConfigured = (): boolean => getBackupPrisma() !== null;

const recordFailure = async (notificationId: string, reason: string): Promise<void> => {
  try {
    await prisma.activityLog.create({
      data: buildActivityLogData(null, ActivityAction.BACKUP_SYNC_FAILED, NO_REQUEST_CONTEXT, { model: 'notification', id: notificationId, reason }),
    });
  } catch (error) {
    console.error('[notifications] Could not record a notification backup-sync failure:', error);
  }
};

/** Mirrors one committed notification row. Never throws. Silently a no-op when no backup database is configured. */
export const mirrorNotificationToBackup = async (notification: Notification): Promise<void> => {
  if (!isBackupConfigured()) return;
  const synced = await syncRecordToBackup('notification', notification as unknown as Record<string, unknown>);
  if (!synced) await recordFailure(notification.id, 'notification upsert');
};

const scheduleFlush = (delayMs: number): void => {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushPending();
  }, delayMs);
  // Never keep a process (a test run, a script) alive just for a best-effort backup sync.
  flushTimer.unref?.();
};

const flushPending = async (): Promise<void> => {
  const ids = [...pendingAttempts.keys()];
  if (ids.length === 0) return;

  const committed = await prisma.notification.findMany({ where: { id: { in: ids } } }).catch(() => [] as Notification[]);
  const committedIds = new Set(committed.map((row) => row.id));

  await Promise.all(committed.map((row) => mirrorNotificationToBackup(row)));
  for (const id of committedIds) pendingAttempts.delete(id);

  let nextDelay: number | null = null;
  for (const id of ids) {
    if (committedIds.has(id)) continue;
    const attempts = (pendingAttempts.get(id) ?? 0) + 1;
    if (attempts >= DEFERRED_RETRY_DELAYS_MS.length) {
      pendingAttempts.delete(id);
      continue;
    }
    pendingAttempts.set(id, attempts);
    nextDelay = Math.min(nextDelay ?? Infinity, retryDelay(attempts));
  }

  if (nextDelay !== null) scheduleFlush(nextDelay);
};

/** For notifications written inside a still-open transaction: mirrors them once the transaction has committed. */
export const queueNotificationBackup = (notificationId: string): void => {
  if (!isBackupConfigured()) return;
  if (!pendingAttempts.has(notificationId)) pendingAttempts.set(notificationId, 0);
  scheduleFlush(retryDelay(0));
};

/** Mirrors "mark all as read" as one statement rather than one upsert per row. Rows not in the backup yet are created, already read, by the next batch sync. */
export const mirrorMarkAllReadToBackup = async (userId: string): Promise<void> => {
  const backupPrisma = getBackupPrisma();
  if (!backupPrisma) return;
  try {
    await backupPrisma.$executeRawUnsafe('UPDATE notifications SET is_read = true WHERE user_id = $1::uuid AND is_read = false', userId);
  } catch (error) {
    console.error(`[backup-sync] Mark-all-read mirror failed for user=${userId}: ${(error as Error).message}`);
    await recordFailure(userId, 'notification mark-all-read');
  }
};

/** Deletes are mirrored too - the batch job only upserts, so without this a deleted notification would live on in the backup forever. */
export const mirrorNotificationDeleteToBackup = async (notificationId: string): Promise<void> => {
  const backupPrisma = getBackupPrisma();
  if (!backupPrisma) return;
  try {
    await backupPrisma.$executeRawUnsafe('DELETE FROM notifications WHERE id = $1::uuid', notificationId);
  } catch (error) {
    console.error(`[backup-sync] Delete mirror failed for notification id=${notificationId}: ${(error as Error).message}`);
    await recordFailure(notificationId, 'notification delete');
  }
};
