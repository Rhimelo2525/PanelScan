import { ArrowRight, Eye, MapPin, RefreshCw } from "lucide-react"
import { useState } from "react"
import { Link } from "react-router-dom"

import { getSalesReport } from "@/api/admin"
import { formatDate, formatDateTime, formatMoneyDetail } from "@/admin/admin-format"
import { useAdminResource } from "@/admin/use-admin-resource"
import { DataTable } from "@/components/admin/data-table"
import { ErrorState } from "@/components/admin/empty-state"
import { StatusBadge } from "@/components/admin/status-badge"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { getDeliveryStatusLabel } from "@/lib/delivery/status-label"
import type { OrderReportRow } from "@/types/admin"

const RECENT_LIMIT = 8

/** "Test 2 Wall Panel (x2)", plus "+N more" when the order has other products. */
function itemsSummary(row: OrderReportRow): string {
  const [first, ...rest] = row.items
  if (!first) return row.itemCount > 0 ? `${row.itemCount} item${row.itemCount === 1 ? "" : "s"}` : "—"
  return `${first.productName} (x${first.quantity})${rest.length > 0 ? ` +${rest.length} more` : ""}`
}

/** The order's status, with a not-yet-approved pending order called out as such. */
function orderStatusBadge(row: OrderReportRow) {
  if (row.status === "PENDING" && !row.moderatorApproved) return <StatusBadge status="PENDING" label="Pending approval" />
  return <StatusBadge status={row.status} />
}

const paymentStatusOf = (row: OrderReportRow) => row.paymentStatus ?? (row.isPaid ? "PAID" : "PENDING")

/**
 * The latest orders at a glance on the dashboard, read from the same sales
 * report as the Sales page. Amounts follow that report's role rules: a
 * moderator's rows carry none, so the column says so instead of showing zero.
 */
export function RecentOrdersCard() {
  const report = useAdminResource((signal) => getSalesReport({ page: 1, limit: RECENT_LIMIT }, signal), [], { pollIntervalMs: 45_000 })
  const [selected, setSelected] = useState<OrderReportRow | null>(null)
  const rows = report.data?.orders ?? []

  return (
    <section aria-labelledby="recent-orders-title" className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-3 pb-3">
        <div>
          <h2 id="recent-orders-title" className="text-sm font-semibold">Recent Sales &amp; Orders</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">The {RECENT_LIMIT} most recent orders</p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={report.reload} disabled={report.isLoading} aria-label="Refresh recent orders">
            <RefreshCw className={report.isLoading ? "animate-spin" : undefined} aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" asChild><Link to="/admin/sales">View all sales<ArrowRight data-icon="inline-end" aria-hidden="true" /></Link></Button>
        </div>
      </div>

      {report.error ? <ErrorState message={report.error} onRetry={report.reload} /> : (
        <DataTable
          caption="The most recent orders with payment and order status"
          isLoading={report.isLoading && !report.data}
          rows={rows}
          getRowId={(row) => row.id}
          empty={<div className="rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">No orders have been placed yet.</div>}
          columns={[
            { key: "order", header: "Order", primary: true, cell: (row) => <span className="font-medium whitespace-nowrap">{row.orderNumber}</span> },
            { key: "customer", header: "Customer", cell: (row) => row.customerName },
            { key: "date", header: "Date", secondary: true, cell: (row) => <span className="whitespace-nowrap text-muted-foreground">{formatDate(row.createdAt)}</span> },
            { key: "items", header: "Items", secondary: true, cell: (row) => <span className="text-muted-foreground">{itemsSummary(row)}</span> },
            { key: "total", header: "Total", numeric: true, cell: (row) => row.totalAmount === undefined ? <span className="text-xs text-muted-foreground">Owner only</span> : <span className="whitespace-nowrap">{formatMoneyDetail(row.totalAmount)}</span> },
            { key: "payment", header: "Payment", cell: (row) => <StatusBadge status={paymentStatusOf(row)} /> },
            { key: "status", header: "Status", cell: (row) => orderStatusBadge(row) },
          ]}
          rowAction={(row) => (
            <Button variant="ghost" size="sm" onClick={() => setSelected(row)} aria-label={`View order ${row.orderNumber}`}>
              <Eye aria-hidden="true" />
            </Button>
          )}
        />
      )}

      <Sheet open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null) }}>
        <SheetContent className="admin-surface w-full overflow-y-auto sm:max-w-md">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.orderNumber}</SheetTitle>
                <SheetDescription>Placed {formatDateTime(selected.createdAt)} by {selected.customerName}</SheetDescription>
              </SheetHeader>
              <div className="space-y-5 px-4 pb-6 text-sm">
                <div className="flex flex-wrap gap-2">
                  {orderStatusBadge(selected)}
                  <StatusBadge status={paymentStatusOf(selected)} label={`Payment: ${paymentStatusOf(selected).charAt(0)}${paymentStatusOf(selected).slice(1).toLowerCase()}`} />
                  {selected.deliveryStatus && <StatusBadge status={selected.deliveryStatus} label={`Delivery: ${getDeliveryStatusLabel(selected.deliveryStatus)}`} />}
                </div>

                <section>
                  <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Items</h3>
                  <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
                    {selected.items.length === 0 && <li className="px-3 py-2 text-muted-foreground">No items on this order.</li>}
                    {selected.items.map((item) => (
                      <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
                        <span>{item.productName} <span className="text-muted-foreground">(x{item.quantity})</span></span>
                        {item.lineTotal !== undefined && <span className="tabular-nums">{formatMoneyDetail(item.lineTotal)}</span>}
                      </li>
                    ))}
                  </ul>
                </section>

                {selected.totalAmount !== undefined && (
                  <dl className="space-y-1">
                    {selected.subtotal !== undefined && <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="tabular-nums">{formatMoneyDetail(selected.subtotal)}</dd></div>}
                    {selected.shippingFee !== undefined && <div className="flex justify-between"><dt className="text-muted-foreground">Shipping</dt><dd className="tabular-nums">{selected.deliveryQuotedAt ? formatMoneyDetail(selected.shippingFee) : <span className="text-xs italic text-muted-foreground">Not quoted yet</span>}</dd></div>}
                    <div className="flex justify-between font-semibold"><dt>Total</dt><dd className="tabular-nums">{formatMoneyDetail(selected.totalAmount)}</dd></div>
                  </dl>
                )}

                <p className="flex items-start gap-1.5 text-muted-foreground"><MapPin className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />{selected.shippingAddress || "No address on this order"}</p>

                <Button variant="outline" className="w-full" asChild>
                  <Link to="/admin/sales">Open the Sales page<ArrowRight data-icon="inline-end" aria-hidden="true" /></Link>
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </section>
  )
}
