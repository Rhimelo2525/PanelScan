import { ArrowRight, CalendarDays, CheckCircle2, ExternalLink, Loader2, Truck } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { StatusBadge } from "@/components/admin/status-badge"
import { Button } from "@/components/ui/button"
import { formatOrderDate } from "@/orders/order-format"
import { proceedWithDelivery, requestDelivery } from "@/api/delivery"
import type { DeliveryRecord } from "@/types/delivery"
import type { Order } from "@/types/order"

interface OrderDeliveryPanelProps {
  order: Order
  onDeliveryUpdated: (delivery: DeliveryRecord) => void
}

export function OrderDeliveryPanel({ order, onDeliveryUpdated }: OrderDeliveryPanelProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isProceeding, setIsProceeding] = useState(false)
  const [proceedSuccessMessage, setProceedSuccessMessage] = useState<string | null>(null)

  const delivery = order.delivery
  const approvalStatus = delivery?.approvalStatus ?? "NOT_REQUESTED"
  const deliveryStatus = delivery?.deliveryStatus ?? "NOT_SCHEDULED"
  const meta = delivery?.providerMetadata

  async function handleRequest() {
    setIsSubmitting(true)
    try {
      const response = await requestDelivery(order.id)
      onDeliveryUpdated(response.delivery)
      toast.success("Delivery request submitted", {
        description: "PanelScan staff will review your request shortly.",
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to submit delivery request"
      toast.error("Could not request delivery", { description: message })
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleProceed() {
    setIsProceeding(true)
    setProceedSuccessMessage(null)
    try {
      const response = await proceedWithDelivery(order.id)
      onDeliveryUpdated(response.delivery)
      setProceedSuccessMessage("Delivery proceeding authorized. Ready for Lalamove integration.")
      toast.success("Delivery proceeding authorized", {
        description: "Delivery is verified and ready for courier quotation.",
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to proceed with delivery"
      toast.error("Could not proceed with delivery", { description: message })
    } finally {
      setIsProceeding(false)
    }
  }

  // State E: Physical delivery in progress / scheduled / delivered
  if (delivery && deliveryStatus !== "NOT_REQUESTED" && deliveryStatus !== "NOT_SCHEDULED") {
    if (deliveryStatus === "PREPARING") {
      return (
        <section className="surface-card p-6" aria-labelledby="delivery-coordination-title">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Truck className="size-4 text-primary" aria-hidden="true" />
              <h2 id="delivery-coordination-title" className="font-semibold">Delivery coordination</h2>
            </div>
            <StatusBadge status="PREPARING" label="Preparing delivery" />
          </div>
          <div className="mt-4">
            <p className="font-medium text-sm text-foreground">Preparing delivery</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Your order is being prepared for courier booking.
            </p>
          </div>
        </section>
      )
    }

    const bookingId = delivery.trackingNumber || meta?.bookingId
    const driverName = meta?.driverName
    const vehicleType = meta?.vehicleType
    const trackingUrl = meta?.trackingUrl
    const estimatedDelivery = delivery.scheduledDate ? formatOrderDate(delivery.scheduledDate) : meta?.estimatedDelivery

    return (
      <section className="surface-card p-6" aria-labelledby="delivery-coordination-title">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Truck className="size-4 text-primary" aria-hidden="true" />
            <h2 id="delivery-coordination-title" className="font-semibold">Delivery coordination</h2>
          </div>
          <StatusBadge status={deliveryStatus} />
        </div>
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="text-xs font-semibold uppercase text-muted-foreground">Courier</dt>
            <dd className="mt-1 text-sm font-medium text-foreground">
              {delivery.courierName || "Lalamove"}
            </dd>
          </div>
          {bookingId && (
            <div>
              <dt className="text-xs font-semibold uppercase text-muted-foreground">Booking ID</dt>
              <dd className="mt-1 text-sm font-mono text-foreground">{bookingId}</dd>
            </div>
          )}
          {driverName && (
            <div>
              <dt className="text-xs font-semibold uppercase text-muted-foreground">Driver</dt>
              <dd className="mt-1 text-sm text-foreground">{driverName}</dd>
            </div>
          )}
          {vehicleType && (
            <div>
              <dt className="text-xs font-semibold uppercase text-muted-foreground">Vehicle</dt>
              <dd className="mt-1 text-sm text-foreground">{vehicleType}</dd>
            </div>
          )}
          {estimatedDelivery && (
            <div>
              <dt className="text-xs font-semibold uppercase text-muted-foreground">Estimated delivery</dt>
              <dd className="mt-1 flex items-center gap-1.5 text-sm text-foreground">
                <CalendarDays className="size-3.5 text-primary" aria-hidden="true" />
                {estimatedDelivery}
              </dd>
            </div>
          )}
          {trackingUrl && (
            <div className="border-t border-border pt-3">
              <a
                href={trackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                Track live delivery
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            </div>
          )}
        </dl>
      </section>
    )
  }

  // State B: Waiting for Moderator approval
  if (approvalStatus === "PENDING_APPROVAL") {
    return (
      <section className="surface-card p-6" aria-labelledby="delivery-coordination-title">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Truck className="size-4 text-primary" aria-hidden="true" />
            <h2 id="delivery-coordination-title" className="font-semibold">Delivery coordination</h2>
          </div>
          <StatusBadge status="PENDING" label="Awaiting approval" />
        </div>
        <div className="mt-4">
          <p className="font-medium text-sm text-foreground">Delivery request submitted</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Your delivery request is waiting for approval from PanelScan.
          </p>
        </div>
        <div className="mt-6 border-t border-border pt-5">
          <Button className="w-full" disabled>
            Proceed with delivery
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Moderator approval is required before you can proceed.
          </p>
        </div>
      </section>
    )
  }

  // State C: Moderator approved
  if (approvalStatus === "APPROVED") {
    return (
      <section className="surface-card p-6" aria-labelledby="delivery-coordination-title">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Truck className="size-4 text-primary" aria-hidden="true" />
            <h2 id="delivery-coordination-title" className="font-semibold">Delivery coordination</h2>
          </div>
          <StatusBadge status="APPROVED" label="Approved" />
        </div>
        <div className="mt-4">
          <p className="font-medium text-sm text-foreground">Delivery request approved</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Your delivery request has been approved by PanelScan. You may now proceed with delivery.
          </p>
        </div>
        {proceedSuccessMessage && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-primary/10 p-3 text-xs text-primary">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            <span>{proceedSuccessMessage}</span>
          </div>
        )}
        <div className="mt-6 border-t border-border pt-5">
          <Button className="w-full" onClick={() => void handleProceed()} disabled={isProceeding}>
            {isProceeding ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Authorizing delivery...
              </>
            ) : (
              <>
                Proceed with delivery
                <ArrowRight data-icon="inline-end" aria-hidden="true" />
              </>
            )}
          </Button>
        </div>
      </section>
    )
  }

  // State D: Declined
  if (approvalStatus === "DECLINED") {
    return (
      <section className="surface-card p-6" aria-labelledby="delivery-coordination-title">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Truck className="size-4 text-primary" aria-hidden="true" />
            <h2 id="delivery-coordination-title" className="font-semibold">Delivery coordination</h2>
          </div>
          <StatusBadge status="CANCELLED" label="Declined" />
        </div>
        <div className="mt-4">
          <p className="font-medium text-sm text-foreground">Delivery request declined</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            Your delivery request was not approved.
          </p>
          {delivery?.declineReason && (
            <div className="mt-3 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs leading-5 text-destructive">
              <span className="font-semibold">Reason:</span> {delivery.declineReason}
            </div>
          )}
        </div>
        <div className="mt-6 border-t border-border pt-5">
          <Button
            variant="outline"
            className="w-full"
            onClick={() => void handleRequest()}
            disabled={isSubmitting || order.status === "CANCELLED"}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Submitting request...
              </>
            ) : (
              "Request again"
            )}
          </Button>
        </div>
      </section>
    )
  }

  // State A: No delivery request yet (default)
  return (
    <section className="surface-card p-6" aria-labelledby="delivery-coordination-title">
      <div className="flex items-center gap-2">
        <Truck className="size-4 text-primary" aria-hidden="true" />
        <h2 id="delivery-coordination-title" className="font-semibold">Delivery coordination</h2>
      </div>
      <div className="mt-4">
        <p className="font-medium text-sm text-foreground">Delivery is not yet scheduled.</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Request delivery when you're ready. PanelScan staff must approve your request before you can proceed with delivery.
        </p>
      </div>
      {order.status !== "CANCELLED" && (
        <div className="mt-6 border-t border-border pt-5">
          <Button
            className="w-full"
            onClick={() => void handleRequest()}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                Submitting request...
              </>
            ) : (
              "Request delivery"
            )}
          </Button>
        </div>
      )}
      {order.status === "CANCELLED" && (
        <p className="mt-4 border-t border-border pt-4 text-xs text-muted-foreground">
          This order is cancelled, so delivery cannot be requested.
        </p>
      )}
    </section>
  )
}
