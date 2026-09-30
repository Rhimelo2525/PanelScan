import { ExternalLink, Eye, Loader2, MapPin, PackageSearch } from "lucide-react"
import { useState } from "react"
import type { ReactNode } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"

import { approveOrder, getSalesReport, updateOrderStatus } from "@/api/admin"
import { useConfirm } from "@/components/confirm/use-confirm"
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
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { formatPhoneForDisplay } from "@/lib/phone"
import { getDeliveryStatusLabel } from "@/lib/delivery/status-label"
import type { OrderReportRow } from "@/types/admin"

const ORDER_STATUSES = ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"]
const TRANSITIONABLE = ["PENDING", "PROCESSING", "SHIPPED"]

/** Shared by the table's Delivery cell and the details sheet, so the two never drift out of sync. */
function deliveryStatusContent(row: OrderReportRow): ReactNode {
  if (row.status === "CANCELLED" && !row.lalamoveBookingId) return <StatusBadge status="CANCELLED" label="Cancelled" />
  const status = row.deliveryStatus
  if (!status) return <span className="text-xs text-muted-foreground">No delivery record</span>
  return <StatusBadge status={status} label={status === "READY_TO_BOOK" ? "Paid — Ready to book" : getDeliveryStatusLabel(status)} />
}

/** The moderator's next delivery step for this order, done on Deliveries: get the shipping quote, or book Lalamove once paid. */
function deliveryNextStep(row: OrderReportRow): string | null {
  if (row.status === "CANCELLED" || row.lalamoveBookingId) return null
  if (row.deliveryStatus === "AWAITING_QUOTE") return "Get quote in Deliveries"
  if (row.deliveryStatus === "READY_TO_BOOK" || row.deliveryStatus === "BOOKING_FAILED") return "Book in Deliveries"
  return null
}

function DeliveriesLink({ row, compact }: { row: OrderReportRow; compact: boolean }) {
  const label = deliveryNextStep(row)
  if (!label) return null
  const to = row.deliveryId ? `/admin/deliveries?delivery=${row.deliveryId}` : `/admin/deliveries?search=${encodeURIComponent(row.orderNumber)}`
  return (
    <Button size="sm" variant="outline" className={compact ? "h-6 px-2 text-[11px] font-medium border-primary/40 text-primary hover:bg-primary/10" : "h-7 px-2.5 text-xs font-medium border-primary/40 text-primary hover:bg-primary/10"} asChild>
      <Link to={to}>{label}</Link>
    </Button>
  )
}

/**
 * Sales Review (owner) and Sales Management (moderator) show sales orders,
 * revenue metrics, and order payment/delivery/fulfillment statuses.
 * MODERATOR can act (approve orders, change order status; the shipping
 * quote and Lalamove booking live on Deliveries); OWNER is view-only
 * throughout - never shown an action control, only the same information.
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
  const [detailsOrder, setDetailsOrder] = useState<OrderReportRow | null>(null)
  const confirm = useConfirm()

  const report = useAdminResource((signal) => getSalesReport({ page, limit: 20, status: status || undefined }, signal), [page, status])
  const summary = report.data?.summary
  const orders = report.data?.orders ?? []

  async function handleStatusChange(order: OrderReportRow, nextStatus: string) {
    const isCancelling = nextStatus === "CANCELLED"
    const nextLabel = nextStatus.charAt(0) + nextStatus.slice(1).toLowerCase()
    if (!(await confirm({
      title: isCancelling ? `Cancel order ${order.orderNumber}?` : `Mark ${order.orderNumber} as ${nextLabel}?`,
      description: isCancelling
        ? "The order will be cancelled and the customer notified. A cancelled order is final and cannot be reopened."
        : "The order status will change and the customer will see the update.",
      details: [
        { label: "Customer", value: order.customerName },
        { label: "Status", value: `${order.status.charAt(0) + order.status.slice(1).toLowerCase()} → ${nextLabel}` },
      ],
      confirmLabel: isCancelling ? "Cancel Order" : "Update Status",
      cancelLabel: isCancelling ? "Keep Order" : "Cancel",
      destructive: isCancelling,
    }))) return
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
    if (!(await confirm({
      title: `Approve order ${order.orderNumber}?`,
      description: "Approval moves the order to delivery: a delivery request is created, and once you get the Lalamove shipping quote in Deliveries the customer can pay products and shipping together.",
      details: [{ label: "Customer", value: order.customerName }, ...(order.shippingAddress ? [{ label: "Deliver to", value: order.shippingAddress }] : [])],
      confirmLabel: "Approve Order",
    }))) return
    setApprovingId(order.id)
    try {
      await approveOrder(order.id)
      toast.success(`${order.orderNumber} approved. Get its shipping quote from Deliveries - the customer can pay once it is ready.`)
      report.reload()
    } catch (error) {
      toast.error("Order not approved", { description: getAdminErrorMessage(error) })
    } finally {
      setApprovingId(null)
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
                    <Eye className="size-5 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden="true" />
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
                    {deliveryStatusContent(row)}
                    {isModerator && <DeliveriesLink row={row} compact />}
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
                  <dl className="space-y-2 text-sm">
                    {detailsOrder.subtotal !== undefined && (
                      <div className="flex items-center justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular-nums">{formatMoney(detailsOrder.subtotal)}</dd></div>
                    )}
                    {detailsOrder.shippingFee !== undefined && (
                      <div className="flex items-center justify-between">
                        <dt className="text-muted-foreground">Estimated shipping fee</dt>
                        <dd className="tabular-nums">{detailsOrder.deliveryQuotedAt ? formatMoney(detailsOrder.shippingFee) : <span className="text-xs italic text-muted-foreground">Not quoted yet</span>}</dd>
                      </div>
                    )}
                    <div className="flex items-center justify-between font-semibold">
                      <dt>Order total</dt>
                      <dd className="tabular-nums">{formatMoney(detailsOrder.totalAmount)}</dd>
                    </div>
                  </dl>
                </section>

                <section>
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Delivery address</h3>
                  <div className="space-y-1.5 rounded-lg border border-border bg-muted/20 p-3 text-sm">
                    <p><span className="text-muted-foreground">Customer:</span> {detailsOrder.customerName}</p>
                    {detailsOrder.recipientName && (
                      <p><span className="text-muted-foreground">Recipient:</span> {detailsOrder.recipientName}{detailsOrder.recipientPhone ? ` · ${formatPhoneForDisplay(detailsOrder.recipientPhone)}` : ""}</p>
                    )}
                    <p className="flex items-start gap-1.5"><MapPin className="mt-1 size-3.5 shrink-0 text-primary" aria-hidden="true" />{detailsOrder.shippingAddress || "—"}</p>
                    {detailsOrder.deliveryLatitude != null && detailsOrder.deliveryLongitude != null ? (
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>Coordinates: {detailsOrder.deliveryLatitude.toFixed(7)}, {detailsOrder.deliveryLongitude.toFixed(7)}</span>
                        <a href={`https://www.google.com/maps?q=${detailsOrder.deliveryLatitude},${detailsOrder.deliveryLongitude}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                          View on map <ExternalLink className="size-3" aria-hidden="true" />
                        </a>
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">No map pin on this order (placed before saved addresses). Coordinates can be set from Deliveries.</p>
                    )}
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
                      {deliveryStatusContent(detailsOrder)}
                      <dl className="grid w-full grid-cols-2 gap-2 text-xs">
                        <div><dt className="text-muted-foreground">Vehicle</dt><dd className="font-medium">{detailsOrder.deliveryVehicleLabel ?? detailsOrder.deliveryVehicleType ?? "—"}</dd></div>
                        <div><dt className="text-muted-foreground">Booking ID</dt><dd className="font-mono font-medium break-all">{detailsOrder.lalamoveBookingId ?? "—"}</dd></div>
                        {detailsOrder.finalShippingFee != null && <div><dt className="text-muted-foreground">Final Lalamove fee</dt><dd className="font-medium">{formatMoney(detailsOrder.finalShippingFee)}</dd></div>}
                        {detailsOrder.trackingUrl && (
                          <div><dt className="text-muted-foreground">Tracking</dt><dd><a href={detailsOrder.trackingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">Lalamove tracking <ExternalLink className="size-3" aria-hidden="true" /></a></dd></div>
                        )}
                      </dl>
                      {isModerator && <DeliveriesLink row={detailsOrder} compact={false} />}
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

    </div>
  )
}
