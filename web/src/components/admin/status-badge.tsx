import { formatEnumLabel } from "@/admin/admin-format"
import { cn } from "@/lib/utils"

/**
 * One status vocabulary for the whole Admin. Every backend enum maps to a tone
 * here, so an order, a project, a request, and a stock level never invent their
 * own colour language. Tone is always paired with the label text.
 */
export type StatusTone = "positive" | "warning" | "critical" | "info" | "neutral"

const toneStyles: Record<StatusTone, string> = {
  positive: "border-[color-mix(in_oklch,var(--status-positive),transparent_72%)] bg-[var(--status-positive-surface)] text-[var(--status-positive)]",
  warning: "border-[color-mix(in_oklch,var(--status-warning),transparent_72%)] bg-[var(--status-warning-surface)] text-[var(--status-warning)]",
  critical: "border-[color-mix(in_oklch,var(--status-critical),transparent_72%)] bg-[var(--status-critical-surface)] text-[var(--status-critical)]",
  info: "border-[color-mix(in_oklch,var(--status-info),transparent_72%)] bg-[var(--status-info-surface)] text-[var(--status-info)]",
  neutral: "border-[color-mix(in_oklch,var(--status-neutral),transparent_78%)] bg-[var(--status-neutral-surface)] text-[var(--status-neutral)]",
}

const statusTones: Record<string, StatusTone> = {
  PENDING: "warning",
  PROCESSING: "info",
  SHIPPED: "info",
  DELIVERED: "positive",
  CANCELLED: "critical",
  PAID: "positive",
  FAILED: "critical",
  REFUNDED: "neutral",
  IN_PROGRESS: "info",
  MEASURED: "neutral",
  ESTIMATED: "info",
  READY_FOR_REVIEW: "warning",
  COMPLETED: "positive",
  APPROVED: "positive",
  SCHEDULED: "info",
  REJECTED: "critical",
  HEALTHY: "positive",
  LOW_STOCK: "warning",
  OUT_OF_STOCK: "critical",
  ACTIVE: "positive",
  INACTIVE: "neutral",
  // Live Lalamove delivery statuses (Delivery.deliveryStatus) - see
  // backend/src/modules/delivery/utils/lalamove-status.ts, the source of truth
  // this mirrors.
  NOT_SCHEDULED: "neutral",
  PREPARING: "warning",
  ASSIGNING_DRIVER: "warning",
  ON_GOING: "info",
  PICKED_UP: "info",
  CANCELED: "critical",
  EXPIRED: "critical",
}

export function StatusBadge({ status, label, className }: { status: string; label?: string; className?: string }) {
  const tone = statusTones[status] ?? "neutral"
  return (
    <span className={cn("inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap", toneStyles[tone], className)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {label ?? formatEnumLabel(status)}
    </span>
  )
}
