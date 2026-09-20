import { Loader2, PackageSearch } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import {
  approveDeliveryRequest,
  approveOrder,
  arrangeDelivery,
  declineDeliveryRequest,
  getSalesReport,
  updateOrderStatus,
} from "@/api/admin"
import { formatCount, formatDateTime, formatMoney } from "@/admin/admin-format"
import { getAdminErrorMessage, useAdminResource } from "@/admin/use-admin-resource"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { DataTable, TablePagination } from "@/components/admin/data-table"
import { EmptyState, ErrorState } from "@/components/admin/empty-state"
import { FilterBar, FilterSelect } from "@/components/admin/filter-bar"
import { MetricCard } from "@/components/admin/metric-card"
import { StatusBadge } from "@/components/admin/status-badge"
import { StatusBreakdownBars } from "@/components/admin/trend-chart"
import { useAuth } from "@/auth/use-auth"
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useDocumentTitle } from "@/hooks/use-document-title"
import type { OrderReportRow } from "@/types/admin"

const ORDER_STATUSES = ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"]
const TRANSITIONABLE = ["PENDING", "PROCESSING", "SHIPPED"]

/**
 * Sales Review (owner) and Sales Management (moderator) show sales orders,
 * revenue metrics, and order payment/delivery/fulfillment statuses.
 */
export function AdminSalesPage() {
  useDocumentTitle("Sales | PanelScan Admin")
  const { user } = useAuth()
  const isOwner = user?.role === "OWNER"
  const isModerator = user?.role === "MODERATOR"
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState("")
  const [pendingId, setPendingId] = useState<string | null>(null)
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [arrangingId, setArrangingId] = useState<string | null>(null)
  const [acceptingDeliveryId, setAcceptingDeliveryId] = useState<string | null>(null)
  const [decliningOrder, setDecliningOrder] = useState<OrderReportRow | null>(null)
  const [declineReason, setDeclineReason] = useState("")
  const [isSubmittingDecline, setIsSubmittingDecline] = useState(false)

  const report = useAdminResource((signal) => getSalesReport({ page, limit: 20, status: status || undefined }, signal), [page, status])
  const summary = report.data?.summary
  const orders = report.data?.orders ?? []

  async function handleAcceptDeliveryRequest(order: OrderReportRow) {
    setAcceptingDeliveryId(order.id)
    try {
      await approveDeliveryRequest(order.id)
      toast.success(`Delivery request approved for ${order.orderNumber}. Customer may now proceed with delivery.`)
      report.reload()
    } catch (error) {
      toast.error("Could not approve delivery request", { description: getAdminErrorMessage(error) })
    } finally {
      setAcceptingDeliveryId(null)
    }
  }

  async function handleConfirmDecline() {
    if (!decliningOrder) return
    setIsSubmittingDecline(true)
    try {
      await declineDeliveryRequest(decliningOrder.id, declineReason.trim() || undefined)
      toast.success(`Delivery request declined for ${decliningOrder.orderNumber}.`)
      setDecliningOrder(null)
      setDeclineReason("")
      report.reload()
    } catch (error) {
      toast.error("Could not decline delivery request", { description: getAdminErrorMessage(error) })
    } finally {
      setIsSubmittingDecline(false)
    }
  }

  async function handleStatusChange(order: OrderReportRow, nextStatus: string) {
    setPendingId(order.id)
    try {
      await updateOrderStatus(order.id, nextStatus)
      toast.success(`${order.orderNumber} is now ${nextStatus.toLowerCase()}.`)
      report.reload()
    } catch (error) {
      toast.error("Status not updated", { description: getAdminErrorMessage(error) })
    } finally {
      setPendingId(null)
    }
  }

  async function handleApprove(order: OrderReportRow) {
    setApprovingId(order.id)
    try {
      await approveOrder(order.id)
      toast.success(`${order.orderNumber} approved. Customer can now proceed with payment.`)
      report.reload()
    } catch (error) {
      toast.error("Order not approved", { description: getAdminErrorMessage(error) })
    } finally {
      setApprovingId(null)
    }
  }

  async function handleArrangeDelivery(order: OrderReportRow) {
    setArrangingId(order.id)
    try {
      await arrangeDelivery(order.id)
      toast.success(`Delivery arranged for ${order.orderNumber}. Lalamove dispatch is being prepared.`)
      report.reload()
    } catch (error) {
      toast.error("Could not arrange delivery", { description: getAdminErrorMessage(error) })
    } finally {
      setArrangingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow={isOwner ? "Sales review" : "Sales management"}
        title="Orders and revenue"
        description="Every order recorded by PanelScan, with revenue summarised across the current filter."
      />

      {report.error ? <ErrorState message={report.error} onRetry={report.reload} /> : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Sales summary">
            <MetricCard label="Total revenue" value={formatMoney(summary?.totalRevenue)} isLoading={report.isLoading} restricted={!report.isLoading && summary?.totalRevenue === undefined} />
            <MetricCard label="Average order value" value={formatMoney(summary?.averageOrderValue)} isLoading={report.isLoading} restricted={!report.isLoading && summary?.averageOrderValue === undefined} />
            <MetricCard label="Orders" value={formatCount(summary?.totalOrders)} isLoading={report.isLoading} />
            <div className="surface-card p-4 sm:col-span-2 xl:col-span-1">
              <StatusBreakdownBars title="Order mix" items={summary?.ordersByStatus ?? []} />
            </div>
          </section>

          <FilterBar hasActiveFilters={Boolean(status)} onClear={() => { setStatus(""); setPage(1) }}>
            <FilterSelect label="Status" value={status} allLabel="All statuses" options={ORDER_STATUSES.map((value) => ({ value, label: value.charAt(0) + value.slice(1).toLowerCase() }))} onChange={(value) => { setStatus(value); setPage(1) }} />
          </FilterBar>

          <div key={`${status}|${page}`} className="motion-swap">
          <DataTable
            caption="Orders with customer, status, and amount"
            isLoading={report.isLoading}
            rows={orders}
            getRowId={(row) => row.id}
            empty={<EmptyState icon={PackageSearch} title="No orders match this view" description="Orders placed from the PanelScan storefront appear here as soon as they are created." />}
            columns={[
              { key: "order", header: "Order", primary: true, cell: (row) => <span className="font-medium">{row.orderNumber}</span> },
              { key: "customer", header: "Customer", cell: (row) => row.customerName },
              { key: "date", header: "Placed", secondary: true, cell: (row) => <span className="text-muted-foreground">{formatDateTime(row.createdAt)}</span> },
              { key: "items", header: "Items", numeric: true, secondary: true, cell: (row) => formatCount(row.itemCount) },
              { key: "amount", header: "Amount", numeric: true, cell: (row) => formatMoney(row.totalAmount) },
              {
                key: "approval",
                header: "Approval",
                cell: (row) =>
                  row.moderatorApproved ? (
                    <StatusBadge status="APPROVED" label="Approved" />
                  ) : (
                    <StatusBadge status="PENDING" label="Awaiting Approval" />
                  ),
              },
              {
                key: "payment",
                header: "Payment Status",
                cell: (row) => {
                  const paymentStatus = row.paymentStatus ?? (row.isPaid ? "PAID" : "PENDING")
                  return <StatusBadge status={paymentStatus} />
                },
              },
              {
                key: "delivery",
                header: "Delivery",
                cell: (row) => {
                  if (row.deliveryApprovalStatus === "PENDING_APPROVAL") {
                    return (
                      <div className="flex flex-col gap-0.5">
                        <StatusBadge status="PENDING" label="Awaiting Approval" />
                        {row.deliveryRequestedAt && (
                          <span className="text-[11px] text-muted-foreground">
                            Req: {formatDateTime(row.deliveryRequestedAt)}
                          </span>
                        )}
                        {row.shippingAddress && (
                          <span className="text-[11px] text-muted-foreground truncate max-w-[140px]" title={row.shippingAddress}>
                            {row.shippingAddress}
                          </span>
                        )}
                      </div>
                    )
                  }
                  if (row.deliveryApprovalStatus === "DECLINED") {
                    return (
                      <div className="flex flex-col gap-0.5">
                        <StatusBadge status="CANCELLED" label="Declined" />
                        {row.deliveryDeclineReason && (
                          <span className="text-[11px] text-destructive truncate max-w-[140px]" title={row.deliveryDeclineReason}>
                            {row.deliveryDeclineReason}
                          </span>
                        )}
                      </div>
                    )
                  }
                  if (row.deliveryApprovalStatus === "APPROVED") {
                    if (row.deliveryStatus === "PREPARING") {
                      return <StatusBadge status="PREPARING" label="Preparing" />
                    }
                    if (row.deliveryStatus === "DELIVERED") {
                      return <StatusBadge status="DELIVERED" label="Delivered" />
                    }
                    if (row.deliveryStatus && row.deliveryStatus !== "NOT_REQUESTED" && row.deliveryStatus !== "NOT_SCHEDULED") {
                      return <StatusBadge status={row.deliveryStatus} label="In transit" />
                    }
                    return <StatusBadge status="APPROVED" label="Approved" />
                  }
                  return <span className="text-xs text-muted-foreground">Not requested</span>
                },
              },
              { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
            ]}
            rowAction={(row) => {
              if (row.status === "CANCELLED") {
                return <span className="text-xs text-muted-foreground">Final</span>
              }
              if (!row.moderatorApproved) {
                if (isModerator) {
                  return (
                    <Button
                      size="sm"
                      className="h-7 px-2.5 text-xs font-medium"
                      onClick={() => void handleApprove(row)}
                      disabled={approvingId === row.id}
                    >
                      {approvingId === row.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        "Approve"
                      )}
                    </Button>
                  )
                }
                return <span className="text-xs text-muted-foreground italic">Awaiting approval</span>
              }

              // Delivery request awaiting Moderator / Owner approval
              if (row.deliveryApprovalStatus === "PENDING_APPROVAL" && (isModerator || isOwner)) {
                return (
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      size="sm"
                      className="h-7 px-2.5 text-xs font-medium"
                      onClick={() => void handleAcceptDeliveryRequest(row)}
                      disabled={acceptingDeliveryId === row.id}
                    >
                      {acceptingDeliveryId === row.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        "Accept"
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2.5 text-xs font-medium border-destructive/40 text-destructive hover:bg-destructive/10"
                      onClick={() => {
                        setDecliningOrder(row)
                        setDeclineReason("")
                      }}
                      disabled={acceptingDeliveryId === row.id}
                    >
                      Decline
                    </Button>
                  </div>
                )
              }

              // Eligible for delivery: approved, paid, not cancelled, delivery approved, and not already arranged
              const isDeliveryEligible =
                row.moderatorApproved &&
                row.isPaid &&
                row.deliveryApprovalStatus === "APPROVED" &&
                (!row.deliveryStatus || row.deliveryStatus === "NOT_REQUESTED" || row.deliveryStatus === "NOT_SCHEDULED")

              return (
                <div className="flex items-center justify-end gap-2">
                  {isDeliveryEligible && (isModerator || isOwner) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs font-medium border-primary/40 text-primary hover:bg-primary/10"
                      onClick={() => void handleArrangeDelivery(row)}
                      disabled={arrangingId === row.id}
                    >
                      {arrangingId === row.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        "Arrange Delivery"
                      )}
                    </Button>
                  )}
                  {TRANSITIONABLE.includes(row.status) && (
                    <Select value="" onValueChange={(next) => void handleStatusChange(row, next)} disabled={pendingId === row.id}>
                      <SelectTrigger size="sm" className="h-7 w-28 text-xs" aria-label={`Update status for ${row.orderNumber}`}><SelectValue placeholder="Update" /></SelectTrigger>
                      <SelectContent>{ORDER_STATUSES.filter((value) => value !== row.status).map((value) => <SelectItem key={value} value={value}>{value.charAt(0) + value.slice(1).toLowerCase()}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                  {!TRANSITIONABLE.includes(row.status) && !isDeliveryEligible && (
                    <span className="text-xs text-muted-foreground">Final</span>
                  )}
                </div>
              )
            }}
          />
          </div>

          <TablePagination pagination={report.data?.pagination ?? null} onPageChange={setPage} isLoading={report.isLoading} />

          <p className="text-xs leading-5 text-muted-foreground">Fulfilment status is set here manually. Payment confirmation is recorded separately by the payment provider webhook and is never changed from this screen.</p>
        </>
      )}

      <AlertDialog open={Boolean(decliningOrder)} onOpenChange={(open) => { if (!open) setDecliningOrder(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Decline delivery request?</AlertDialogTitle>
            <AlertDialogDescription>
              Decline the delivery request for order <strong>{decliningOrder?.orderNumber}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-2 text-sm">
            <div className="rounded-lg bg-secondary/50 p-3 text-xs space-y-1">
              <div><span className="font-semibold text-foreground">Customer:</span> {decliningOrder?.customerName}</div>
              <div><span className="font-semibold text-foreground">Order Number:</span> {decliningOrder?.orderNumber}</div>
              <div><span className="font-semibold text-foreground">Delivery Address:</span> {decliningOrder?.shippingAddress}</div>
              {decliningOrder?.deliveryRequestedAt && (
                <div><span className="font-semibold text-foreground">Request Date:</span> {formatDateTime(decliningOrder.deliveryRequestedAt)}</div>
              )}
              <div><span className="font-semibold text-foreground">Current Status:</span> Awaiting approval</div>
            </div>
            <div>
              <label htmlFor="decline-reason" className="block text-xs font-medium text-foreground mb-1.5">
                Reason for decline (optional)
              </label>
              <Textarea
                id="decline-reason"
                placeholder="Provide a reason to help the customer adjust their delivery request..."
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmittingDecline}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => void handleConfirmDecline()}
              disabled={isSubmittingDecline}
            >
              {isSubmittingDecline && <Loader2 className="size-3 animate-spin mr-1.5" aria-hidden="true" />}
              Decline request
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
