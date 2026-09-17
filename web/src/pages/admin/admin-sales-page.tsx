import { PackageSearch } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { getSalesReport, updateOrderStatus } from "@/api/admin"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useDocumentTitle } from "@/hooks/use-document-title"
import type { OrderReportRow } from "@/types/admin"

const ORDER_STATUSES = ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"]
const TRANSITIONABLE = ["PENDING", "PROCESSING", "SHIPPED"]

/**
 * Sales Review (owner) and Sales Management (moderator) are the same data with
 * different columns: the backend omits every amount for a moderator, so those
 * cells say so rather than rendering ₱0.00.
 */
export function AdminSalesPage() {
  useDocumentTitle("Sales | PanelScan Admin")
  const { user } = useAuth()
  const isOwner = user?.role === "OWNER"
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState("")
  const [pendingId, setPendingId] = useState<string | null>(null)

  const report = useAdminResource((signal) => getSalesReport({ page, limit: 20, status: status || undefined }, signal), [page, status])
  const summary = report.data?.summary
  const orders = report.data?.orders ?? []

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

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow={isOwner ? "Sales review" : "Sales management"}
        title="Orders and revenue"
        description={isOwner
          ? "Every order recorded by PanelScan, with revenue summarised across the current filter."
          : "Order fulfilment across PanelScan. Order amounts are restricted to the owner account."}
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
              { key: "amount", header: "Amount", numeric: true, cell: (row) => row.totalAmount === undefined ? <span className="text-xs text-muted-foreground">Owner only</span> : formatMoney(row.totalAmount) },
              { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
            ]}
            rowAction={(row) => TRANSITIONABLE.includes(row.status) ? (
              <Select value="" onValueChange={(next) => void handleStatusChange(row, next)} disabled={pendingId === row.id}>
                <SelectTrigger size="sm" className="h-7 w-32 text-xs" aria-label={`Update status for ${row.orderNumber}`}><SelectValue placeholder="Update" /></SelectTrigger>
                <SelectContent>{ORDER_STATUSES.filter((value) => value !== row.status).map((value) => <SelectItem key={value} value={value}>{value.charAt(0) + value.slice(1).toLowerCase()}</SelectItem>)}</SelectContent>
              </Select>
            ) : <span className="text-xs text-muted-foreground">Final</span>}
          />
          </div>

          <TablePagination pagination={report.data?.pagination ?? null} onPageChange={setPage} isLoading={report.isLoading} />

          <p className="text-xs leading-5 text-muted-foreground">Fulfilment status is set here manually. Payment confirmation is recorded separately by the payment provider webhook and is never changed from this screen.</p>
        </>
      )}
    </div>
  )
}
