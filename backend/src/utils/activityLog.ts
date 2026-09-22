import type { Prisma } from '@prisma/client';
import type { Request } from 'express';

/** Stable action codes for the `activity_logs` table. Add new codes here so they stay greppable and typo-proof. */
export const ActivityAction = {
  PROFILE_PICTURE_UPDATED: 'PROFILE_PICTURE_UPDATED',
  PROFILE_PICTURE_REMOVED: 'PROFILE_PICTURE_REMOVED',

  // Lalamove delivery provider (src/modules/delivery). "_FAILED" suffixed
  // actions are what the admin "Failed API requests" view queries for
  // (action LIKE 'LALAMOVE_%_FAILED') - see delivery.service.ts.
  LALAMOVE_QUOTATION_REQUESTED: 'LALAMOVE_QUOTATION_REQUESTED',
  LALAMOVE_QUOTATION_FAILED: 'LALAMOVE_QUOTATION_FAILED',
  LALAMOVE_ORDER_PLACED: 'LALAMOVE_ORDER_PLACED',
  LALAMOVE_ORDER_PLACE_FAILED: 'LALAMOVE_ORDER_PLACE_FAILED',
  LALAMOVE_STATUS_REFRESHED: 'LALAMOVE_STATUS_REFRESHED',
  LALAMOVE_STATUS_REFRESH_FAILED: 'LALAMOVE_STATUS_REFRESH_FAILED',
  LALAMOVE_ORDER_CANCELLED: 'LALAMOVE_ORDER_CANCELLED',
  LALAMOVE_ORDER_CANCEL_FAILED: 'LALAMOVE_ORDER_CANCEL_FAILED',
  LALAMOVE_WEBHOOK_RECEIVED: 'LALAMOVE_WEBHOOK_RECEIVED',
  LALAMOVE_WEBHOOK_REJECTED: 'LALAMOVE_WEBHOOK_REJECTED',
  DELIVERY_COORDINATES_SET: 'DELIVERY_COORDINATES_SET',
} as const;

export type ActivityActionCode = (typeof ActivityAction)[keyof typeof ActivityAction];

export interface RequestAuditContext {
  ipAddress: string | null;
  userAgent: string | null;
}

const MAX_USER_AGENT_LENGTH = 255;

/**
 * Where a request came from. `req.ip` is the real client address because
 * app.ts sets `trust proxy` for the reverse proxy the app runs behind (see
 * TRUST_PROXY in config/env.ts) - without that it would be the proxy's own.
 */
export const getRequestAuditContext = (req: Request): RequestAuditContext => {
  const userAgent = req.get('user-agent');
  return {
    ipAddress: req.ip ?? null,
    userAgent: userAgent ? userAgent.slice(0, MAX_USER_AGENT_LENGTH) : null,
  };
};

/**
 * Builds the row for `prisma.activityLog.create({ data })` rather than writing
 * it, so a caller can put it in the SAME transaction as the change it records
 * and the trail can never disagree with what actually happened.
 */
export const buildActivityLogData = (
  userId: string | null,
  action: ActivityActionCode,
  context: RequestAuditContext,
  metadata?: Prisma.InputJsonValue,
): Prisma.ActivityLogUncheckedCreateInput => ({
  userId: userId ?? undefined,
  action,
  ipAddress: context.ipAddress,
  userAgent: context.userAgent,
  ...(metadata !== undefined ? { metadata } : {}),
});
