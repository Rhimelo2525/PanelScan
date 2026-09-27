import { Banknote, CheckCircle2, ExternalLink, Loader2, RefreshCw, Smartphone, Truck } from "lucide-react"
import { useState, type ReactNode } from "react"
import { toast } from "sonner"

import { ApiRequestError } from "@/api/client"
import { getDeliveryById, refreshDeliveryStatus, requestDelivery, selectDeliveryFeeCash } from "@/api/delivery"
import { StatusBadge } from "@/components/admin/status-badge"
import { Button } from "@/components/ui/button"
import { deliveryVehicleName } from "@/lib/delivery/vehicle-label"
import { formatProductPrice } from "@/lib/format-price"
import { useStartDeliveryFeePayment } from "@/payments/use-start-delivery-fee-payment"
import type { DeliveryRecord } from "@/types/delivery"
import type { Order } from "@/types/order"
import type { PaymentListItem } from "@/types/payment"

/**
 * The customer's "Delivery coordination" card. The customer only requests
 * delivery (once the order is approved and the product is paid) and then
 * waits: PanelScan staff approve the request, choose the Lalamove vehicle
 * and book it. Once booked, the card shows the vehicle, the fee Lalamove
 * charged, the live status and Lalamove's own tracking link. Every gate
 * here is also enforced by the backend (see delivery.routes.ts).
 */

interface OrderDeliveryPanelProps {
  order: Order
  /** The product payment - delivery can only be requested once it is PAID. */
  payment: PaymentListItem | null
  onDeliveryUpdated: (delivery: DeliveryRecord) => void
}

const IN_PROGRESS_STATUSES = new Set(["ASSIGNING_DRIVER", "ON_GOING", "PICKED_UP"])

export function OrderDeliveryPanel({ order, payment, onDeliveryUpdated }: OrderDeliveryPanelProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const delivery = order.delivery
  const approvalStatus = delivery?.approvalStatus ?? "NOT_REQUESTED"
  const canRequest = order.status !== "CANCELLED" && order.moderatorApproved && payment?.status === "PAID"

  async function handleRequest() {
    setIsSubmitting(true)
    try {
      const response = await requestDelivery(order.id)
      onDeliveryUpdated(response.delivery)
      toast.success("Delivery request submitted", { description: "Waiting for PanelScan staff to approve your delivery request." })
    } catch (err) {
      toast.error("Could not request delivery", { description: getDeliveryErrorMessage(err, "Failed to submit delivery request.") })
    } finally {
      setIsSubmitting(false)
    }
  }

  const requestButton = (label: string, variant: "default" | "outline" = "default") => (
    <div className="mt-6 border-t border-border pt-5">
      <Button className="w-full" variant={variant} onClick={() => void handleRequest()} disabled={isSubmitting || !canRequest}>
        {isSubmitting ? <><Loader2 className="animate-spin" aria-hidden="true" />Submitting request...</> : label}
      </Button>
    </div>
  )

  // Booked with Lalamove: fee, live status and tracking.
  if (delivery?.lalamoveOrderId) {
    return <BookedDeliveryCard delivery={delivery} order={order} onDeliveryUpdated={onDeliveryUpdated} />
  }

  if (approvalStatus === "PENDING_APPROVAL") {
    return (
      <DeliveryCard badge={<StatusBadge status="PENDING" label="Pending approval" />}>
        <p className="font-medium text-sm text-foreground">Delivery request submitted.</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">Waiting for PanelScan staff to approve your delivery request.</p>
        <StatusLine label="Pending approval" />
      </DeliveryCard>
    )
  }

  if (approvalStatus === "APPROVED") {
    const status = delivery?.deliveryStatus
    if (status === "BOOKING") {
      return (
        <DeliveryCard badge={<StatusBadge status="BOOKING" label="Booking" />}>
          <p className="font-medium text-sm text-foreground">Delivery request approved.</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Delivery booking is being processed.</p>
          <StatusLine label="Booking in progress" />
        </DeliveryCard>
      )
    }
    if (status === "BOOKING_FAILED") {
      return (
        <DeliveryCard badge={<StatusBadge status="PREPARING" label="Preparing delivery" />}>
          <p className="font-medium text-sm text-foreground">Delivery request approved.</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Delivery booking could not be completed. PanelScan staff will retry.</p>
          <StatusLine label="Preparing delivery" />
        </DeliveryCard>
      )
    }
    return (
      <DeliveryCard badge={<StatusBadge status="APPROVED" label="Approved" />}>
        <p className="font-medium text-sm text-foreground">Delivery request approved.</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">PanelScan staff is arranging your delivery.</p>
        <StatusLine label="Preparing delivery" />
      </DeliveryCard>
    )
  }

  if (approvalStatus === "DECLINED") {
    return (
      <DeliveryCard badge={<StatusBadge status="CANCELLED" label="Declined" />}>
        <p className="font-medium text-sm text-foreground">Delivery request declined</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">Your delivery request was not approved.</p>
        {delivery?.declineReason && (
          <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs leading-5 text-destructive">
            <span className="font-semibold">Reason:</span> {delivery.declineReason}
          </div>
        )}
        {requestButton("Request again", "outline")}
      </DeliveryCard>
    )
  }

  // Not requested yet.
  if (order.status === "CANCELLED") {
    return (
      <DeliveryCard>
        <p className="font-medium text-sm text-foreground">Delivery is not available.</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">This order is cancelled, so delivery cannot be requested.</p>
      </DeliveryCard>
    )
  }

  if (!canRequest) {
    return (
      <DeliveryCard>
        <p className="font-medium text-sm text-foreground">Delivery is not yet scheduled.</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">Delivery can be requested after your order has been approved and payment has been completed.</p>
        {requestButton("Request delivery")}
      </DeliveryCard>
    )
  }

  return (
    <DeliveryCard>
      <p className="font-medium text-sm text-foreground">Your order has been paid and is ready for delivery.</p>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">Request delivery when you're ready. PanelScan staff will choose the vehicle and book it for you.</p>
      {requestButton("Request delivery")}
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
        {vehicle && !isCompleted && <Detail label="Vehicle">{vehicle}{meta?.driverPlateNumber ? ` · ${meta.driverPlateNumber}` : ""}</Detail>}
        {delivery.shippingFee != null && <Detail label="Shipping fee"><span className="font-medium">{formatProductPrice(delivery.shippingFee)}</span></Detail>}
        <Detail label="Status">{statusLabel}</Detail>
        {meta?.driverName && !isCompleted && <Detail label="Driver">{meta.driverName}{meta.driverPhone ? ` · ${meta.driverPhone}` : ""}</Detail>}
        <Detail label="Booking ID"><span className="font-mono">{delivery.lalamoveOrderId}</span></Detail>
      </dl>

      {isCompleted && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-primary/10 p-3 text-xs text-primary">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
          <span>Delivered for order {order.orderNumber}.</span>
        </div>
      )}

      {delivery.shippingFee != null && <ShippingFeePayment delivery={delivery} order={order} onDeliveryUpdated={onDeliveryUpdated} />}

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

/**
 * The shipping fee is a separate charge from the product payment and is
 * never marked paid just because the product was. The customer settles it
 * with GCash (PayMongo) or chooses to pay it in cash on delivery.
 */
function ShippingFeePayment({ delivery, order, onDeliveryUpdated }: { delivery: DeliveryRecord; order: Order; onDeliveryUpdated: (delivery: DeliveryRecord) => void }) {
  const [isSelectingCash, setIsSelectingCash] = useState(false)
  const { startPayment, isStarting } = useStartDeliveryFeePayment()
  const feePayment = delivery.deliveryPayment ?? null
  const status = delivery.deliveryStatus
  const isClosed = status === "CANCELED" || status === "CANCELLED" || status === "REJECTED" || status === "EXPIRED"

  if (feePayment?.status === "PAID") {
    return <p className="mt-4 text-xs text-muted-foreground">Shipping fee paid{feePayment.method === "PayMongo" ? " via GCash" : ""}.</p>
  }
  if (feePayment?.method === "Cash") {
    return <p className="mt-4 text-xs text-muted-foreground">Shipping fee to be paid in cash on delivery.</p>
  }
  if (isClosed || status === "COMPLETED") {
    return <p className="mt-4 text-xs text-muted-foreground">Shipping fee not yet paid.</p>
  }

  async function handleSelectCash() {
    setIsSelectingCash(true)
    try {
      await selectDeliveryFeeCash(order.id)
      const refreshed = await getDeliveryById(delivery.id)
      onDeliveryUpdated(refreshed.delivery)
    } catch (err) {
      toast.error("Could not select cash on delivery", { description: getDeliveryErrorMessage(err, "Please try again.") })
    } finally {
      setIsSelectingCash(false)
    }
  }

  return (
    <div className="mt-4 space-y-2">
      {feePayment?.status === "FAILED" && (
        <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 p-2 text-xs leading-5 text-destructive">
          Your last GCash attempt did not go through. Try again, or pay in cash on delivery.
        </p>
      )}
      {feePayment?.status === "PENDING" && feePayment.method === "PayMongo" && (
        <p className="rounded-lg border border-border bg-secondary/35 p-2 text-xs leading-5 text-muted-foreground">
          Waiting for GCash confirmation. If you already paid, this will update shortly.
        </p>
      )}
      <p className="text-xs font-medium text-foreground">Shipping fee not yet paid. How would you like to pay it?</p>
      <Button className="w-full" onClick={() => void startPayment({ deliveryId: delivery.id, orderId: order.id, orderNumber: order.orderNumber })} disabled={isStarting || isSelectingCash}>
        {isStarting ? <><Loader2 className="animate-spin" aria-hidden="true" />Opening secure checkout…</> : <><Smartphone data-icon="inline-start" aria-hidden="true" />Pay with GCash</>}
      </Button>
      <Button variant="outline" className="w-full" onClick={() => void handleSelectCash()} disabled={isStarting || isSelectingCash}>
        {isSelectingCash ? <><Loader2 className="animate-spin" aria-hidden="true" />Selecting…</> : <><Banknote data-icon="inline-start" aria-hidden="true" />Pay cash on delivery</>}
      </Button>
    </div>
  )
}

function getDeliveryErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiRequestError && error.message) return error.message
  return fallback
}
