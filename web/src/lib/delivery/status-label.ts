/**
 * Mirrors backend/src/modules/delivery/utils/lalamove-status.ts (the source
 * of truth) - customer-facing labels for Delivery.deliveryStatus. Kept in
 * sync by hand since the frontend can't import backend code; an unrecognized
 * value still shows something honest rather than a blank badge.
 */
const DISPLAY_LABELS: Record<string, string> = {
  NOT_REQUESTED: "Not requested",
  NOT_SCHEDULED: "Not scheduled",
  PREPARING: "Preparing delivery",
  ASSIGNING_DRIVER: "Searching for a driver",
  ON_GOING: "Driver on the way",
  PICKED_UP: "Picked up - on delivery",
  COMPLETED: "Delivered",
  CANCELED: "Cancelled",
  CANCELLED: "Cancelled",
  REJECTED: "Delivery request rejected",
  EXPIRED: "Delivery request expired",
}

export function getDeliveryStatusLabel(rawStatus: string | null | undefined): string {
  if (!rawStatus) return "Not requested"
  return DISPLAY_LABELS[rawStatus.toUpperCase()] ?? `Status: ${rawStatus}`
}

export type DeliveryStateGroup = "active" | "completed" | "cancelled" | "not_started"

const ACTIVE = new Set(["PREPARING", "ASSIGNING_DRIVER", "ON_GOING", "PICKED_UP"])
const COMPLETED = new Set(["COMPLETED"])
const CANCELLED = new Set(["CANCELED", "CANCELLED", "REJECTED", "EXPIRED"])

export function getDeliveryStateGroup(rawStatus: string | null | undefined): DeliveryStateGroup {
  const status = (rawStatus ?? "").toUpperCase()
  if (ACTIVE.has(status)) return "active"
  if (COMPLETED.has(status)) return "completed"
  if (CANCELLED.has(status)) return "cancelled"
  return "not_started"
}
