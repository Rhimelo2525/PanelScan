import { CheckCircle2, ExternalLink, Loader2, RefreshCw, Truck } from "lucide-react"
import { useState, type ReactNode } from "react"
import { toast } from "sonner"

import { ApiRequestError } from "@/api/client"
import { refreshDeliveryStatus } from "@/api/delivery"
import { StatusBadge } from "@/components/admin/status-badge"
import { Button } from "@/components/ui/button"
import { deliveryVehicleName } from "@/lib/delivery/vehicle-label"
import { formatProductPrice } from "@/lib/format-price"
import { getOrderStage, isShippingQuoted } from "@/orders/order-workflow"
import type { DeliveryRecord } from "@/types/delivery"
import type { Order } from "@/types/order"
import type { PaymentListItem } from "@/types/payment"

/**
 * The customer's "Delivery coordination" card. Delivery is part of the
 * order - there is nothing for the customer to request, choose or pay here.
 * The card follows the order: approval, the delivery fee being calculated,
 * payment, then PanelScan staff choosing the Lalamove vehicle and booking
 * it. Once booked it shows the vehicle, the shipping fee, the booking id,
 * the live status and Lalamove's own tracking link.
 */

interface OrderDeliveryPanelProps {
  order: Order
  /** The order payment (products + shipping) - delivery is booked only once it is PAID. */
  payment: PaymentListItem | null
  onDeliveryUpdated: (delivery: DeliveryRecord) => void
}

const IN_PROGRESS_STATUSES = new Set(["ASSIGNING_DRIVER", "ON_GOING", "PICKED_UP"])

export function OrderDeliveryPanel({ order, payment, onDeliveryUpdated }: OrderDeliveryPanelProps) {
  const delivery = order.delivery

  // Booked with Lalamove: vehicle, fee, live status and tracking.
  if (delivery?.lalamoveOrderId) {
    return <BookedDeliveryCard delivery={delivery} order={order} onDeliveryUpdated={onDeliveryUpdated} />
  }

  const stage = getOrderStage(order, payment)

  if (stage === "cancelled" || delivery?.deliveryStatus === "CANCELED") {
    return (
      <DeliveryCard badge={<StatusBadge status="CANCELLED" label="Cancelled" />}>
        <p className="font-medium text-sm text-foreground">Delivery cancelled.</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">This order is cancelled, so it will not be delivered.</p>
      </DeliveryCard>
    )
  }

  if (stage === "awaiting_approval") {
    return (
      <DeliveryCard badge={<StatusBadge status="PENDING" label="Waiting for approval" />}>
        <p className="font-medium text-sm text-foreground">Waiting for order approval.</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">Your delivery is arranged automatically once PanelScan approves your order - there is nothing you need to request.</p>
        <StatusLine label="Waiting for approval" />
      </DeliveryCard>
    )
  }

  if (stage === "awaiting_quote") {
    return (
      <DeliveryCard badge={<StatusBadge status="PENDING" label="Calculating fee" />}>
        <p className="font-medium text-sm text-foreground">Order approved.</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">We are calculating your delivery fee. Payment will be available once the estimated shipping fee is ready.</p>
        <StatusLine label="Awaiting shipping quote" />
      </DeliveryCard>
    )
  }

  if (stage === "awaiting_payment") {
    return (
      <DeliveryCard badge={<StatusBadge status="PENDING" label="Awaiting payment" />}>
        <p className="font-medium text-sm text-foreground">Your delivery fee is ready.</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">Pay your order total, which includes the {formatProductPrice(order.shippingFee)} estimated shipping fee, to continue. Our team books your delivery once your payment is confirmed.</p>
        <StatusLine label="Awaiting payment" />
      </DeliveryCard>
    )
  }

  // Paid, not booked yet: staff choose the vehicle and book Lalamove.
  return (
    <DeliveryCard badge={<StatusBadge status="PREPARING" label="Preparing delivery" />}>
      <p className="font-medium text-sm text-foreground">Payment confirmed.</p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        {delivery?.deliveryStatus === "BOOKING" ? "Our team is booking your delivery now." : "Our team is preparing your delivery and will book it shortly."}
      </p>
      <StatusLine label="Preparing delivery" />
    </DeliveryCard>
  )
}

function DeliveryCard({ badge, children }: { badge?: ReactNode; children: ReactNode }) {
  return (
    <section className="surface-card p-6" aria-labelledby="delivery-coordination-title">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Truck className="size-4 text-primary" aria-hidden="true" />
          <h2 id="delivery-coordination-title" className="font-semibold">Delivery coordination</h2>
        </div>
        {badge}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function StatusLine({ label }: { label: string }) {
  return (
    <dl className="mt-4 text-sm">
      <dt className="text-xs font-semibold uppercase text-muted-foreground">Status</dt>
      <dd className="mt-1 font-medium text-foreground">{label}</dd>
    </dl>
  )
}

// ---------------------------------------------------------------------------
// Booked with Lalamove
// ---------------------------------------------------------------------------

function bookedHeadline(status: string | null): { title: string; statusLabel: string } {
  switch (status) {
    case "ON_GOING":
      return { title: "Delivery booked. A driver has been assigned.", statusLabel: "Driver assigned" }
    case "PICKED_UP":
      return { title: "Your delivery is on the way.", statusLabel: "In transit" }
    case "COMPLETED":
      return { title: "Delivery completed.", statusLabel: "Delivered" }
    case "CANCELED":
    case "CANCELLED":
      return { title: "This delivery booking was cancelled.", statusLabel: "Cancelled" }
    case "REJECTED":
    case "EXPIRED":
      return { title: "Lalamove could not complete this booking. PanelScan staff will follow up.", statusLabel: status === "EXPIRED" ? "Expired" : "Rejected" }
    default:
      return { title: "Delivery booked.", statusLabel: "Booked" }
  }
}

function BookedDeliveryCard({ delivery, order, onDeliveryUpdated }: { delivery: DeliveryRecord; order: Order; onDeliveryUpdated: (delivery: DeliveryRecord) => void }) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const status = delivery.deliveryStatus
  const { title, statusLabel } = bookedHeadline(status)
  const meta = delivery.providerMetadata
  const vehicle = deliveryVehicleName(delivery)
  const isCompleted = status === "COMPLETED"
  const isInProgress = IN_PROGRESS_STATUSES.has(status ?? "")
  // The customer sees the shipping fee they paid with their order. Orders
  // paid before shipping was part of the order total show Lalamove's fee.
  const shippingFee = isShippingQuoted(order) ? order.shippingFee : delivery.shippingFee

  async function handleRefresh() {
    setIsRefreshing(true)
    try {
      const response = await refreshDeliveryStatus(delivery.id)
      onDeliveryUpdated(response.delivery)
    } catch (err) {
      toast.error("Could not refresh delivery status", { description: getDeliveryErrorMessage(err, "Please try again shortly.") })
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <DeliveryCard badge={<StatusBadge status={status ?? "ASSIGNING_DRIVER"} label={statusLabel} />}>
      <p className="font-medium text-sm text-foreground">{title}</p>
      <dl className="mt-4 space-y-3 text-sm">
        {vehicle && <Detail label="Vehicle">{vehicle}{meta?.driverPlateNumber && !isCompleted ? ` · ${meta.driverPlateNumber}` : ""}</Detail>}
        {shippingFee != null && <Detail label="Shipping fee"><span className="font-medium">{formatProductPrice(shippingFee)}</span></Detail>}
        <Detail label="Booking ID"><span className="font-mono">{delivery.lalamoveOrderId}</span></Detail>
        <Detail label="Status">{statusLabel}</Detail>
        {meta?.driverName && !isCompleted && <Detail label="Driver">{meta.driverName}{meta.driverPhone ? ` · ${meta.driverPhone}` : ""}</Detail>}
      </dl>

      {isCompleted && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-primary/10 p-3 text-xs text-primary">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
          <span>Delivered for order {order.orderNumber}.</span>
        </div>
      )}

      {(isInProgress || isCompleted) && (
        <div className="mt-5 border-t border-border pt-5">
          {delivery.trackingUrl ? (
            <Button className="w-full" variant={isCompleted ? "outline" : "default"} asChild>
              <a href={delivery.trackingUrl} target="_blank" rel="noopener noreferrer">
                Track delivery
                <ExternalLink data-icon="inline-end" aria-hidden="true" />
              </a>
            </Button>
          ) : (
            <p className="text-xs leading-5 text-muted-foreground">Delivery booked. Tracking information will be available shortly.</p>
          )}
          {isInProgress && (
            <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => void handleRefresh()} disabled={isRefreshing}>
              {isRefreshing ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw data-icon="inline-start" aria-hidden="true" />}
              {isRefreshing ? "Refreshing…" : "Refresh status"}
            </Button>
          )}
        </div>
      )}
    </DeliveryCard>
  )
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm text-foreground">{children}</dd>
    </div>
  )
}

function getDeliveryErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiRequestError && error.message) return error.message
  return fallback
}
