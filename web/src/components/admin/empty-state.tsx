import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import { AlertCircle } from "lucide-react"

import { Button } from "@/components/ui/button"

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description: string
  action?: ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card px-6 py-14 text-center">
      {Icon && <Icon className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />}
      <h3 className="mt-4 text-sm font-semibold">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-muted-foreground">{description}</p>
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-lg border border-[color-mix(in_oklch,var(--status-critical),transparent_75%)] bg-[var(--status-critical-surface)] px-6 py-10 text-center">
      <AlertCircle className="mx-auto size-6 text-[var(--status-critical)]" aria-hidden="true" />
      <h3 className="mt-3 text-sm font-semibold">This view could not be loaded</h3>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-6 text-muted-foreground">{message}</p>
      {onRetry && <Button variant="outline" size="sm" className="mt-5" onClick={onRetry}>Try again</Button>}
    </div>
  )
}
