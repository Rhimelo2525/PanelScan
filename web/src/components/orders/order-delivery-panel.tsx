import { ArrowRight, Bike, CalendarDays, Car, CheckCircle2, ChevronDown, ExternalLink, Loader2, RefreshCw, Truck } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { StatusBadge } from "@/components/admin/status-badge"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { formatOrderDate } from "@/orders/order-format"
import { confirmDeliveryBooking, getVehicleTypes, refreshDeliveryStatus, requestDelivery, requestQuotation } from "@/api/delivery"
import { ApiRequestError } from "@/api/client"
import { getDeliveryStatusLabel } from "@/lib/delivery/status-label"
import { formatProductPrice } from "@/lib/format-price"
import { cn } from "@/lib/utils"
import type { DeliveryQuotation, DeliveryRecord, LalamoveServiceType } from "@/types/delivery"
import type { Order } from "@/types/order"

/**
 * Lalamove's `description` field is a long raw marketing blurb (e.g. "Ex.
 * Kolong-kolong/Cargo tricycle - For local cargo, market goods & bulky
 * items") unsuited to a compact picker card. Rather than hand-write a name
 * for every possible vehicle key (which would eventually go stale or be
 * wrong for a key this account doesn't have yet), the short label is
 * DERIVED from the real key + maxWeightKg fields already on the record -
 * e.g. "800KG_PICK_UP_TRUCK" + 800 -> "800 kg Pick Up Truck".
 */
function vehicleLabel(vehicle: LalamoveServiceType): string {
  const name = vehicle.key
    .replace(/^\d+KG_/, "") // weight is shown separately via maxWeightKg, so it'd otherwise repeat
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ")
  return vehicle.maxWeightKg ? `${vehicle.maxWeightKg} kg ${name}` : name || vehicle.key
}

function VehicleIcon({ vehicleKey, className }: { vehicleKey: string; className?: string }) {
  if (vehicleKey.includes("MOTORCYCLE") || vehicleKey.includes("SIDECAR")) return <Bike className={className} aria-hidden="true" />
  if (vehicleKey.includes("SEDAN") || vehicleKey.includes("MPV")) return <Car className={className} aria-hidden="true" />
  return <Truck className={className} aria-hidden="true" />
}

/**
 * Smallest/everyday vehicles first, "10HR_RENTAL" variants grouped last
 * (they're a different booking type, not just a bigger vehicle) - driven by
 * each vehicle's real maxWeightKg rather than a hardcoded key order, so it
 * stays correct if Lalamove adds or removes a vehicle type.
 */
function sortVehicleTypes(vehicles: LalamoveServiceType[]): LalamoveServiceType[] {
  return [...vehicles].sort((a, b) => {
    const aIsRental = a.key.includes("RENTAL") ? 1 : 0
    const bIsRental = b.key.includes("RENTAL") ? 1 : 0
    if (aIsRental !== bIsRental) return aIsRental - bIsRental
    return (a.maxWeightKg ?? 0) - (b.maxWeightKg ?? 0)
  })
}

interface OrderDeliveryPanelProps {
  order: Order
  onDeliveryUpdated: (delivery: DeliveryRecord) => void
}

export function OrderDeliveryPanel({ order, onDeliveryUpdated }: OrderDeliveryPanelProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  const delivery = order.delivery
  const approvalStatus = delivery?.approvalStatus ?? "NOT_REQUESTED"
  const deliveryStatus = delivery?.deliveryStatus ?? "NOT_SCHEDULED"

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

  // State: a real Lalamove booking exists - live tracking
  if (delivery?.lalamoveOrderId) {
    return <LiveTrackingCard delivery={delivery} orderNumber={order.orderNumber} onDeliveryUpdated={onDeliveryUpdated} />
  }

  // State E (legacy): staff prepared delivery via the old "arrange" flow, before a real booking exists yet
  if (delivery && deliveryStatus === "PREPARING") {
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
            Get a delivery quote
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Moderator approval is required before you can request a quote.
          </p>
        </div>
      </section>
    )
  }

  // State C: Moderator approved - request a live quote, then confirm booking
  if (approvalStatus === "APPROVED") {
    return <QuotationCard order={order} delivery={delivery ?? null} onDeliveryUpdated={onDeliveryUpdated} />
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
          Request delivery when you're ready. PanelScan staff must approve your request before you can get a quote.
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

// ---------------------------------------------------------------------------
// Quotation + booking (APPROVED state)
// ---------------------------------------------------------------------------

function initialQuotationFromMetadata(delivery: DeliveryRecord | null): DeliveryQuotation | null {
  const pending = delivery?.providerMetadata?.pendingQuotation
  if (!pending || new Date(pending.expiresAt).getTime() <= Date.now()) return null
  return pending
}

function QuotationCard({ order, delivery, onDeliveryUpdated }: { order: Order; delivery: DeliveryRecord | null; onDeliveryUpdated: (delivery: DeliveryRecord) => void }) {
  const [vehicleTypes, setVehicleTypes] = useState<LalamoveServiceType[]>([])
  const [isLoadingVehicles, setIsLoadingVehicles] = useState(true)
  const [selectedVehicle, setSelectedVehicle] = useState("")
  const [isVehiclePickerOpen, setIsVehiclePickerOpen] = useState(false)
  const [quotation, setQuotation] = useState<DeliveryQuotation | null>(() => initialQuotationFromMetadata(delivery))
  const [isRequestingQuote, setIsRequestingQuote] = useState(false)
  const [isBooking, setIsBooking] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    const controller = new AbortController()
    getVehicleTypes(controller.signal)
      .then((services) => {
        setVehicleTypes(services)
        setSelectedVehicle((current) => current || services[0]?.key || "")
      })
      .catch(() => setError("We couldn't load available vehicle types. Please try again."))
      .finally(() => setIsLoadingVehicles(false))
    return () => controller.abort()
  }, [])

  const hasCoordinates = typeof order.deliveryLocation?.latitude === "number" && typeof order.deliveryLocation?.longitude === "number"
  const selectedVehicleType = vehicleTypes.find((vehicle) => vehicle.key === selectedVehicle) ?? null

  async function handleGetQuote() {
    setIsRequestingQuote(true)
    setError("")
    try {
      const response = await requestQuotation(order.id, selectedVehicle)
      setQuotation(response.quotation)
    } catch (err) {
      setError(getDeliveryErrorMessage(err, "We couldn't get a delivery quote right now."))
    } finally {
      setIsRequestingQuote(false)
    }
  }

  async function handleConfirmBooking() {
    setIsBooking(true)
    setError("")
    try {
      const response = await confirmDeliveryBooking(order.id)
      onDeliveryUpdated(response.delivery)
      toast.success("Delivery booked", { description: "Your order has been booked with Lalamove." })
    } catch (err) {
      // The quotation may have just expired server-side - clear it so the customer requests a fresh one.
      setQuotation(null)
      setError(getDeliveryErrorMessage(err, "We couldn't confirm your booking. Please request a new quote."))
    } finally {
      setIsBooking(false)
    }
  }

  return (
    <section className="surface-card p-6" aria-labelledby="delivery-coordination-title">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Truck className="size-4 text-primary" aria-hidden="true" />
          <h2 id="delivery-coordination-title" className="font-semibold">Delivery coordination</h2>
        </div>
        <StatusBadge status="APPROVED" label="Approved" />
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Your delivery request has been approved. Choose a vehicle to see the delivery fee before booking.
      </p>

      {error && <p role="alert" className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs leading-5 text-destructive">{error}</p>}

      {!hasCoordinates ? (
        <p className="mt-4 rounded-lg border border-border bg-secondary/35 p-3 text-xs leading-5 text-muted-foreground">
          PanelScan staff still need to confirm the exact map location for your delivery address before a quote can be requested. This usually takes a short while - check back soon.
        </p>
      ) : (
        <div className="mt-5 space-y-4 border-t border-border pt-5">
          <div>
            <Label id="delivery-vehicle-type-label">Vehicle type</Label>
            {isLoadingVehicles ? (
              <p className="mt-2 text-xs text-muted-foreground">Loading available vehicles…</p>
            ) : (
              <>
                <button
                  type="button"
                  aria-labelledby="delivery-vehicle-type-label"
                  aria-expanded={isVehiclePickerOpen}
                  disabled={quotation !== null}
                  onClick={() => setIsVehiclePickerOpen((open) => !open)}
                  className="mt-2 flex h-10 w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-3 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {selectedVehicleType ? (
                    <span className="flex items-center gap-2 font-medium text-foreground">
                      <VehicleIcon vehicleKey={selectedVehicleType.key} className="size-4 shrink-0 text-primary" />
                      {vehicleLabel(selectedVehicleType)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Choose a vehicle</span>
                  )}
                  <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", isVehiclePickerOpen && "rotate-180")} aria-hidden="true" />
                </button>

                {isVehiclePickerOpen && (
                  <div role="radiogroup" aria-labelledby="delivery-vehicle-type-label" className="mt-2 grid grid-cols-2 gap-2">
                    {sortVehicleTypes(vehicleTypes).map((vehicle) => {
                      const isSelected = selectedVehicle === vehicle.key
                      return (
                        <button
                          key={vehicle.key}
                          type="button"
                          role="radio"
                          aria-checked={isSelected}
                          onClick={() => {
                            setSelectedVehicle(vehicle.key)
                            setIsVehiclePickerOpen(false)
                          }}
                          className={cn(
                            "flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors",
                            isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-card hover:bg-muted",
                          )}
                        >
                          <VehicleIcon vehicleKey={vehicle.key} className="size-5 shrink-0 text-primary" />
                          <span className="text-xs leading-tight font-medium text-foreground">{vehicleLabel(vehicle)}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>

          {quotation ? (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-muted-foreground">Delivery fee</span>
                <span className="text-xl font-semibold text-foreground">{formatProductPrice(quotation.amount.toFixed(2))}</span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">Quote valid until {new Date(quotation.expiresAt).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}. Vehicle: {quotation.serviceType}.</p>
              <div className="mt-4 flex flex-col gap-2">
                <Button className="w-full" onClick={() => void handleConfirmBooking()} disabled={isBooking}>
                  {isBooking ? <><Loader2 className="animate-spin" aria-hidden="true" />Booking…</> : <>Confirm &amp; book<ArrowRight data-icon="inline-end" aria-hidden="true" /></>}
                </Button>
                <Button variant="outline" className="w-full" onClick={() => setQuotation(null)} disabled={isBooking}>Choose a different vehicle</Button>
              </div>
            </div>
          ) : (
            <Button className="w-full" onClick={() => void handleGetQuote()} disabled={isRequestingQuote || isLoadingVehicles || !selectedVehicle}>
              {isRequestingQuote ? <><Loader2 className="animate-spin" aria-hidden="true" />Getting quote…</> : "Get a delivery quote"}
            </Button>
          )}
          <p className="text-center text-xs text-muted-foreground">Requesting a quote is free and does not book anything.</p>
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Live tracking (booked with Lalamove)
// ---------------------------------------------------------------------------

function LiveTrackingCard({ delivery, orderNumber, onDeliveryUpdated }: { delivery: DeliveryRecord; orderNumber: string; onDeliveryUpdated: (delivery: DeliveryRecord) => void }) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const meta = delivery.providerMetadata
  const driverName = meta?.driverName
  const vehicleType = meta?.vehicleType
  const trackingUrl = meta?.trackingUrl
  const estimatedDelivery = delivery.scheduledDate ? formatOrderDate(delivery.scheduledDate) : meta?.estimatedDelivery

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
    <section className="surface-card p-6" aria-labelledby="delivery-coordination-title">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Truck className="size-4 text-primary" aria-hidden="true" />
          <h2 id="delivery-coordination-title" className="font-semibold">Delivery coordination</h2>
        </div>
        <StatusBadge status={delivery.deliveryStatus ?? "ASSIGNING_DRIVER"} label={getDeliveryStatusLabel(delivery.deliveryStatus)} />
      </div>
      <dl className="mt-4 space-y-3 text-sm">
        <div>
          <dt className="text-xs font-semibold uppercase text-muted-foreground">Courier</dt>
          <dd className="mt-1 text-sm font-medium text-foreground">
            {delivery.courierName || "Lalamove"}
          </dd>
        </div>
        <div>
          <dt className="text-xs font-semibold uppercase text-muted-foreground">Booking ID</dt>
          <dd className="mt-1 text-sm font-mono text-foreground">{delivery.lalamoveOrderId}</dd>
        </div>
        {driverName && (
          <div>
            <dt className="text-xs font-semibold uppercase text-muted-foreground">Driver</dt>
            <dd className="mt-1 text-sm text-foreground">{driverName}{meta?.driverPhone ? ` · ${meta.driverPhone}` : ""}</dd>
          </div>
        )}
        {vehicleType && (
          <div>
            <dt className="text-xs font-semibold uppercase text-muted-foreground">Vehicle</dt>
            <dd className="mt-1 text-sm text-foreground">{vehicleType}{meta?.driverPlateNumber ? ` · ${meta.driverPlateNumber}` : ""}</dd>
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
        {delivery.deliveryStatus === "COMPLETED" && (
          <div className="flex items-center gap-2 rounded-lg bg-primary/10 p-3 text-xs text-primary">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            <span>Delivered for order {orderNumber}.</span>
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
      {delivery.deliveryStatus !== "COMPLETED" && delivery.deliveryStatus !== "CANCELED" && (
        <Button variant="outline" size="sm" className="mt-4 w-full" onClick={() => void handleRefresh()} disabled={isRefreshing}>
          {isRefreshing ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw data-icon="inline-start" aria-hidden="true" />}
          {isRefreshing ? "Refreshing…" : "Refresh status"}
        </Button>
      )}
    </section>
  )
}

function getDeliveryErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiRequestError && error.message) return error.message
  return fallback
}
