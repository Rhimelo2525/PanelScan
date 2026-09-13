import { CheckCircle2, Clock3, RotateCcw, XCircle } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { formatPaymentStatus } from "@/payments/payment-format"
import type { PaymentStatus } from "@/types/payment"

// Each status carries a label and an icon as well as colour, so payment state is
// never communicated by colour alone.
const statusClasses: Record<PaymentStatus, string> = {
  PENDING: "border-amber-700/25 bg-amber-100/65 text-amber-900",
  PAID: "border-emerald-700/25 bg-emerald-100/65 text-emerald-900",
  FAILED: "border-destructive/25 bg-destructive/8 text-destructive",
  REFUNDED: "border-slate-700/25 bg-slate-100/70 text-slate-900",
}

const statusIcons: Record<PaymentStatus, LucideIcon> = {
  PENDING: Clock3,
  PAID: CheckCircle2,
  FAILED: XCircle,
  REFUNDED: RotateCcw,
}

export function PaymentStatusBadge({ status, className }: { status: PaymentStatus; className?: string }) {
  const Icon = statusIcons[status]
  return (
    <Badge variant="outline" className={cn(statusClasses[status], className)}>
      <Icon className="size-3.5" aria-hidden="true" />
      Payment: {formatPaymentStatus(status)}
    </Badge>
  )
}
