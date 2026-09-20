import { Calendar, HardHat, Loader2, PackageSearch, UserCheck, Wrench } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { assignBookingInstaller, getBookings, getInstallers, updateBookingStatus } from "@/api/admin"
import { formatDate, formatDateTime, fullName } from "@/admin/admin-format"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { formatPesos } from "@/lib/format-price"
import type { AdminBooking, BookingStatus, Installer } from "@/types/admin"

const STATUS_FILTERS = [
  { value: "PENDING", label: "Requested" },
  { value: "APPROVED", label: "Confirmed" },
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
]

function getStatusLabel(status: BookingStatus): string {
  switch (status) {
    case "PENDING":
      return "Requested"
    case "APPROVED":
      return "Confirmed"
    case "SCHEDULED":
      return "Scheduled"
    case "COMPLETED":
      return "Completed"
    case "CANCELLED":
      return "Cancelled"
    default:
      return status
  }
}

export function AdminInstallationRequestsPage() {
  useDocumentTitle("Installation Requests | PanelScan Admin")
  const { user } = useAuth()
  const isModerator = user?.role === "MODERATOR"
  const isOwner = user?.role === "OWNER"

  const [page, setPage] = useState(1)
  const [status, setStatus] = useState("")
  const [selectedBooking, setSelectedBooking] = useState<AdminBooking | null>(null)

  const requestsResource = useAdminResource(
    (signal) =>
      getBookings(
        {
          page,
          limit: 20,
          status: status || undefined,
          onlyOrders: true,
        },
        signal,
      ),
    [page, status],
  )

  const rows = requestsResource.data?.bookings ?? []

  // Keep selectedBooking in sync when resource reloads
  useEffect(() => {
    if (selectedBooking) {
      const fresh = rows.find((b) => b.id === selectedBooking.id)
      if (fresh) setSelectedBooking(fresh)
    }
  }, [rows, selectedBooking])

  // Count summaries for metrics
  const requestedCount = rows.filter((r) => r.status === "PENDING").length
  const scheduledCount = rows.filter((r) => r.status === "SCHEDULED" || r.status === "APPROVED").length
  const completedCount = rows.filter((r) => r.status === "COMPLETED").length

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Operations"
        title="Installation Requests"
        description={
          isOwner
            ? "Operational work queue for customer installation requests linked to orders (view-only)."
            : "Review customer installation requests, assign available installers, and manage schedules."
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Installation summary">
        <MetricCard label="Pending requests" value={requestsResource.isLoading ? "—" : requestedCount} isLoading={requestsResource.isLoading} />
        <MetricCard label="Confirmed / Scheduled" value={requestsResource.isLoading ? "—" : scheduledCount} isLoading={requestsResource.isLoading} />
        <MetricCard label="Completed installations" value={requestsResource.isLoading ? "—" : completedCount} isLoading={requestsResource.isLoading} />
      </section>

      <FilterBar hasActiveFilters={Boolean(status)} onClear={() => { setStatus(""); setPage(1) }}>
        <FilterSelect
          label="Status"
          value={status}
          allLabel="All statuses"
          options={STATUS_FILTERS}
          onChange={(value) => { setStatus(value); setPage(1) }}
        />
      </FilterBar>

      {requestsResource.error ? (
        <ErrorState message={requestsResource.error} onRetry={requestsResource.reload} />
      ) : (
        <>
          <DataTable
            caption="Customer installation requests linked to orders"
            isLoading={requestsResource.isLoading}
            rows={rows}
            getRowId={(row) => row.id}
            empty={
              <EmptyState
                icon={PackageSearch}
                title="No installation requests found"
                description="Orders where the customer selected 'Yes, I need installation' appear in this operational work queue."
              />
            }
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
                key: "customer",
                header: "Customer",
                cell: (row) => (
                  <div>
                    <span className="font-medium">{fullName(row.customer)}</span>
                    <p className="text-xs text-muted-foreground">{row.customer?.phone || row.customer?.email || "—"}</p>
                  </div>
                ),
              },
              {
                key: "preferredDate",
                header: "Preferred Date",
                secondary: true,
                cell: (row) => <span className="text-foreground">{formatDate(row.scheduledDate)}</span>,
              },
              {
                key: "status",
                header: "Status",
                cell: (row) => <StatusBadge status={row.status} label={getStatusLabel(row.status)} />,
              },
              {
                key: "installer",
                header: "Assigned Installer",
                cell: (row) =>
                  row.installer ? (
                    <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                      <UserCheck className="size-3.5 text-primary" aria-hidden="true" />
                      {row.installer.firstName} {row.installer.lastName}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">Not assigned</span>
                  ),
              },
            ]}
            rowAction={(row) => (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedBooking(row)}
                aria-label={`${isModerator ? "Manage" : "View"} installation request for ${row.order?.orderNumber ?? "order"}`}
              >
                {isModerator ? "Manage" : "View"}
              </Button>
            )}
          />
          <TablePagination
            pagination={requestsResource.data?.pagination ?? null}
            onPageChange={setPage}
            isLoading={requestsResource.isLoading}
          />
        </>
      )}

      <InstallationDetailSheet
        booking={selectedBooking}
        isModerator={isModerator}
        onClose={() => setSelectedBooking(null)}
        onUpdated={() => {
          requestsResource.reload()
        }}
      />
    </div>
  )
}

interface InstallationDetailSheetProps {
  booking: AdminBooking | null
  isModerator: boolean
  onClose: () => void
  onUpdated: () => void
}

function InstallationDetailSheet({ booking, isModerator, onClose, onUpdated }: InstallationDetailSheetProps) {
  const [installers, setInstallers] = useState<Installer[]>([])
  const [isLoadingInstallers, setIsLoadingInstallers] = useState(false)

  // Moderator edit state
  const [selectedInstallerId, setSelectedInstallerId] = useState<string>("")
  const [selectedStatus, setSelectedStatus] = useState<BookingStatus>("PENDING")
  const [scheduledDateInput, setScheduledDateInput] = useState<string>("")
  const [isSaving, setIsSaving] = useState(false)

  // Fetch available installers when Moderator opens the sheet
  useEffect(() => {
    if (!booking || !isModerator) return

    let cancelled = false
    setIsLoadingInstallers(true)
    getInstallers({ limit: 100 })
      .then((res) => {
        if (!cancelled) {
          setInstallers(res.installers)
        }
      })
      .catch((err) => {
        console.error("Failed to load installers", err)
      })
      .finally(() => {
        if (!cancelled) setIsLoadingInstallers(false)
      })

    return () => {
      cancelled = true
    }
  }, [booking, isModerator])

  // Sync form inputs with current booking
  useEffect(() => {
    if (booking) {
      setSelectedInstallerId(booking.installerId ?? "none")
      setSelectedStatus(booking.status)
      if (booking.scheduledDate) {
        const d = new Date(booking.scheduledDate)
        if (!Number.isNaN(d.getTime())) {
          setScheduledDateInput(d.toISOString().slice(0, 10))
        } else {
          setScheduledDateInput("")
        }
      } else {
        setScheduledDateInput("")
      }
    }
  }, [booking])

  if (!booking) return null

  const orderItems = booking.order?.items ?? []

  async function handleSaveModeratorChanges() {
    if (!booking) return
    setIsSaving(true)

    try {
      // 1. If installer changed
      const currentInstallerId = booking.installerId ?? "none"
      if (selectedInstallerId !== currentInstallerId && selectedInstallerId !== "none") {
        await assignBookingInstaller(booking.id, selectedInstallerId)
      }

      // 2. If status or date changed
      const dateChanged =
        scheduledDateInput &&
        new Date(scheduledDateInput).toISOString().slice(0, 10) !==
          new Date(booking.scheduledDate).toISOString().slice(0, 10)
      const statusChanged = selectedStatus !== booking.status

      if (statusChanged || dateChanged) {
        await updateBookingStatus(
          booking.id,
          selectedStatus,
          dateChanged ? new Date(scheduledDateInput).toISOString() : undefined,
        )
      }

      toast.success("Installation request updated successfully.")
      onUpdated()
      onClose()
    } catch (error) {
      toast.error("Could not update installation request", {
        description: getAdminErrorMessage(error),
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Sheet open={Boolean(booking)} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent className="admin-surface sm:max-w-xl overflow-y-auto w-full p-6">
        <SheetHeader className="pb-4 border-b border-border space-y-1">
          <div className="flex items-center gap-2">
            <Wrench className="size-5 text-primary" aria-hidden="true" />
            <SheetTitle className="text-lg font-semibold">Installation Request</SheetTitle>
          </div>
          <SheetDescription className="text-xs text-muted-foreground">
            Order <span className="font-semibold text-foreground">{booking.order?.orderNumber ?? "—"}</span> • Placed by {fullName(booking.customer)}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 pt-4 text-sm">
          {/* Linked Order & Customer Summary */}
          <section className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Order & Customer</h4>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground block">Order number</span>
                <span className="font-medium text-foreground">{booking.order?.orderNumber ?? "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Customer</span>
                <span className="font-medium text-foreground">{fullName(booking.customer)}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Email</span>
                <span className="font-medium text-foreground break-all">{booking.customer?.email ?? "—"}</span>
              </div>
              <div>
                <span className="text-muted-foreground block">Phone</span>
                <span className="font-medium text-foreground">{booking.customer?.phone ?? "—"}</span>
              </div>
            </div>
          </section>

          {/* Ordered Products (Read-Only from Linked Order) */}
          <section className="space-y-3 rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Ordered Products ({orderItems.length})
              </h4>
              <span className="text-[11px] text-muted-foreground font-medium">Read-only from order</span>
            </div>

            {orderItems.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">No products recorded on this order.</p>
            ) : (
              <div className="divide-y divide-border border-y border-border">
                {orderItems.map((item) => (
                  <div key={item.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <p className="font-medium text-foreground truncate">{item.productName}</p>
                      <p className="text-muted-foreground">
                        Quantity: <span className="font-medium text-foreground">{item.quantity}</span>
                        {item.unitPrice !== undefined && (
                          <> • {formatPesos(Number(item.unitPrice))} each</>
                        )}
                      </p>
                    </div>
                    {item.lineTotal !== undefined && (
                      <span className="font-semibold text-foreground whitespace-nowrap">
                        {formatPesos(Number(item.lineTotal))}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              Products are read directly from the customer order and cannot be modified here.
            </p>
          </section>

          {/* Installation Details */}
          <section className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Installation Details</h4>
            <div className="space-y-2.5 text-xs">
              <div>
                <span className="text-muted-foreground block mb-0.5">Preferred installation date</span>
                <span className="font-medium text-foreground inline-flex items-center gap-1.5">
                  <Calendar className="size-3.5 text-primary" aria-hidden="true" />
                  {formatDate(booking.scheduledDate)}
                </span>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Selected by the customer during checkout.
                </p>
              </div>

              <div>
                <span className="text-muted-foreground block mb-0.5">Installation address</span>
                <p className="font-medium text-foreground bg-background/60 p-2 rounded border border-border">
                  {booking.address}
                </p>
              </div>

              <div>
                <span className="text-muted-foreground block mb-0.5">Installation notes</span>
                <p className="font-medium text-foreground bg-background/60 p-2 rounded border border-border italic">
                  {booking.notes || "None provided"}
                </p>
              </div>

              <div>
                <span className="text-muted-foreground block mb-1">Current status</span>
                <StatusBadge status={booking.status} label={getStatusLabel(booking.status)} />
              </div>
            </div>
          </section>

          {/* Moderator Assignment & Management Section */}
          {isModerator ? (
            <section className="space-y-4 rounded-lg border-2 border-primary/20 bg-primary/5 p-4">
              <div className="flex items-center gap-2">
                <HardHat className="size-4 text-primary" aria-hidden="true" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Moderator Controls
                </h4>
              </div>

              {/* Assign Installer */}
              <div className="space-y-1.5">
                <Label htmlFor="installer-select" className="text-xs font-medium">
                  Assigned installer
                </Label>
                {isLoadingInstallers ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
                    <Loader2 className="size-3.5 animate-spin" /> Loading installers...
                  </div>
                ) : (
                  <Select
                    value={selectedInstallerId}
                    onValueChange={(val) => setSelectedInstallerId(val)}
                  >
                    <SelectTrigger id="installer-select" className="h-9 text-xs w-full bg-background">
                      <SelectValue placeholder="Select installer..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Not assigned</SelectItem>
                      {installers.map((inst) => {
                        const isCurrent = inst.id === booking.installerId
                        // Inactive installers cannot be selected for new jobs, but current assigned remain visible
                        const disabled = !inst.isActive && !isCurrent
                        return (
                          <SelectItem key={inst.id} value={inst.id} disabled={disabled}>
                            {inst.firstName} {inst.lastName} — {inst.specialty || "Installer"}{" "}
                            {inst.isActive ? "(Available)" : "(Inactive)"}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Only available installers from the Installers module can be selected.
                </p>
              </div>

              {/* Confirmed Schedule Date */}
              <div className="space-y-1.5">
                <Label htmlFor="schedule-date" className="text-xs font-medium">
                  Confirmed schedule date
                </Label>
                <Input
                  id="schedule-date"
                  type="date"
                  className="h-9 text-xs bg-background"
                  value={scheduledDateInput}
                  onChange={(e) => setScheduledDateInput(e.target.value)}
                />
                <p className="text-[11px] text-muted-foreground">
                  The final schedule will be confirmed by the iDISENYO team.
                </p>
              </div>

              {/* Installation Status */}
              <div className="space-y-1.5">
                <Label htmlFor="status-select" className="text-xs font-medium">
                  Installation status
                </Label>
                <Select
                  value={selectedStatus}
                  onValueChange={(val) => setSelectedStatus(val as BookingStatus)}
                >
                  <SelectTrigger id="status-select" className="h-9 text-xs w-full bg-background">
                    <SelectValue placeholder="Select status..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PENDING">Requested (Pending)</SelectItem>
                    <SelectItem value="APPROVED">Confirmed</SelectItem>
                    <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                    <SelectItem value="COMPLETED">Completed</SelectItem>
                    <SelectItem value="CANCELLED">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={onClose} disabled={isSaving}>
                  Close
                </Button>
                <Button size="sm" onClick={() => void handleSaveModeratorChanges()} disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" />
                      Saving...
                    </>
                  ) : (
                    "Save changes"
                  )}
                </Button>
              </div>
            </section>
          ) : (
            /* Owner Read-Only View */
            <section className="space-y-3 rounded-lg border border-border bg-muted/20 p-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Assignment & Schedule (View Only)
              </h4>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground block">Assigned installer</span>
                  <span className="font-medium text-foreground">
                    {booking.installer
                      ? `${booking.installer.firstName} ${booking.installer.lastName}`
                      : "Not assigned"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Confirmed schedule</span>
                  <span className="font-medium text-foreground">{formatDate(booking.scheduledDate)}</span>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground italic">
                Owner role has view-only access to installation operations.
              </p>
            </section>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
