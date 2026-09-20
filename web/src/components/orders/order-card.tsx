import { ArrowRight, Package } from "lucide-react"
import { Link } from "react-router-dom"

import { OrderStatusBadge } from "@/components/orders/order-status-badge"
import { Button } from "@/components/ui/button"
import { formatProductPrice } from "@/lib/format-price"
import { formatOrderDate } from "@/orders/order-format"
import type { Order } from "@/types/order"

export function OrderCard({ order }: { order: Order }) {
  const itemCount = order.items.reduce((total, item) => total + item.quantity, 0)
  return (
    <article className="surface-card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">{order.orderNumber}</p><p className="mt-2 text-sm text-muted-foreground">{formatOrderDate(order.createdAt)}</p></div>
        <OrderStatusBadge status={order.status} />
      </div>
      <div className="mt-6 flex flex-wrap items-end justify-between gap-5 border-t border-border pt-5">
        <div className="flex items-center gap-3"><div className="flex size-10 items-center justify-center bg-secondary"><Package className="size-4 text-primary" aria-hidden="true" /></div><div><p className="text-xs text-muted-foreground">Items</p><p className="font-semibold">{itemCount}</p></div></div>
        <div className="text-right"><p className="text-xs text-muted-foreground">Order total</p><p className="mt-1 text-xl font-semibold tabular-nums">{formatProductPrice(order.totalAmount)}</p></div>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button variant="outline" className="w-full sm:w-auto" asChild>
          <Link to={`/orders/${order.id}`}>View order <ArrowRight data-icon="inline-end" aria-hidden="true" /></Link>
        </Button>
        {order.status === "DELIVERED" && (
          <Button
            variant={order.feedback ? "outline" : "default"}
            className="w-full sm:w-auto"
            asChild
          >
            <Link to={`/orders/${order.id}#feedback`}>
              {order.feedback ? "View Feedback" : "Leave Feedback"}
            </Link>
          </Button>
        )}
      </div>
    </article>
  )
}
