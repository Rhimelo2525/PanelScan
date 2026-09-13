import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { formatOrderStatus } from "@/orders/order-format"
import type { OrderStatus } from "@/types/order"

const statusClasses: Record<OrderStatus, string> = {
  PENDING: "border-amber-700/25 bg-amber-100/65 text-amber-900",
  PROCESSING: "border-sky-700/25 bg-sky-100/65 text-sky-900",
  SHIPPED: "border-indigo-700/25 bg-indigo-100/65 text-indigo-900",
  DELIVERED: "border-emerald-700/25 bg-emerald-100/65 text-emerald-900",
  CANCELLED: "border-destructive/25 bg-destructive/8 text-destructive",
}

export function OrderStatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return <Badge variant="outline" className={cn(statusClasses[status], className)}>{formatOrderStatus(status)}</Badge>
}
