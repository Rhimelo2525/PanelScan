import { AlertTriangle, ExternalLink, Loader2, MapPin, RefreshCw, Save, Truck, XCircle } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { cancelDeliveryBooking, getDeliveries, getFailedDeliveryRequests, refreshDeliveryStatus, setDeliveryCoordinates } from "@/api/delivery"
import { formatDateTime } from "@/admin/admin-format"
import { getAdminErrorMessage, useAdminResource } from "@/admin/use-admin-resource"
import { useAuth } from "@/auth/use-auth"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { DataTable, TablePagination } from "@/components/admin/data-table"
import { EmptyState, ErrorState } from "@/components/admin/empty-state"
import { FilterBar, FilterSelect } from "@/components/admin/filter-bar"
import { MetricCard } from "@/components/admin/metric-card"
import { StatusBadge } from "@/components/admin/status-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useDebouncedValue } from "@/admin/use-admin-resource"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { getDeliveryStatusLabel } from "@/lib/delivery/status-label"
import type { DeliveryRecord } from "@/types/delivery"

const STATE_TABS = [
  { value: "", label: "All" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
] as const

type DeliveryState = "" | "active" | "completed" | "cancelled"

export function AdminDeliveriesPage() {
  useDocumentTitle("Deliveries | PanelScan Admin")
  const { user } = useAuth()
  const isModerator = user?.role === "MODERATOR"

  const [page, setPage] = useState(1)
  const [deliveryState, setDeliveryState] = useState<DeliveryState>("")
  const [searchInput, setSearchInput] = useState("")
  const search = useDebouncedValue(searchInput)
  const [selectedDelivery, setSelectedDelivery] = useState<DeliveryRecord | null>(null)
  const [showFailedRequests, setShowFailedRequests] = useState(false)

  const deliveriesResource = useAdminResource(
    (signal) => getDeliveries({ page, limit: 20, deliveryState: deliveryState || undefined, search: search || undefined, sortBy: "createdAt", sortOrder: "desc" }, signal),
    [page, deliveryState, search],
  )

  const rows = useMemo(() => deliveriesResource.data?.deliveries ?? [], [deliveriesResource.data])

  useEffect(() => {
    if (!selectedDelivery) return
    const fresh = rows.find((row) => row.id === selectedDelivery.id)
    if (fresh) setSelectedDelivery(fresh)
  }, [rows, selectedDelivery])

  const activeCount = rows.filter((row) => ["ASSIGNING_DRIVER", "ON_GOING", "PICKED_UP", "PREPARING"].includes(row.deliveryStatus ?? "")).length
  const bookedCount = rows.filter((row) => row.lalamoveOrderId).length
  const completedCount = rows.filter((row) => row.deliveryStatus === "COMPLETED").length

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Operations"
        title="Deliveries"
        description={isModerator ? "Manage live Lalamove deliveries: track status, view driver details, and handle cancellations." : "Live Lalamove delivery activity across every order (view-only)."}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Delivery summary">
        <MetricCard label="Active deliveries" value={deliveriesResource.isLoading ? "—" : activeCount} isLoading={deliveriesResource.isLoading} />
        <MetricCard label="Booked with Lalamove" value={deliveriesResource.isLoading ? "—" : bookedCount} isLoading={deliveriesResource.isLoading} />
        <MetricCard label="Completed" value={deliveriesResource.isLoading ? "—" : completedCount} isLoading={deliveriesResource.isLoading} />
        <button type="button" onClick={() => setShowFailedRequests(true)} className="text-left">
          <MetricCard label="Failed API requests" value="View" isLoading={false} />
        </button>
      </section>

      <FilterBar hasActiveFilters={Boolean(deliveryState || search)} onClear={() => { setDeliveryState(""); setSearchInput(""); setPage(1) }}>
        <FilterSelect
          label="State"
          value={deliveryState}
          allLabel="All"
          options={STATE_TABS.filter((tab) => tab.value).map((tab) => ({ value: tab.value, label: tab.label }))}
          onChange={(value) => { setDeliveryState(value as DeliveryState); setPage(1) }}
        />
        <div className="min-w-48">
          <Input placeholder="Search tracking, courier, address…" value={searchInput} onChange={(event) => { setSearchInput(event.target.value); setPage(1) }} className="h-9" />
        </div>
      </FilterBar>

      {deliveriesResource.error ? (
        <ErrorState message={deliveriesResource.error} onRetry={deliveriesResource.reload} />
      ) : (
        <>
          <DataTable
            caption="Deliveries with live Lalamove status"
            isLoading={deliveriesResource.isLoading}
            rows={rows}
            getRowId={(row) => row.id}
            empty={<EmptyState icon={Truck} title="No deliveries found" description="Deliveries appear here once a customer's delivery request has been approved and a Lalamove booking is made." />}
            columns={[
              {
                key: "order",
                header: "Order",
                primary: true,
                cell: (row) => (
                  <div className="space-y-0.5">
                    <span className="font-semibold text-foreground">{row.order?.orderNumber ?? "—"}</span>
                    <p className="text-xs text-muted-foreground">{formatDateTime(row.createdAt)}</p>
                  </div>
                ),
              },
              {
                key: "status",
                header: "Status",
                cell: (row) => <StatusBadge status={row.deliveryStatus ?? "NOT_SCHEDULED"} label={getDeliveryStatusLabel(row.deliveryStatus)} />,
              },
              {
                key: "driver",
                header: "Driver",
                secondary: true,
                cell: (row) => row.providerMetadata?.driverName ?? <span className="text-xs text-muted-foreground italic">Not assigned</span>,
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

      <DeliveryDetailSheet delivery={selectedDelivery} isModerator={isModerator} onClose={() => setSelectedDelivery(null)} onUpdated={deliveriesResource.reload} />
      <FailedRequestsSheet open={showFailedRequests} onClose={() => setShowFailedRequests(false)} />
    </div>
  )
}

function DeliveryDetailSheet({ delivery, isModerator, onClose, onUpdated }: { delivery: DeliveryRecord | null; isModerator: boolean; onClose: () => void; onUpdated: () => void }) {
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [latInput, setLatInput] = useState("")
  const [lngInput, setLngInput] = useState("")
  const [isSavingCoordinates, setIsSavingCoordinates] = useState(false)
  const [coordinatesError, setCoordinatesError] = useState("")

  const location = delivery?.order?.deliveryLocation ?? null

  useEffect(() => {
    setLatInput(location?.latitude != null ? String(location.latitude) : "")
    setLngInput(location?.longitude != null ? String(location.longitude) : "")
    setCoordinatesError("")
    // Only re-sync when a different delivery is opened, not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delivery?.id])

  if (!delivery) return null
  const meta = delivery.providerMetadata

  async function handleSaveCoordinates() {
    if (!delivery) return
    const latitude = Number(latInput)
    const longitude = Number(lngInput)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setCoordinatesError("Enter valid decimal latitude and longitude.")
      return
    }
    setCoordinatesError("")
    setIsSavingCoordinates(true)
    try {
      await setDeliveryCoordinates(delivery.orderId, latitude, longitude)
      onUpdated()
      toast.success("Delivery coordinates updated")
    } catch (error) {
      toast.error("Could not save coordinates", { description: getAdminErrorMessage(error) })
    } finally {
      setIsSavingCoordinates(false)
    }
  }

  async function handleRefresh() {
    if (!delivery) return
    setIsRefreshing(true)
    try {
      await refreshDeliveryStatus(delivery.id)
      onUpdated()
      toast.success("Delivery status refreshed")
    } catch (error) {
      toast.error("Could not refresh status", { description: getAdminErrorMessage(error) })
    } finally {
      setIsRefreshing(false)
    }
  }

  async function handleCancel() {
    if (!delivery) return
    if (!window.confirm("Cancel this Lalamove booking? This cannot be undone.")) return
    setIsCancelling(true)
    try {
      await cancelDeliveryBooking(delivery.id)
      onUpdated()
      toast.success("Delivery booking cancelled")
      onClose()
    } catch (error) {
      toast.error("Could not cancel delivery", { description: getAdminErrorMessage(error) })
    } finally {
      setIsCancelling(false)
    }
  }

  const isTerminal = delivery.deliveryStatus === "COMPLETED" || delivery.deliveryStatus === "CANCELED"

  return (
    <Sheet open={Boolean(delivery)} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent className="admin-surface sm:max-w-xl w-full overflow-y-auto p-6">
        <SheetHeader className="space-y-1 border-b border-border pb-4">
          <div className="flex items-center gap-2">
            <Truck className="size-5 text-primary" aria-hidden="true" />
            <SheetTitle className="text-lg font-semibold">Delivery</SheetTitle>
          </div>
          <SheetDescription className="text-xs text-muted-foreground">
            Order <span className="font-semibold text-foreground">{delivery.order?.orderNumber ?? "—"}</span>
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 pt-4 text-sm">
          <section className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</h4>
            <StatusBadge status={delivery.deliveryStatus ?? "NOT_SCHEDULED"} label={getDeliveryStatusLabel(delivery.deliveryStatus)} />
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div><span className="block text-muted-foreground">Booking ID</span><span className="font-mono font-medium text-foreground">{delivery.lalamoveOrderId ?? "—"}</span></div>
              <div><span className="block text-muted-foreground">Courier</span><span className="font-medium text-foreground">{delivery.courierName ?? "Lalamove"}</span></div>
            </div>
          </section>

          {meta && (
            <section className="space-y-3 rounded-lg border border-border bg-card p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Driver &amp; vehicle</h4>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div><span className="block text-muted-foreground">Driver</span><span className="font-medium text-foreground">{meta.driverName ?? "Not assigned yet"}</span></div>
                <div><span className="block text-muted-foreground">Phone</span><span className="font-medium text-foreground">{meta.driverPhone ?? "—"}</span></div>
                <div><span className="block text-muted-foreground">Vehicle</span><span className="font-medium text-foreground">{meta.vehicleType ?? "—"}</span></div>
                <div><span className="block text-muted-foreground">Plate number</span><span className="font-medium text-foreground">{meta.driverPlateNumber ?? "—"}</span></div>
              </div>
              {meta.trackingUrl && (
                <a href={meta.trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
                  Open Lalamove tracking <ExternalLink className="size-3" aria-hidden="true" />
                </a>
              )}
              {meta.lastSyncedAt && <p className="text-[11px] text-muted-foreground">Last synced {formatDateTime(meta.lastSyncedAt)}</p>}
            </section>
          )}

          <section className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Address</h4>
            <p className="text-xs text-foreground">{delivery.address}</p>

            <div className="flex items-center gap-1.5 pt-1">
              <MapPin className="size-3.5 text-muted-foreground" aria-hidden="true" />
              <span className="text-[11px] text-muted-foreground">
                Map location:{" "}
                {location?.geocodingStatus === "completed" ? (
                  <span className="font-medium text-emerald-600">Confirmed{location.geocodingProvider ? ` (${location.geocodingProvider})` : ""}</span>
                ) : location?.geocodingStatus === "failed" ? (
                  <span className="font-medium text-destructive">Could not be auto-detected - needs manual coordinates</span>
                ) : (
                  <span className="font-medium text-amber-600">Not yet set</span>
                )}
              </span>
            </div>

            {isModerator && (
              <div className="space-y-2 rounded-md border border-border bg-card p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Set delivery coordinates</p>
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
                <Button size="sm" variant="outline" className="w-full" onClick={() => void handleSaveCoordinates()} disabled={isSavingCoordinates || !latInput || !lngInput}>
                  {isSavingCoordinates ? <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" /> : <Save className="size-3.5" data-icon="inline-start" />}
                  Save coordinates
                </Button>
                <p className="text-[10px] text-muted-foreground">Use the real GPS coordinates of the exact delivery point - never a guess. Look the address up on a map first.</p>
              </div>
            )}
          </section>

          {isModerator && (
            <section className="space-y-3 rounded-lg border-2 border-primary/20 bg-primary/5 p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">Moderator actions</h4>
              <div className="flex flex-col gap-2">
                <Button size="sm" variant="outline" onClick={() => void handleRefresh()} disabled={!delivery.lalamoveOrderId || isRefreshing}>
                  {isRefreshing ? <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" /> : <RefreshCw className="size-3.5" data-icon="inline-start" />}
                  Refresh status
                </Button>
                <Button size="sm" variant="destructive" onClick={() => void handleCancel()} disabled={!delivery.lalamoveOrderId || isTerminal || isCancelling}>
                  {isCancelling ? <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" /> : <XCircle className="size-3.5" data-icon="inline-start" />}
                  Cancel booking
                </Button>
                {!delivery.lalamoveOrderId && <p className="text-[11px] text-muted-foreground">This order has not been booked with Lalamove yet.</p>}
              </div>
            </section>
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
