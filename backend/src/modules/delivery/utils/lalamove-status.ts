/**
 * Maps Lalamove's own order-status vocabulary (stored verbatim in
 * Delivery.deliveryStatus - see providers/lalamove.provider.ts) to the
 * customer-facing labels from the feature spec, and groups statuses for the
 * admin dashboard's active/completed/cancelled tabs.
 *
 * The raw value is never discarded - only the display layer translates it -
 * so an unrecognized or future status from Lalamove still shows something
 * honest ("Provider status: X") instead of silently misleading the customer.
 */
import { LALAMOVE_ORDER_STATUSES } from '../delivery.domain.js';

const DISPLAY_LABELS: Record<string, string> = {
  NOT_REQUESTED: 'Not requested',
  NOT_SCHEDULED: 'Not scheduled',
  PREPARING: 'Preparing delivery',
  // PanelScan's own pre-booking steps (see delivery.service.ts): the
  // moderator picked a vehicle, a booking call is in flight, or it failed.
  VEHICLE_SELECTED: 'Vehicle selected',
  BOOKING: 'Booking in progress',
  BOOKING_FAILED: 'Booking failed',
  ASSIGNING_DRIVER: 'Booked',
  ON_GOING: 'Driver assigned',
  PICKED_UP: 'In transit',
  COMPLETED: 'Delivered',
  CANCELED: 'Cancelled',
  CANCELLED: 'Cancelled', // tolerate either spelling defensively
  REJECTED: 'Delivery request rejected',
  EXPIRED: 'Delivery request expired',
};

export function getDeliveryStatusLabel(rawStatus: string | null | undefined): string {
  if (!rawStatus) return 'Not requested';
  return DISPLAY_LABELS[rawStatus.toUpperCase()] ?? `Provider status: ${rawStatus}`;
}

export const ACTIVE_DELIVERY_STATUSES = ['PREPARING', 'ASSIGNING_DRIVER', 'ON_GOING', 'PICKED_UP'];
export const COMPLETED_DELIVERY_STATUSES = ['COMPLETED'];
export const CANCELLED_DELIVERY_STATUSES = ['CANCELED', 'CANCELLED', 'REJECTED', 'EXPIRED'];

/** Before a real Lalamove order exists. */
export const PRE_BOOKING_DELIVERY_STATUSES = ['NOT_REQUESTED', 'NOT_SCHEDULED', 'VEHICLE_SELECTED', 'BOOKING', 'BOOKING_FAILED'];

export type DeliveryStateGroup = 'active' | 'completed' | 'cancelled' | 'not_started';

/** The deliveryStatus values belonging to one admin-dashboard group - directly usable in a Prisma `deliveryStatus: { in: [...] }` filter. */
export function deliveryStatusesForGroup(group: DeliveryStateGroup): string[] {
  if (group === 'active') return ACTIVE_DELIVERY_STATUSES;
  if (group === 'completed') return COMPLETED_DELIVERY_STATUSES;
  if (group === 'cancelled') return CANCELLED_DELIVERY_STATUSES;
  return PRE_BOOKING_DELIVERY_STATUSES;
}

export function getDeliveryStateGroup(rawStatus: string | null | undefined): DeliveryStateGroup {
  const status = (rawStatus ?? '').toUpperCase();
  if (ACTIVE_DELIVERY_STATUSES.includes(status)) return 'active';
  if (COMPLETED_DELIVERY_STATUSES.includes(status)) return 'completed';
  if (CANCELLED_DELIVERY_STATUSES.includes(status)) return 'cancelled';
  return 'not_started'; // PRE_BOOKING_DELIVERY_STATUSES / anything before a real Lalamove order exists
}

export { LALAMOVE_ORDER_STATUSES };
