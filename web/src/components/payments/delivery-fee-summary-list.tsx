import { OrderStatusBadge } from "@/components/orders/order-status-badge"
import { Badge } from "@/components/ui/badge"
import { formatProductPrice } from "@/lib/format-price"
import { formatOrderDate } from "@/orders/order-format"
import { cn } from "@/lib/utils"
import type { DeliveryFeePayment } from "@/types/delivery"
import type { OrderStatus } from "@/types/order"

const statusClasses: Record<DeliveryFeePayment["status"], string> = {
  PENDING: "border-amber-700/25 bg-amber-100/65 text-amber-900",
  PAID: "border-emerald-700/25 bg-emerald-100/65 text-emerald-900",
  FAILED: "border-destructive/25 bg-destructive/8 text-destructive",
  REFUNDED: "border-slate-700/25 bg-slate-100/70 text-slate-900",
}

const statusLabels: Record<DeliveryFeePayment["status"], string> = {
  PENDING: "Awaiting payment",
  PAID: "Paid",
  FAILED: "Failed",
  REFUNDED: "Refunded",
}

/** Same shape as PaymentSummaryList, for the separate delivery-fee charge. Only the two order fields actually shown are required, not a full Order. */
export function DeliveryFeeSummaryList({ feePayment, order, orderNumber }: { feePayment: DeliveryFeePayment; order: { orderNumber: string; status: OrderStatus } | null; orderNumber: string }) {
  return (
    <dl className="mt-7 grid gap-4 border-t border-border/70 pt-6 text-sm sm:max-w-lg">
      <div className="flex flex-wrap items-center justify-between gap-2"><dt className="text-muted-foreground">Order</dt><dd className="font-medium">{order?.orderNumber ?? orderNumber}</dd></div>
      <div className="flex flex-wrap items-center justify-between gap-2"><dt className="text-muted-foreground">Delivery fee</dt><dd className="font-semibold tabular-nums">{formatProductPrice(feePayment.amount)}</dd></div>
      <div className="flex flex-wrap items-center justify-between gap-2"><dt className="text-muted-foreground">Payment status</dt><dd><Badge variant="outline" className={cn(statusClasses[feePayment.status])}>{statusLabels[feePayment.status]}</Badge></dd></div>
      {order && <div className="flex flex-wrap items-center justify-between gap-2"><dt className="text-muted-foreground">Order status</dt><dd><OrderStatusBadge status={order.status} /></dd></div>}
      {feePayment.paidAt && <div className="flex flex-wrap items-center justify-between gap-2"><dt className="text-muted-foreground">Paid</dt><dd>{formatOrderDate(feePayment.paidAt)}</dd></div>}
    </dl>
  )
}
