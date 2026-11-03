import { formatEnumLabel } from "@/admin/admin-format"
import { statusBadgeClassName } from "@/components/admin/status-badge-style"
import { cn } from "@/lib/utils"

export function StatusBadge({ status, label, className }: { status: string; label?: string; className?: string }) {
  return (
    <span className={cn(statusBadgeClassName(status), className)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
      {label ?? formatEnumLabel(status)}
    </span>
  )
}
