/**
 * Maps Delivery.deliveryStatus to the labels customers and staff see, and
 * groups statuses for the admin dashboard's filters.
 *
 * deliveryStatus carries the whole delivery lifecycle in one column:
 * PanelScan's own order-driven stages until a real Lalamove order exists
 * (see ORDER_WORKFLOW_STATUSES), then Lalamove's own order-status vocabulary
 * stored verbatim (see providers/lalamove.provider.ts).
 *
 * The raw value is never discarded - only the display layer translates it -
 * so an unrecognized or future status from Lalamove still shows something
 * honest ("Provider status: X") instead of silently misleading the customer.
 */
import { LALAMOVE_ORDER_STATUSES } from '../delivery.domain.js';

/**
 * PanelScan's stages before Lalamove is booked, driven by the order itself:
 *   order placed -> approved -> shipping quoted -> paid (products + shipping)
 * The delivery record is created with the order, so the customer never
 * requests delivery separately.
 */
export const ORDER_WORKFLOW_STATUSES = {
  AWAITING_ORDER_APPROVAL: 'AWAITING_ORDER_APPROVAL',
  AWAITING_QUOTE: 'AWAITING_QUOTE',
  AWAITING_PAYMENT: 'AWAITING_PAYMENT',
  READY_TO_BOOK: 'READY_TO_BOOK',
} as const;

const DISPLAY_LABELS: Record<string, string> = {
  AWAITING_ORDER_APPROVAL: 'Waiting for approval',
  AWAITING_QUOTE: 'Awaiting shipping quote',
  AWAITING_PAYMENT: 'Awaiting customer payment',
  READY_TO_BOOK: 'Ready to book',
  // Records from before delivery became part of the order.
  NOT_REQUESTED: 'Not requested',
  NOT_SCHEDULED: 'Not scheduled',
  PREPARING: 'Preparing delivery',
  VEHICLE_SELECTED: 'Vehicle selected',
  // A booking call is in flight, or the last attempt failed.
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

/** Paid and waiting for the moderator to book Lalamove (including an in-flight or failed attempt). */
export const TO_BOOK_DELIVERY_STATUSES = [ORDER_WORKFLOW_STATUSES.READY_TO_BOOK, 'BOOKING', 'BOOKING_FAILED'];

/** Before a real Lalamove order exists. */
export const PRE_BOOKING_DELIVERY_STATUSES = [
  ORDER_WORKFLOW_STATUSES.AWAITING_ORDER_APPROVAL,
  ORDER_WORKFLOW_STATUSES.AWAITING_QUOTE,
  ORDER_WORKFLOW_STATUSES.AWAITING_PAYMENT,
  ...TO_BOOK_DELIVERY_STATUSES,
  'NOT_REQUESTED',
  'NOT_SCHEDULED',
  'VEHICLE_SELECTED',
];

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
