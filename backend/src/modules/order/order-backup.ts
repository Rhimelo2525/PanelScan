import { prisma } from '../../config/database';
import { notifySystemIssue } from '../notifications/notification.triggers';
import { ActivityAction, buildActivityLogData } from '../../utils/activityLog';
import { syncRecordToBackup } from '../../utils/backupSync';

/**
 * Real-time backup mirror of one order's whole workflow state - the order
 * (subtotal, estimated shipping fee, total), its PayMongo payment (status,
 * reference, paid timestamp) and its delivery (status, vehicle, final fee,
 * Lalamove booking id, tracking) - after a main-database write has committed.
 *
 * Every step of the order/payment/delivery workflow calls this, so the
 * backup never holds a paid order next to a stale "awaiting payment"
 * delivery. Rows are written parent-first (customer, order, then the rows
 * that reference it) because the backup schema keeps the same foreign keys.
 * Upserts by id, so repeating it never duplicates a row. Never throws: a
 * failure is logged (BACKUP_SYNC_FAILED) and left for the next
 * `npm run backup:sync`, which is this system's retry mechanism.
 */
export async function mirrorOrderToBackup(orderId: string, actorId: string | null, reason: string): Promise<void> {
  try {
    const row = await prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true, payment: true, delivery: { include: { deliveryPayment: true } } },
    });
    if (!row) return;
    const { customer, payment, delivery: deliveryRow, ...order } = row;

    const records: [model: string, record: object | null][] = [['user', customer], ['order', order], ['payment', payment]];
    if (deliveryRow) {
      const { deliveryPayment, ...delivery } = deliveryRow;
      records.push(['delivery', delivery], ['deliveryPayment', deliveryPayment]);
    }

    const failedModels: string[] = [];
    for (const [model, record] of records) {
      if (record && !(await syncRecordToBackup(model, record as unknown as Record<string, unknown>))) failedModels.push(model);
    }
    if (failedModels.length === 0) return;

    await prisma.activityLog.create({
      data: buildActivityLogData(actorId, ActivityAction.BACKUP_SYNC_FAILED, { ipAddress: null, userAgent: null }, { model: failedModels.join(','), id: orderId, reason }),
    });
    await notifySystemIssue({
      title: 'Backup sync failed',
      message: 'An order could not be synchronized to the backup database. It will be retried by the next scheduled backup sync.',
      event: 'BACKUP_SYNC_FAILED',
      metadata: { model: 'order', id: orderId },
    });
  } catch (error) {
    console.error(`[backup-sync] Backup mirror of order ${orderId} failed:`, error);
  }
}
