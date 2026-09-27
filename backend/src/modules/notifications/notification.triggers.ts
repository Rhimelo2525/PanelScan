/**
 * Cross-module notification triggers that go to more than one recipient -
 * staff fan-out, system alerts, and inventory threshold alerts. Single-user
 * notifications keep calling createNotification() directly, as before.
 *
 * Every helper here is best-effort and never throws: callers invoke them
 * AFTER their own main-database write has committed, so a notification
 * problem must never turn an already-successful action into an error
 * response. (Customer notifications that must be atomic with the action
 * itself still go through createNotification() inside the transaction.)
 */
import { NotificationType, Prisma, UserRole } from '@prisma/client';

import { prisma } from '../../config/database';
import { createNotification } from './notification.service';
import type { CreateNotificationParams } from './notification.types';

type StaffRole = typeof UserRole.MODERATOR | typeof UserRole.OWNER;

const STAFF_ROLES: StaffRole[] = [UserRole.MODERATOR, UserRole.OWNER];

/** How long an identical system alert is suppressed after it was last sent, so a provider outage raises one alert rather than one per failed request. */
const SYSTEM_ALERT_DEDUPE_WINDOW_MS = 30 * 60 * 1000;

export interface StaffNotificationParams {
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Prisma.InputJsonValue;
  /** Defaults to every active MODERATOR and OWNER. */
  roles?: StaffRole[];
  /** Role-specific wording, e.g. "New order received" for moderators vs "New order placed" for the owner. */
  byRole?: Partial<Record<StaffRole, { title?: string; message?: string }>>;
  excludeUserIds?: string[];
}

const logFailure = (context: string, error: unknown): void => {
  console.error(`[notifications] ${context}:`, error);
};

/** Fans one notification out to every active staff member in `roles`. */
export const notifyStaff = async (params: StaffNotificationParams): Promise<void> => {
  try {
    const staff = await prisma.user.findMany({
      where: {
        role: { in: params.roles ?? STAFF_ROLES },
        isActive: true,
        ...(params.excludeUserIds?.length ? { id: { notIn: params.excludeUserIds } } : {}),
      },
      select: { id: true, role: true },
    });

    await Promise.all(
      staff.map((member) => {
        const override = params.byRole?.[member.role as StaffRole];
        return createNotification({
          userId: member.id,
          type: params.type,
          title: override?.title ?? params.title,
          message: override?.message ?? params.message,
          metadata: params.metadata,
        });
      }),
    );
  } catch (error) {
    logFailure(`Staff notification "${params.title}" failed`, error);
  }
};

/**
 * SYSTEM alert to staff (backup-sync failures, delivery/payment provider
 * errors). Suppressed when the same title+message already went out within
 * the dedupe window.
 */
export const notifySystemIssue = async (params: { title: string; message: string; event: string; metadata?: Prisma.JsonObject }): Promise<void> => {
  try {
    const recent = await prisma.notification.findFirst({
      where: {
        type: NotificationType.SYSTEM,
        title: params.title,
        message: params.message,
        createdAt: { gte: new Date(Date.now() - SYSTEM_ALERT_DEDUPE_WINDOW_MS) },
      },
      select: { id: true },
    });
    if (recent) return;

    await notifyStaff({
      type: NotificationType.SYSTEM,
      title: params.title,
      message: params.message,
      metadata: { ...params.metadata, event: params.event },
    });
  } catch (error) {
    logFailure(`System alert "${params.title}" failed`, error);
  }
};

/** A single user's notification about something that has already happened (e.g. an account change) - best-effort, never throws. */
export const notifyUser = async (params: CreateNotificationParams): Promise<void> => {
  try {
    await createNotification(params);
  } catch (error) {
    logFailure(`Notification "${params.title}" for user ${params.userId} failed`, error);
  }
};

/** Owner-only "New customer" alert for a freshly created CUSTOMER account. */
export const notifyOwnersOfNewCustomer = async (customer: { id: string; firstName: string; lastName: string; email: string }, via: 'email' | 'google'): Promise<void> => {
  await notifyStaff({
    type: NotificationType.SYSTEM,
    title: 'New customer',
    message: `${`${customer.firstName} ${customer.lastName}`.trim()} (${customer.email}) created a customer account${via === 'google' ? ' with Google' : ''}.`,
    metadata: { userId: customer.id, event: 'CUSTOMER_REGISTERED' },
    roles: [UserRole.OWNER],
  });
};

/** Short, staff-safe description of a caught provider error. */
export const describeError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  return message.length > 160 ? `${message.slice(0, 157)}...` : message;
};

export interface StockChange {
  productId: string;
  previousQuantity: number;
}

/**
 * Compares a product's current on-hand quantity with what it was before a
 * change and raises alerts only when a threshold is actually CROSSED, so
 * repeated sales of an already-low product don't re-alert every time:
 *  - above reorder level -> at/below it (still > 0): staff "Low stock alert"
 *  - above 0 -> 0: staff "Out of stock"
 *  - 0 -> above 0: "Back in stock" to customers who have it in their cart
 * Uses on-hand `quantity` against `reorderLevel`, the same rule as the
 * inventory module's low-stock report.
 */
export const notifyStockLevelChange = async ({ productId, previousQuantity }: StockChange): Promise<void> => {
  try {
    const inventory = await prisma.inventory.findUnique({
      where: { productId },
      include: { product: { select: { name: true, sku: true, deletedAt: true, isActive: true } } },
    });
    if (!inventory || inventory.product.deletedAt) return;

    const { quantity, reorderLevel, product } = inventory;
    const metadata = { productId, quantity, reorderLevel };

    if (quantity <= 0 && previousQuantity > 0) {
      await notifyStaff({
        type: NotificationType.SYSTEM,
        title: 'Out of stock',
        message: `${product.name} (${product.sku}) is now out of stock.`,
        metadata: { ...metadata, event: 'OUT_OF_STOCK' },
      });
    } else if (quantity > 0 && quantity <= reorderLevel && previousQuantity > reorderLevel) {
      await notifyStaff({
        type: NotificationType.SYSTEM,
        title: 'Low stock alert',
        message: `${product.name} (${product.sku}) is down to ${quantity} in stock (reorder level ${reorderLevel}).`,
        metadata: { ...metadata, event: 'LOW_STOCK' },
      });
    }

    if (previousQuantity <= 0 && quantity > 0 && product.isActive) {
      const carts = await prisma.cart.findMany({ where: { items: { some: { productId } } }, select: { customerId: true } });
      await Promise.all(
        carts.map((cart) =>
          createNotification({
            userId: cart.customerId,
            type: NotificationType.SYSTEM,
            title: 'Back in stock',
            message: `${product.name} from your cart is back in stock.`,
            metadata: { productId, event: 'PRODUCT_BACK_IN_STOCK' },
          }),
        ),
      );
    }
  } catch (error) {
    logFailure(`Stock-level notification for product ${productId} failed`, error);
  }
};

export const notifyStockLevelChanges = async (changes: StockChange[]): Promise<void> => {
  for (const change of changes) {
    await notifyStockLevelChange(change);
  }
};
