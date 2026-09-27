import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, MapPin, RefreshCw, Save, Truck, XCircle } from "lucide-react"
import { useEffect, useMemo, useState, type ReactNode } from "react"
import { useSearchParams } from "react-router-dom"
import { toast } from "sonner"

import {
  approveDeliveryRequest,
  bookDelivery,
  cancelDeliveryBooking,
  declineDeliveryRequest,
  getDeliveries,
  getDeliveryById,
  getFailedDeliveryRequests,
  refreshDeliveryStatus,
  setDeliveryCoordinates,
  type DeliveryStateFilter,
} from "@/api/delivery"
import { formatDateTime } from "@/admin/admin-format"
import { getAdminErrorMessage, useAdminResource } from "@/admin/use-admin-resource"
import { useAuth } from "@/auth/use-auth"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { DataTable, TablePagination } from "@/components/admin/data-table"
import { EmptyState, ErrorState } from "@/components/admin/empty-state"
import { FilterBar, FilterSelect } from "@/components/admin/filter-bar"
import { MetricCard } from "@/components/admin/metric-card"
import { StatusBadge } from "@/components/admin/status-badge"
import { VehiclePicker } from "@/components/delivery/vehicle-picker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { useDebouncedValue } from "@/admin/use-admin-resource"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { formatPhoneForDisplay } from "@/lib/delivery/address-formatter"
import { getDeliveryStatusLabel } from "@/lib/delivery/status-label"
import { deliveryVehicleName } from "@/lib/delivery/vehicle-label"
import { formatProductPrice } from "@/lib/format-price"
import type { DeliveryRecord } from "@/types/delivery"

const STATE_OPTIONS: { value: DeliveryStateFilter; label: string }[] = [
  { value: "requested", label: "Pending approval" },
  { value: "to_book", label: "To book" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
]

type DeliveryState = "" | DeliveryStateFilter

const PRE_BOOKING = new Set(["NOT_REQUESTED", "NOT_SCHEDULED", "VEHICLE_SELECTED", "BOOKING", "BOOKING_FAILED"])

/** One status for the whole workflow: the request's approval state until Lalamove has the order, then Lalamove's own status. */
function workflowStatus(delivery: DeliveryRecord): { status: string; label: string } {
  if (delivery.lalamoveOrderId) return { status: delivery.deliveryStatus ?? "ASSIGNING_DRIVER", label: getDeliveryStatusLabel(delivery.deliveryStatus) }
  if (delivery.approvalStatus === "PENDING_APPROVAL") return { status: "PENDING", label: "Pending approval" }
  if (delivery.approvalStatus === "DECLINED") return { status: "CANCELLED", label: "Declined" }
  if (delivery.approvalStatus === "APPROVED") {
    const status = delivery.deliveryStatus ?? ""
    if (status === "VEHICLE_SELECTED" || status === "BOOKING" || status === "BOOKING_FAILED") return { status, label: getDeliveryStatusLabel(status) }
    return { status: "APPROVED", label: "Approved" }
  }
  return { status: delivery.deliveryStatus ?? "NOT_SCHEDULED", label: getDeliveryStatusLabel(delivery.deliveryStatus) }
}

function customerName(delivery: DeliveryRecord): string {
  const customer = delivery.order?.customer
  return customer ? `${customer.firstName} ${customer.lastName}`.trim() : "—"
}

/** Estimated fee from the moderator's vehicle selection, while it's still the current (unbooked) quote. */
function pendingEstimate(delivery: DeliveryRecord): { amount: number; expiresAt: string } | null {
  const quote = delivery.providerMetadata?.pendingQuotation
  if (!quote || delivery.lalamoveOrderId) return null
  return { amount: quote.amount, expiresAt: quote.expiresAt }
}

function feePaymentLabel(delivery: DeliveryRecord): string {
  const payment = delivery.deliveryPayment
  if (!payment) return "Not yet paid"
  if (payment.status === "PAID") return payment.method === "PayMongo" ? "Paid (GCash)" : "Paid"
  if (payment.method === "Cash") return "Cash on delivery"
  if (payment.status === "FAILED") return "GCash payment failed"
  return "Awaiting GCash confirmation"
}

export function AdminDeliveriesPage() {
  useDocumentTitle("Deliveries | PanelScan Admin")
  const { user } = useAuth()
  const isModerator = user?.role === "MODERATOR"
  const [searchParams, setSearchParams] = useSearchParams()

  const [page, setPage] = useState(1)
  const [deliveryState, setDeliveryState] = useState<DeliveryState>("")
  const [searchInput, setSearchInput] = useState(() => searchParams.get("search") ?? "")
  const search = useDebouncedValue(searchInput)
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryRecord | null>(null)
  const [showFailedRequests, setShowFailedRequests] = useState(false)

  const deliveriesResource = useAdminResource(
    (signal) => getDeliveries({ page, limit: 20, deliveryState: deliveryState || undefined, search: search || undefined, sortBy: "createdAt", sortOrder: "desc" }, signal),
    [page, deliveryState, search],
    { pollIntervalMs: 20_000 },
  )

  const rows = useMemo(() => deliveriesResource.data?.deliveries ?? [], [deliveriesResource.data])

  // Deep link from a notification: /admin/deliveries?delivery=<id> opens that delivery directly.
  const linkedDeliveryId = searchParams.get("delivery")
  useEffect(() => {
    if (!linkedDeliveryId) return
    const controller = new AbortController()
    getDeliveryById(linkedDeliveryId, controller.signal)
      .then((response) => setSelectedDelivery(response.delivery))
      .catch(() => {})
    return () => controller.abort()
  }, [linkedDeliveryId])

  useEffect(() => {
    if (!selectedDelivery) return
    const fresh = rows.find((row) => row.id === selectedDelivery.id)
    if (fresh && fresh.updatedAt !== selectedDelivery.updatedAt) setSelectedDelivery(fresh)
  }, [rows, selectedDelivery])

  function closeSheet() {
    setSelectedDelivery(null)
    if (linkedDeliveryId) {
      const next = new URLSearchParams(searchParams)
      next.delete("delivery")
      setSearchParams(next, { replace: true })
    }
  }

  function handleChanged(delivery: DeliveryRecord) {
    setSelectedDelivery(delivery)
    deliveriesResource.reload()
  }

  const pendingCount = rows.filter((row) => row.approvalStatus === "PENDING_APPROVAL").length
  const toBookCount = rows.filter((row) => row.approvalStatus === "APPROVED" && !row.lalamoveOrderId).length
  const activeCount = rows.filter((row) => ["ASSIGNING_DRIVER", "ON_GOING", "PICKED_UP"].includes(row.deliveryStatus ?? "")).length

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Operations"
        title="Deliveries"
        description={isModerator ? "Approve customer delivery requests, select the Lalamove vehicle, book it, and track it to the door." : "Delivery requests, Lalamove bookings and tracking across every order (view-only)."}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Delivery summary">
        <MetricCard label="Pending requests" value={deliveriesResource.isLoading ? "—" : pendingCount} isLoading={deliveriesResource.isLoading} />
        <MetricCard label="Awaiting booking" value={deliveriesResource.isLoading ? "—" : toBookCount} isLoading={deliveriesResource.isLoading} />
        <MetricCard label="Active deliveries" value={deliveriesResource.isLoading ? "—" : activeCount} isLoading={deliveriesResource.isLoading} />
        <button type="button" onClick={() => setShowFailedRequests(true)} className="text-left">
          <MetricCard label="Failed API requests" value="View" isLoading={false} />
        </button>
      </section>

      <FilterBar hasActiveFilters={Boolean(deliveryState || search)} onClear={() => { setDeliveryState(""); setSearchInput(""); setPage(1) }}>
        <FilterSelect
          label="State"
          value={deliveryState}
          allLabel="All"
          options={STATE_OPTIONS}
          onChange={(value) => { setDeliveryState(value as DeliveryState); setPage(1) }}
        />
        <div className="min-w-48">
          <Input placeholder="Search order, customer, booking, address…" value={searchInput} onChange={(event) => { setSearchInput(event.target.value); setPage(1) }} className="h-9" />
        </div>
      </FilterBar>

      {deliveriesResource.error ? (
        <ErrorState message={deliveriesResource.error} onRetry={deliveriesResource.reload} />
      ) : (
        <>
          <DataTable
            caption="Delivery requests and Lalamove bookings"
            isLoading={deliveriesResource.isLoading}
            rows={rows}
            getRowId={(row) => row.id}
            empty={<EmptyState icon={Truck} title="No deliveries found" description="Delivery requests appear here as soon as a customer with a paid order requests delivery." />}
            columns={[
              {
                key: "order",
                header: "Order",
                primary: true,
                cell: (row) => (
                  <div className="space-y-0.5">
                    <span className="font-semibold text-foreground">{row.order?.orderNumber ?? "—"}</span>
                    <p className="text-xs text-muted-foreground">{customerName(row)} · {formatDateTime(row.requestedAt ?? row.createdAt)}</p>
                  </div>
                ),
              },
              {
                key: "status",
                header: "Status",
                cell: (row) => {
                  const { status, label } = workflowStatus(row)
                  return <StatusBadge status={status} label={label} />
                },
              },
              {
                key: "vehicle",
                header: "Vehicle",
                secondary: true,
                cell: (row) => deliveryVehicleName(row) ?? <span className="text-xs text-muted-foreground italic">Not selected</span>,
              },
              {
                key: "fee",
                header: "Shipping fee",
                secondary: true,
                cell: (row) => (row.shippingFee != null ? formatProductPrice(row.shippingFee) : <span className="text-xs text-muted-foreground italic">After booking</span>),
              },
              {
                key: "booking",
                header: "Booking ID",
                secondary: true,
                cell: (row) => (row.lalamoveOrderId ? <span className="font-mono text-xs">{row.lalamoveOrderId}</span> : <span className="text-xs text-muted-foreground italic">Not booked</span>),
              },
            ]}
            rowAction={(row) => (
              <Button variant="outline" size="sm" onClick={() => setSelectedDelivery(row)} aria-label={`View delivery for ${row.order?.orderNumber ?? "order"}`}>
                {isModerator ? "Manage" : "View"}
              </Button>
            )}
          />
          <TablePagination pagination={deliveriesResource.data?.pagination ?? null} onPageChange={setPage} isLoading={deliveriesResource.isLoading} />
        </>
      )}

      <DeliveryDetailSheet delivery={selectedDelivery} isModerator={isModerator} onClose={closeSheet} onChanged={handleChanged} />
      <FailedRequestsSheet open={showFailedRequests} onClose={() => setShowFailedRequests(false)} />
    </div>
  )
}

function SheetSection({ title, emphasis, children }: { title: string; emphasis?: boolean; children: ReactNode }) {
  return (
    <section className={emphasis ? "space-y-3 rounded-lg border-2 border-primary/20 bg-primary/5 p-4" : "space-y-3 rounded-lg border border-border bg-muted/20 p-4"}>
      <h4 className={emphasis ? "text-xs font-bold uppercase tracking-wider text-foreground" : "text-xs font-semibold uppercase tracking-wider text-muted-foreground"}>{title}</h4>
      {children}
    </section>
  )
}

function Field({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div>
      <span className="block text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono font-medium text-foreground break-all" : "font-medium text-foreground"}>{children}</span>
    </div>
  )
}

/**
 * MODERATOR manages the whole workflow from here: approve/decline the
 * request -> select the Lalamove vehicle -> book -> refresh/cancel. OWNER
 * opens the same sheet with every action hidden (the backend refuses them
 * for OWNER regardless).
 */
function DeliveryDetailSheet({ delivery, isModerator, onClose, onChanged }: { delivery: DeliveryRecord | null; isModerator: boolean; onClose: () => void; onChanged: (delivery: DeliveryRecord) => void }) {
  const [busyAction, setBusyAction] = useState<"approve" | "decline" | "book" | "refresh" | "cancel" | "coordinates" | null>(null)
  const [isDeclining, setIsDeclining] = useState(false)
  const [declineReason, setDeclineReason] = useState("")
  const [bookingError, setBookingError] = useState("")
  const [latInput, setLatInput] = useState("")
  const [lngInput, setLngInput] = useState("")
  const [coordinatesError, setCoordinatesError] = useState("")

  const location = delivery?.order?.deliveryLocation ?? null

  useEffect(() => {
    setLatInput(location?.latitude != null ? String(location.latitude) : "")
    setLngInput(location?.longitude != null ? String(location.longitude) : "")
    setCoordinatesError("")
    setIsDeclining(false)
    setDeclineReason("")
    setBookingError("")
    // Only reset when a different delivery is opened, not on every poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delivery?.id])

  if (!delivery) return null
  const current = delivery
  const order = current.order
  const meta = current.providerMetadata
  const { status, label } = workflowStatus(current)
  const vehicle = deliveryVehicleName(current)
  const estimate = pendingEstimate(current)
  const isBooked = Boolean(current.lalamoveOrderId)
  const isTerminal = current.deliveryStatus === "COMPLETED" || current.deliveryStatus === "CANCELED"
  const canBook = current.approvalStatus === "APPROVED" && !isBooked && Boolean(current.vehicleType) && PRE_BOOKING.has(current.deliveryStatus ?? "NOT_SCHEDULED")
  const hasPin = location?.latitude != null && location?.longitude != null

  async function run(action: NonNullable<typeof busyAction>, task: () => Promise<DeliveryRecord>, success: string) {
    setBusyAction(action)
    try {
      onChanged(await task())
      toast.success(success)
      return true
    } catch (error) {
      toast.error("Action failed", { description: getAdminErrorMessage(error) })
      return false
    } finally {
      setBusyAction(null)
    }
  }

  async function handleBook() {
    setBusyAction("book")
    setBookingError("")
    try {
      const response = await bookDelivery(current.orderId)
      onChanged(response.delivery)
      toast.success("Lalamove delivery booked", { description: response.delivery.shippingFee != null ? `Shipping fee: ${formatProductPrice(response.delivery.shippingFee)}` : undefined })
    } catch (error) {
      setBookingError(getAdminErrorMessage(error))
      // The failed attempt is recorded on the delivery (BOOKING_FAILED) - reload it so the sheet shows that state.
      getDeliveryById(current.id).then((response) => onChanged(response.delivery)).catch(() => {})
    } finally {
      setBusyAction(null)
    }
  }

  async function handleSaveCoordinates() {
    const latitude = Number(latInput)
    const longitude = Number(lngInput)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setCoordinatesError("Enter valid decimal latitude and longitude.")
      return
    }
    setCoordinatesError("")
    await run(
      "coordinates",
      async () => {
        await setDeliveryCoordinates(current.orderId, latitude, longitude)
        return (await getDeliveryById(current.id)).delivery
      },
      "Delivery coordinates updated",
    )
  }

  return (
    <Sheet open={Boolean(delivery)} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent className="admin-surface sm:max-w-xl w-full overflow-y-auto p-6">
        <SheetHeader className="space-y-1 border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <Truck className="size-5 text-primary" aria-hidden="true" />
            <SheetTitle className="text-lg font-semibold">Delivery request</SheetTitle>
          </div>
          <SheetDescription className="text-xs text-muted-foreground">
            Order <span className="font-semibold text-foreground">{order?.orderNumber ?? "—"}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 pt-4 text-sm">
          <SheetSection title="Status">
            <StatusBadge status={status} label={label} />
            <div className="grid grid-cols-2 gap-3 text-xs">
              <Field label="Requested">{current.requestedAt ? formatDateTime(current.requestedAt) : "—"}</Field>
              <Field label="Approved">{current.approvedAt ? formatDateTime(current.approvedAt) : "—"}</Field>
              <Field label="Booked">{current.bookedAt ? formatDateTime(current.bookedAt) : "—"}</Field>
              <Field label="Delivered">{current.deliveredAt ? formatDateTime(current.deliveredAt) : "—"}</Field>
            </div>
          </SheetSection>

          <SheetSection title="Customer & order">
            <div className="grid grid-cols-2 gap-3 text-xs">
              <Field label="Customer">{customerName(current)}</Field>
              <Field label="Contact">
                {order?.customer?.phone ? formatPhoneForDisplay(order.customer.phone) : "—"}
                {order?.customer?.email && <span className="block font-normal text-muted-foreground break-all">{order.customer.email}</span>}
              </Field>
              <Field label="Recipient">
                {location?.recipientName ?? "—"}
                {location?.recipientPhone && <span className="block font-normal text-muted-foreground">{formatPhoneForDisplay(location.recipientPhone)}</span>}
              </Field>
              <Field label="Product payment">
                {order?.payment ? <StatusBadge status={order.payment.status} /> : <StatusBadge status="PENDING" label="Not paid" />}
              </Field>
            </div>
            {order?.items && order.items.length > 0 && (
              <ul className="space-y-1 border-t border-border pt-3 text-xs">
                {order.items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-3">
                    <span className="text-foreground">{item.productName}</span>
                    <span className="shrink-0 text-muted-foreground">× {item.quantity}</span>
                  </li>
                ))}
                <li className="flex justify-between gap-3 pt-1 font-medium">
                  <span>{order.items.reduce((sum, item) => sum + item.quantity, 0)} pcs</span>
                  {order.totalAmount && <span>{formatProductPrice(order.totalAmount)}</span>}
                </li>
              </ul>
            )}
          </SheetSection>

          <SheetSection title="Shipping address">
            <p className="text-xs text-foreground">{location?.formattedAddress ?? current.address}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <div className="flex items-center gap-1.5">
                <MapPin className="size-3.5 text-muted-foreground" aria-hidden="true" />
                <span className="text-[11px] text-muted-foreground">
                  {hasPin ? <>Coordinates: <span className="font-medium text-foreground">{location!.latitude!.toFixed(7)}, {location!.longitude!.toFixed(7)}</span></> : <span className="font-medium text-amber-600">No map pin on this order</span>}
                </span>
              </div>
              {hasPin && (
                <a href={`https://www.google.com/maps?q=${location!.latitude},${location!.longitude}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
                  View on map <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              )}
            </div>

            {/* Orders placed with a saved address carry the customer's own map pin; manual entry is only a fallback for older orders without one. */}
            {isModerator && !hasPin && !isBooked && (
              <div className="space-y-2 rounded-md border border-border bg-card p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Set delivery coordinates (older order)</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="delivery-lat" className="text-[11px] text-muted-foreground">Latitude</Label>
                    <Input id="delivery-lat" className="mt-1 h-8 text-xs" value={latInput} onChange={(event) => setLatInput(event.target.value)} placeholder="e.g. 14.8080032" inputMode="decimal" />
                  </div>
                  <div>
                    <Label htmlFor="delivery-lng" className="text-[11px] text-muted-foreground">Longitude</Label>
                    <Input id="delivery-lng" className="mt-1 h-8 text-xs" value={lngInput} onChange={(event) => setLngInput(event.target.value)} placeholder="e.g. 121.0421246" inputMode="decimal" />
                  </div>
                </div>
                {coordinatesError && <p className="text-[11px] text-destructive">{coordinatesError}</p>}
                <Button size="sm" variant="outline" className="w-full" onClick={() => void handleSaveCoordinates()} disabled={busyAction !== null || !latInput || !lngInput}>
                  {busyAction === "coordinates" ? <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" /> : <Save className="size-3.5" data-icon="inline-start" />}
                  Save coordinates
                </Button>
              </div>
            )}
          </SheetSection>

          {isModerator && current.approvalStatus === "PENDING_APPROVAL" && (
            <SheetSection title="Delivery request" emphasis>
              <p className="text-xs text-muted-foreground">The product payment is complete. Approve to arrange this delivery, then select the Lalamove vehicle.</p>
              {isDeclining ? (
                <div className="space-y-2">
                  <Label htmlFor="decline-reason" className="text-xs">Reason (shown to the customer, optional)</Label>
                  <Textarea id="decline-reason" value={declineReason} onChange={(event) => setDeclineReason(event.target.value)} rows={3} maxLength={500} />
                  <div className="flex gap-2">
                    <Button size="sm" variant="destructive" className="flex-1" disabled={busyAction !== null} onClick={() => void run("decline", async () => (await declineDeliveryRequest(current.orderId, declineReason.trim() || undefined)).delivery, "Delivery request declined")}>
                      {busyAction === "decline" && <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" />}Decline request
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => setIsDeclining(false)} disabled={busyAction !== null}>Back</Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1" disabled={busyAction !== null} onClick={() => void run("approve", async () => (await approveDeliveryRequest(current.orderId)).delivery, "Delivery request approved")}>
                    {busyAction === "approve" ? <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" /> : <CheckCircle2 className="size-3.5" data-icon="inline-start" />}Approve delivery
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1 border-destructive/40 text-destructive hover:bg-destructive/10" disabled={busyAction !== null} onClick={() => setIsDeclining(true)}>Decline</Button>
                </div>
              )}
            </SheetSection>
          )}

          {current.approvalStatus === "DECLINED" && current.declineReason && (
            <SheetSection title="Declined">
              <p className="text-xs text-destructive">{current.declineReason}</p>
            </SheetSection>
          )}

          {current.approvalStatus === "APPROVED" && !isBooked && (
            <SheetSection title="Lalamove booking" emphasis={isModerator}>
              {(bookingError || current.bookingError) && (
                <p role="alert" className="rounded-md border border-destructive/20 bg-destructive/5 p-2 text-xs leading-5 text-destructive">
                  {bookingError || `Lalamove booking failed. Please try again. (${current.bookingError})`}
                </p>
              )}
              {vehicle && (
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <Field label="Selected vehicle">{vehicle}</Field>
                  <Field label="Estimated delivery fee">{estimate ? formatProductPrice(estimate.amount.toFixed(2)) : "Re-quoted at booking"}</Field>
                </div>
              )}
              {isModerator ? (
                <>
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{vehicle ? "Change vehicle" : "Select vehicle"}</p>
                    <VehiclePicker key={current.id} orderId={current.orderId} currentVehicle={current.vehicleType ?? null} disabled={busyAction !== null || current.deliveryStatus === "BOOKING" || !hasPin} onSelected={onChanged} />
                    {!hasPin && <p className="text-[11px] text-amber-600">Set the delivery coordinates first.</p>}
                  </div>
                  <Button className="w-full" onClick={() => void handleBook()} disabled={!canBook || busyAction !== null}>
                    {busyAction === "book" ? <><Loader2 className="size-3.5 animate-spin" aria-hidden="true" />Booking with Lalamove…</> : <><Truck className="size-3.5" aria-hidden="true" />Book Lalamove delivery</>}
                  </Button>
                  <p className="text-[11px] text-muted-foreground">Booking places a real, billable Lalamove order. The fee Lalamove returns is shown to the customer.</p>
                </>
              ) : (
                !vehicle && <p className="text-xs text-muted-foreground">Waiting for a moderator to select the vehicle and book Lalamove.</p>
              )}
            </SheetSection>
          )}

          {isBooked && (
            <SheetSection title="Lalamove booking">
              <div className="grid grid-cols-2 gap-3 text-xs">
                <Field label="Booking ID" mono>{current.lalamoveOrderId}</Field>
                <Field label="Vehicle">{vehicle ?? "—"}</Field>
                <Field label="Shipping fee">{current.shippingFee != null ? formatProductPrice(current.shippingFee) : "—"}</Field>
                <Field label="Fee payment">{feePaymentLabel(current)}</Field>
                <Field label="Driver">{meta?.driverName ?? "Not assigned yet"}</Field>
                <Field label="Driver phone">{meta?.driverPhone ?? "—"}</Field>
                <Field label="Plate number">{meta?.driverPlateNumber ?? "—"}</Field>
                <Field label="Courier">{current.courierName ?? "Lalamove"}</Field>
              </div>
              {current.trackingUrl ? (
                <a href={current.trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                  View Lalamove tracking <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              ) : (
                <p className="text-xs text-muted-foreground">Delivery booked. Tracking information will be available shortly.</p>
              )}
              {meta?.lastSyncedAt && <p className="text-[11px] text-muted-foreground">Last synced {formatDateTime(meta.lastSyncedAt)}</p>}
              {isModerator && (
                <div className="flex flex-col gap-2 border-t border-border pt-3">
                  <Button size="sm" variant="outline" onClick={() => void run("refresh", async () => (await refreshDeliveryStatus(current.id)).delivery, "Delivery status refreshed")} disabled={busyAction !== null}>
                    {busyAction === "refresh" ? <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" /> : <RefreshCw className="size-3.5" data-icon="inline-start" />}
                    Refresh status
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={isTerminal || busyAction !== null}
                    onClick={() => {
                      if (!window.confirm("Cancel this Lalamove booking? This cannot be undone.")) return
                      void run("cancel", async () => (await cancelDeliveryBooking(current.id)).delivery, "Delivery booking cancelled")
                    }}
                  >
                    {busyAction === "cancel" ? <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" /> : <XCircle className="size-3.5" data-icon="inline-start" />}
                    Cancel booking
                  </Button>
                </div>
              )}
            </SheetSection>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function FailedRequestsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const resource = useAdminResource((signal) => (open ? getFailedDeliveryRequests(1, 50, signal) : Promise.resolve({ logs: [], pagination: { page: 1, limit: 50, total: 0, totalPages: 1 } })), [open])
  const logs = resource.data?.logs ?? []

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <SheetContent className="admin-surface sm:max-w-xl w-full overflow-y-auto p-6">
        <SheetHeader className="space-y-1 border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-5 text-destructive" aria-hidden="true" />
            <SheetTitle className="text-lg font-semibold">Failed API requests</SheetTitle>
          </div>
          <SheetDescription className="text-xs text-muted-foreground">Recent failed calls to the Lalamove delivery provider.</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 pt-4">
          {resource.isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
          {resource.error && <ErrorState message={resource.error} onRetry={resource.reload} />}
          {!resource.isLoading && !resource.error && logs.length === 0 && <p className="text-xs text-muted-foreground">No failed requests recorded.</p>}
          {logs.map((log) => (
            <div key={log.id} className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-destructive">{log.action.replace(/_/g, " ")}</span>
                <span className="text-muted-foreground">{formatDateTime(log.createdAt)}</span>
              </div>
              {log.metadata?.error ? <p className="mt-1 text-foreground">{String(log.metadata.error)}</p> : null}
              {log.metadata?.orderId ? <p className="mt-1 text-muted-foreground">Order: {String(log.metadata.orderId)}</p> : null}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  )
}
