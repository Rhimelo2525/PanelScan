import { AlertCircle, Info } from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { Link } from "react-router-dom"

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
  /** The admin page behind this figure; the whole card becomes a link to it. */
  to?: string
  /** "large": a bigger label and figure, for a page's headline numbers. */
  size?: "default" | "large"
  className?: string
}

export function MetricCard({ label, value, hint, icon: Icon, isLoading, restricted, unavailable, to, size = "default", className }: MetricCardProps) {
  const isLarge = size === "large"
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className={cn("font-medium text-muted-foreground", isLarge ? "text-sm" : "text-xs")}>{label}</p>
        {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
      </div>
      {isLoading ? (
        <Skeleton className={cn("mt-3", isLarge ? "h-9 w-36" : "h-7 w-24")} />
      ) : restricted ? (
        <p className="mt-3 flex items-start gap-1.5 text-sm leading-5 text-muted-foreground"><Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />Not available for your role</p>
      ) : unavailable ? (
        <p className="mt-3 flex items-start gap-1.5 text-sm leading-5 text-[var(--status-critical)]"><AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />Could not be loaded</p>
      ) : (
        <p className={cn("font-semibold tracking-[-0.02em] tabular-nums", isLarge ? "mt-3 text-3xl leading-none sm:text-[2.125rem]" : "mt-2.5 text-2xl")}>{value ?? "—"}</p>
      )}
      {hint && !isLoading && !restricted && !unavailable && <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>}
    </>
  )
  if (to) {
    return (
      <Link to={to} className={cn("surface-card block p-4", isLarge && "p-5", "transition-colors hover:border-primary/40 hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none", className)}>
        {body}
      </Link>
    )
  }
  return <div className={cn("surface-card p-4", isLarge && "p-5", className)}>{body}</div>
}
