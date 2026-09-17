import { AlertCircle, Info } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

interface MetricCardProps {
  label: string
  value: string | number | null | undefined
  hint?: string
  icon?: LucideIcon
  isLoading?: boolean
  /**
   * Set when the backend deliberately omits this figure for the signed-in role.
   * A restricted metric renders as "Not available for your role" - never as 0,
   * which would read as a real business number.
   */
  restricted?: boolean
  /**
   * Set when the read for this figure failed. A failed request must never render
   * as 0 - that is a real business number, and showing it would misreport the
   * business rather than report a fault.
   */
  unavailable?: boolean
  className?: string
}

export function MetricCard({ label, value, hint, icon: Icon, isLoading, restricted, unavailable, className }: MetricCardProps) {
  return (
    <div className={cn("surface-card p-4", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
      </div>
      {isLoading ? (
        <Skeleton className="mt-3 h-7 w-24" />
      ) : restricted ? (
        <p className="mt-3 flex items-start gap-1.5 text-sm leading-5 text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />Not available for your role</p>
      ) : unavailable ? (
        <p className="mt-3 flex items-start gap-1.5 text-sm leading-5 text-[var(--status-critical)]"><AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />Could not be loaded</p>
      ) : (
        <p className="mt-2.5 text-2xl font-semibold tracking-[-0.02em] tabular-nums">{value ?? "—"}</p>
      )}
      {hint && !isLoading && !restricted && !unavailable && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  )
}
