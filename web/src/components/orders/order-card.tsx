import { ArrowRight, Package, Truck } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"

import { OrderStatusBadge } from "@/components/orders/order-status-badge"
import { Button } from "@/components/ui/button"
import { formatProductPrice } from "@/lib/format-price"
import { getDeliveryStatusLabel } from "@/lib/delivery/status-label"
import { formatOrderDate } from "@/orders/order-format"
import { isShippingQuoted } from "@/orders/order-workflow"
import type { Order, OrderItem } from "@/types/order"

// Longer orders show the first few lines; the rest are one click away.
const VISIBLE_ITEMS = 3

/**
 * One order in the customer's order list: a header (order number, date,
 * delivery progress, status), a row per product line with its picture, and
 * a footer with the amount and the actions for this order's stage.
 */
export function OrderCard({ order }: { order: Order }) {
  // Until PanelScan quotes the delivery fee, the amount is the products only - never shown as the order total.
  const awaitingFee = !isShippingQuoted(order) && (order.delivery?.deliveryStatus === "AWAITING_ORDER_APPROVAL" || order.delivery?.deliveryStatus === "AWAITING_QUOTE")
  const visibleItems = order.items.slice(0, VISIBLE_ITEMS)
  const hiddenCount = order.items.length - visibleItems.length
  const deliveryStatus = order.status !== "CANCELLED" ? order.delivery?.deliveryStatus : undefined
  const canLeaveFeedback = order.status === "DELIVERED" && !order.feedback

  return (
    <article className="surface-card overflow-hidden" aria-labelledby={`order-${order.id}-number`}>
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-5 py-3.5 sm:px-6">
        <div className="min-w-0">
          <p id={`order-${order.id}-number`} className="text-xs font-semibold tracking-[0.1em] uppercase">{order.orderNumber}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{formatOrderDate(order.createdAt)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {deliveryStatus && (
            <span className="flex items-center gap-1.5 border-r border-border pr-3 text-xs text-muted-foreground">
              <Truck className="size-3.5 text-primary" aria-hidden="true" />
              {getDeliveryStatusLabel(deliveryStatus)}
            </span>
          )}
          <OrderStatusBadge status={order.status} />
        </div>
      </header>

      <ul className="divide-y divide-border px-5 sm:px-6" aria-label="Items in this order">
        {visibleItems.map((item) => (
          <li key={item.id} className="flex items-center gap-4 py-4">
            <ItemThumbnail item={item} />
            <div className="min-w-0 flex-1">
              <p className="font-medium leading-6 break-words">{item.productName}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">x{item.quantity}</p>
            </div>
            <p className="shrink-0 text-right text-sm font-medium tabular-nums">{formatProductPrice(item.lineTotal)}</p>
          </li>
        ))}
        {hiddenCount > 0 && (
          <li className="py-3 text-center">
            <Link to={`/orders/${order.id}`} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              +{hiddenCount} more item{hiddenCount === 1 ? "" : "s"}
            </Link>
          </li>
        )}
      </ul>

      <footer className="border-t border-border bg-secondary/35 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-baseline justify-end gap-2">
          <span className="text-sm text-muted-foreground">{awaitingFee ? "Subtotal:" : "Order total:"}</span>
          <span className="text-2xl font-semibold text-primary tabular-nums">{formatProductPrice(awaitingFee ? order.subtotal : order.totalAmount)}</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs leading-5 text-muted-foreground">
            {awaitingFee
              ? "The delivery fee is added once PanelScan approves your order."
              : canLeaveFeedback
                ? "Your order has arrived. Tell us how it went."
                : null}
          </p>
          <div className="flex w-full flex-wrap justify-end gap-2 sm:w-auto">
            {order.status === "DELIVERED" && (
              <Button variant={canLeaveFeedback ? "default" : "outline"} className="flex-1 sm:flex-none" asChild>
                <Link to={`/orders/${order.id}#feedback`}>{canLeaveFeedback ? "Leave Feedback" : "View Feedback"}</Link>
              </Button>
            )}
            <Button variant="outline" className="flex-1 sm:flex-none" asChild>
              <Link to={`/orders/${order.id}`}>View order <ArrowRight data-icon="inline-end" aria-hidden="true" /></Link>
            </Button>
          </div>
        </div>
      </footer>
    </article>
  )
}

/** The product's picture, or a neutral package tile when it has none (or it fails to load). */
function ItemThumbnail({ item }: { item: OrderItem }) {
  const image = item.product?.images[0]
  const [failed, setFailed] = useState(false)

  if (!image || failed) {
    return (
      <div className="flex size-16 shrink-0 items-center justify-center rounded-md border border-border bg-secondary" aria-hidden="true">
        <Package className="size-5 text-primary" />
      </div>
    )
  }
  return (
    <img
      src={image.url}
      alt={image.altText?.trim() || item.productName}
      className="size-16 shrink-0 rounded-md border border-border bg-muted object-cover"
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}
