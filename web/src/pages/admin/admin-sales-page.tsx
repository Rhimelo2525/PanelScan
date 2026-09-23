import { Eye, Loader2, PackageSearch } from "lucide-react"
import { useState } from "react"
import type { ReactNode } from "react"
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
import { OrderItemsCell } from "@/components/admin/order-items-cell"
import { StatusBadge } from "@/components/admin/status-badge"
import { StatusBreakdownBars } from "@/components/admin/trend-chart"
import { ProductImage } from "@/components/products/product-image"
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
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { useDocumentTitle } from "@/hooks/use-document-title"
import type { OrderReportRow } from "@/types/admin"

const ORDER_STATUSES = ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"]
const TRANSITIONABLE = ["PENDING", "PROCESSING", "SHIPPED"]

/** Shared by the table's Delivery cell and the details sheet, so the two never drift out of sync. */
function deliveryStatusContent(row: OrderReportRow, { truncateAddress }: { truncateAddress: boolean }): ReactNode {
  if (row.deliveryApprovalStatus === "PENDING_APPROVAL") {
    return (
      <div className="flex flex-col gap-0.5">
        <StatusBadge status="PENDING" label="Awaiting Approval" />
        {row.deliveryRequestedAt && <span className="text-[11px] text-muted-foreground">Req: {formatDateTime(row.deliveryRequestedAt)}</span>}
        {row.shippingAddress && (
          <span className={truncateAddress ? "text-[11px] text-muted-foreground truncate max-w-[140px]" : "text-[11px] text-muted-foreground"} title={truncateAddress ? row.shippingAddress : undefined}>
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
          <span className={truncateAddress ? "text-[11px] text-destructive truncate max-w-[140px]" : "text-[11px] text-destructive"} title={truncateAddress ? row.deliveryDeclineReason : undefined}>
            {row.deliveryDeclineReason}
          </span>
        )}
      </div>
    )
  }
  if (row.deliveryApprovalStatus === "APPROVED") {
    if (row.deliveryStatus === "PREPARING") return <StatusBadge status="PREPARING" label="Preparing" />
    if (row.deliveryStatus === "DELIVERED") return <StatusBadge status="DELIVERED" label="Delivered" />
    if (row.deliveryStatus && row.deliveryStatus !== "NOT_REQUESTED" && row.deliveryStatus !== "NOT_SCHEDULED") {
      return <StatusBadge status={row.deliveryStatus} label="In transit" />
    }
    return <StatusBadge status="APPROVED" label="Approved" />
  }
  return <span className="text-xs text-muted-foreground">Not requested</span>
}

/** Eligible for arranging delivery: approved, paid, not cancelled, delivery approved, and not already arranged. */
function isDeliveryEligibleForRow(row: OrderReportRow): boolean {
  return (
    Boolean(row.moderatorApproved) &&
    Boolean(row.isPaid) &&
    row.deliveryApprovalStatus === "APPROVED" &&
    (!row.deliveryStatus || row.deliveryStatus === "NOT_REQUESTED" || row.deliveryStatus === "NOT_SCHEDULED")
  )
}

/**
 * Sales Review (owner) and Sales Management (moderator) show sales orders,
 * revenue metrics, and order payment/delivery/fulfillment statuses.
 * MODERATOR can act (approve, accept/decline delivery, arrange delivery,
 * change order status); OWNER is view-only throughout - never shown an
 * action control, only the same information.
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
  const [detailsOrder, setDetailsOrder] = useState<OrderReportRow | null>(null)

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

          <div key={`${status}|${page}`} className="motion-swap admin-table-roomy">
          <DataTable
            caption="Orders with customer, products, status, and amount"
            isLoading={report.isLoading}
            rows={orders}
            getRowId={(row) => row.id}
            empty={<EmptyState icon={PackageSearch} title="No orders match this view" description="Orders placed from the PanelScan storefront appear here as soon as they are created." />}
            columns={[
              {
                key: "order",
                header: "Order",
                primary: true,
                cell: (row) => (
                  <button
                    type="button"
                    onClick={() => setDetailsOrder(row)}
                    className="group inline-flex items-center gap-1.5 font-medium hover:text-primary focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {row.orderNumber}
                    <Eye className="size-3.5 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
                  </button>
                ),
              },
              { key: "customer", header: "Customer", cell: (row) => row.customerName },
              { key: "date", header: "Placed", secondary: true, cell: (row) => <span className="text-muted-foreground">{formatDateTime(row.createdAt)}</span> },
              { key: "items", header: "Items", cell: (row) => <OrderItemsCell items={row.items} /> },
              { key: "amount", header: "Amount", numeric: true, cell: (row) => formatMoney(row.totalAmount) },
              {
                key: "approval",
                header: "Approval",
                cell: (row) => (
                  <div className="flex flex-nowrap items-center gap-2">
                    {row.moderatorApproved ? (
                      <StatusBadge status="APPROVED" label="Approved" />
                    ) : (
                      <StatusBadge status="PENDING" label="Awaiting Approval" />
                    )}
                    {!row.moderatorApproved && row.status !== "CANCELLED" && isModerator && (
                      <Button
                        size="sm"
                        className="h-6 px-2 text-[11px] font-medium"
                        onClick={() => void handleApprove(row)}
                        disabled={approvingId === row.id}
                      >
                        {approvingId === row.id ? <Loader2 className="size-3 animate-spin" /> : "Approve"}
                      </Button>
                    )}
                  </div>
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
                cell: (row) => (
                  <div className="flex flex-nowrap items-center gap-2">
                    {deliveryStatusContent(row, { truncateAddress: true })}
                    {row.deliveryApprovalStatus === "PENDING_APPROVAL" && isModerator && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                          size="sm"
                          className="h-6 px-2 text-[11px] font-medium"
                          onClick={() => void handleAcceptDeliveryRequest(row)}
                          disabled={acceptingDeliveryId === row.id}
                        >
                          {acceptingDeliveryId === row.id ? <Loader2 className="size-3 animate-spin" /> : "Accept"}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[11px] font-medium border-destructive/40 text-destructive hover:bg-destructive/10"
                          onClick={() => {
                            setDecliningOrder(row)
                            setDeclineReason("")
                          }}
                          disabled={acceptingDeliveryId === row.id}
                        >
                          Decline
                        </Button>
                      </div>
                    )}
                    {isDeliveryEligibleForRow(row) && isModerator && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-[11px] font-medium border-primary/40 text-primary hover:bg-primary/10"
                        onClick={() => void handleArrangeDelivery(row)}
                        disabled={arrangingId === row.id}
                      >
                        {arrangingId === row.id ? <Loader2 className="size-3 animate-spin" /> : "Arrange Delivery"}
                      </Button>
                    )}
                  </div>
                ),
              },
              {
                key: "status",
                header: "Status",
                cell: (row) => (
                  <div className="flex flex-nowrap items-center gap-2">
                    <StatusBadge status={row.status} />
                    {isModerator && TRANSITIONABLE.includes(row.status) && (
                      <Select value="" onValueChange={(next) => void handleStatusChange(row, next)} disabled={pendingId === row.id}>
                        <SelectTrigger size="sm" className="h-6 w-24 shrink-0 text-[11px]" aria-label={`Update status for ${row.orderNumber}`}><SelectValue placeholder="Update" /></SelectTrigger>
                        <SelectContent>{ORDER_STATUSES.filter((value) => value !== row.status).map((value) => <SelectItem key={value} value={value}>{value.charAt(0) + value.slice(1).toLowerCase()}</SelectItem>)}</SelectContent>
                      </Select>
                    )}
                    {(!isModerator || !TRANSITIONABLE.includes(row.status)) && (row.status === "CANCELLED" || row.status === "DELIVERED") && (
                      <span className="text-[11px] text-muted-foreground">Final</span>
                    )}
                  </div>
                ),
              },
            ]}
          />
          </div>

          <TablePagination pagination={report.data?.pagination ?? null} onPageChange={setPage} isLoading={report.isLoading} />

          <p className="text-xs leading-5 text-muted-foreground">Fulfilment status is set here manually. Payment confirmation is recorded separately by the payment provider webhook and is never changed from this screen.</p>
        </>
      )}

      <Sheet open={Boolean(detailsOrder)} onOpenChange={(open) => { if (!open) setDetailsOrder(null) }}>
        <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-lg">
          {detailsOrder && (
            <>
              <SheetHeader>
                <SheetTitle>{detailsOrder.orderNumber}</SheetTitle>
                <SheetDescription>
                  Placed {formatDateTime(detailsOrder.createdAt)} by {detailsOrder.customerName}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-6 px-4 pb-6">
                <section>
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Products</h3>
                  <div className="space-y-4">
                    {detailsOrder.items.length === 0 && <p className="text-sm text-muted-foreground">No items on this order.</p>}
                    {detailsOrder.items.map((item) => (
                      <div key={item.id} className="flex items-center gap-3">
                        <ProductImage image={item.productImage} productName={item.productName} categorySlug="cart-material" className="size-14 shrink-0 rounded-lg" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground">{item.productName}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.quantity} {item.quantity === 1 ? "pc" : "pcs"}
                            {item.unitPrice !== undefined && <> · {formatMoney(item.unitPrice)} each</>}
                          </p>
                        </div>
                        {item.lineTotal !== undefined && <p className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(item.lineTotal)}</p>}
                      </div>
                    ))}
                  </div>
                  <Separator className="my-4" />
                  <div className="flex items-center justify-between text-sm font-semibold">
                    <span>Order total</span>
                    <span className="tabular-nums">{formatMoney(detailsOrder.totalAmount)}</span>
                  </div>
                </section>

                <section className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Approval</h3>
                    <div className="flex flex-col items-start gap-2">
                      {detailsOrder.moderatorApproved ? (
                        <StatusBadge status="APPROVED" label="Approved" />
                      ) : (
                        <StatusBadge status="PENDING" label="Awaiting Approval" />
                      )}
                      {!detailsOrder.moderatorApproved && detailsOrder.status !== "CANCELLED" && isModerator && (
                        <Button size="sm" className="h-7 px-2.5 text-xs font-medium" onClick={() => void handleApprove(detailsOrder)} disabled={approvingId === detailsOrder.id}>
                          {approvingId === detailsOrder.id ? <Loader2 className="size-3 animate-spin" /> : "Approve"}
                        </Button>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payment status</h3>
                    <StatusBadge status={detailsOrder.paymentStatus ?? (detailsOrder.isPaid ? "PAID" : "PENDING")} />
                  </div>

                  <div className="sm:col-span-2">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Delivery</h3>
                    <div className="flex flex-col items-start gap-2">
                      {deliveryStatusContent(detailsOrder, { truncateAddress: false })}
                      {detailsOrder.deliveryApprovalStatus === "PENDING_APPROVAL" && isModerator && (
                        <div className="flex flex-wrap items-center gap-2">
                          <Button size="sm" className="h-7 px-2.5 text-xs font-medium" onClick={() => void handleAcceptDeliveryRequest(detailsOrder)} disabled={acceptingDeliveryId === detailsOrder.id}>
                            {acceptingDeliveryId === detailsOrder.id ? <Loader2 className="size-3 animate-spin" /> : "Accept"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 text-xs font-medium border-destructive/40 text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              setDecliningOrder(detailsOrder)
                              setDeclineReason("")
                            }}
                            disabled={acceptingDeliveryId === detailsOrder.id}
                          >
                            Decline
                          </Button>
                        </div>
                      )}
                      {isDeliveryEligibleForRow(detailsOrder) && isModerator && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 text-xs font-medium border-primary/40 text-primary hover:bg-primary/10"
                          onClick={() => void handleArrangeDelivery(detailsOrder)}
                          disabled={arrangingId === detailsOrder.id}
                        >
                          {arrangingId === detailsOrder.id ? <Loader2 className="size-3 animate-spin" /> : "Arrange Delivery"}
                        </Button>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Order status</h3>
                    <div className="flex flex-col items-start gap-2">
                      <StatusBadge status={detailsOrder.status} />
                      {isModerator && TRANSITIONABLE.includes(detailsOrder.status) && (
                        <Select value="" onValueChange={(next) => void handleStatusChange(detailsOrder, next)} disabled={pendingId === detailsOrder.id}>
                          <SelectTrigger size="sm" className="h-7 w-32 text-xs" aria-label={`Update status for ${detailsOrder.orderNumber}`}><SelectValue placeholder="Update" /></SelectTrigger>
                          <SelectContent>{ORDER_STATUSES.filter((value) => value !== detailsOrder.status).map((value) => <SelectItem key={value} value={value}>{value.charAt(0) + value.slice(1).toLowerCase()}</SelectItem>)}</SelectContent>
                        </Select>
                      )}
                    </div>
                  </div>
                </section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

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
