import { AlertTriangle, Boxes, ClipboardList, Coins, PackageCheck, ShieldCheck, Star, Users } from "lucide-react"
import { Link } from "react-router-dom"

import { getDashboardStats, getInventoryReport, getProductStats, getSalesReport } from "@/api/admin"
import { bucketByPeriod, formatCount, formatMoney } from "@/admin/admin-format"
import { useAdminResource } from "@/admin/use-admin-resource"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { DataTable } from "@/components/admin/data-table"
import { ErrorState } from "@/components/admin/empty-state"
import { MetricCard } from "@/components/admin/metric-card"
import { StatusBreakdownBars, TrendChart } from "@/components/admin/trend-chart"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/auth/use-auth"
import { useDocumentTitle } from "@/hooks/use-document-title"
import type { TopProduct } from "@/types/admin"

/**
 * One dashboard, two audiences. The backend already decides what a MODERATOR may
 * see (financial fields are omitted from its responses rather than zeroed), so
 * this page renders whatever arrived and marks absent figures as role-restricted
 * instead of guessing or showing zero.
 */
export function AdminDashboardPage() {
  useDocumentTitle("Dashboard | PanelScan Admin")
  const { user } = useAuth()
  const isOwner = user?.role === "OWNER"

  const stats = useAdminResource((signal) => getDashboardStats(signal), [])
  const products = useAdminResource((signal) => getProductStats({ limit: 5 }, signal), [])
  // The backend exposes no time-series endpoint, so the trend is bucketed from
  // real sales-report rows. Owners see revenue; moderators see order volume,
  // because their report rows carry no amounts at all.
  const sales = useAdminResource((signal) => getSalesReport({ limit: 100 }, signal), [])
  // Stock by panel line: the inventory report carries the SKU, which is the only
  // field available to tell a wall panel from a ceiling panel here.
  const inventory = useAdminResource((signal) => getInventoryReport({ limit: 100 }, signal), [])

  const dashboard = stats.data
  const inventoryRows = inventory.data?.inventory ?? []
  const wallStock = inventoryRows.filter((row) => row.sku.startsWith("WP-"))
  const ceilingStock = inventoryRows.filter((row) => row.sku.startsWith("CP-"))
  const salesRows = sales.data?.orders ?? []
  const trendPoints = isOwner
    ? bucketByPeriod(salesRows, (row) => row.createdAt, (row) => row.totalAmount ?? 0)
    : bucketByPeriod(salesRows, (row) => row.createdAt, () => 1)

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow={isOwner ? "Owner" : "Moderator"}
        title={`Good to see you, ${user?.firstName ?? ""}`.trim()}
        description={isOwner
          ? "Business performance, inventory health, and governance across PanelScan."
          : "Operational status across projects, inventory, and customer activity. Financial figures are limited to the owner account."}
        actions={<Button variant="outline" size="sm" onClick={() => { stats.reload(); products.reload(); sales.reload(); inventory.reload() }}>Refresh</Button>}
      />

      {stats.error ? <ErrorState message={stats.error} onRetry={stats.reload} /> : (
        <section aria-label="Key metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard label="Gross revenue" value={formatMoney(dashboard?.totalRevenue)} hint="All non-cancelled orders" icon={Coins} isLoading={stats.isLoading} restricted={!stats.isLoading && dashboard?.totalRevenue === undefined} />
          <MetricCard label="Orders" value={formatCount(dashboard?.totalOrders)} hint={dashboard ? `${formatCount(dashboard.totalCustomers)} customers` : undefined} icon={PackageCheck} isLoading={stats.isLoading} />
          <MetricCard label="Active projects" value={formatCount(dashboard?.totalProjects)} hint={dashboard?.projectsByStatus.length ? undefined : "No projects recorded yet"} icon={ClipboardList} isLoading={stats.isLoading} />
          <MetricCard label="Low stock items" value={formatCount(dashboard?.lowStockCount)} hint={`${formatCount(dashboard?.totalActiveProducts)} active products`} icon={AlertTriangle} isLoading={stats.isLoading} />
          <MetricCard label="Wall panel stock" value={formatCount(wallStock.reduce((total, row) => total + row.available, 0))} hint={`${wallStock.length} product${wallStock.length === 1 ? "" : "s"} · ${wallStock.filter((row) => row.isLowStock).length} low`} icon={Boxes} isLoading={inventory.isLoading} unavailable={Boolean(inventory.error)} />
          <MetricCard label="Ceiling panel stock" value={formatCount(ceilingStock.reduce((total, row) => total + row.available, 0))} hint={`${ceilingStock.length} product${ceilingStock.length === 1 ? "" : "s"} · ${ceilingStock.filter((row) => row.isLowStock).length} low`} icon={Boxes} isLoading={inventory.isLoading} unavailable={Boolean(inventory.error)} />
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="surface-card p-5" aria-label={isOwner ? "Revenue trend" : "Order volume trend"}>
          {sales.isLoading ? <Skeleton className="h-52 w-full" /> : sales.error ? <ErrorState message={sales.error} onRetry={sales.reload} /> : trendPoints.length === 0 ? (
            <div><p className="text-sm font-semibold">{isOwner ? "Revenue over time" : "Orders over time"}</p><p className="mt-3 text-sm text-muted-foreground">No orders have been recorded yet, so there is no trend to plot.</p></div>
          ) : (
            <TrendChart
              points={trendPoints}
              title={isOwner ? "Revenue over time" : "Orders over time"}
              formatValue={isOwner ? (value) => formatMoney(value) : (value) => formatCount(value)}
              description={`Derived from the ${salesRows.length} most recent orders`}
            />
          )}
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <div className="surface-card p-5">
            {stats.isLoading ? <Skeleton className="h-32 w-full" /> : <StatusBreakdownBars title="Orders by status" items={dashboard?.ordersByStatus ?? []} />}
          </div>
          <div className="surface-card p-5">
            {stats.isLoading ? <Skeleton className="h-32 w-full" /> : <StatusBreakdownBars title="Projects by status" items={dashboard?.projectsByStatus ?? []} emptyLabel="No projects have been created yet." />}
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section aria-labelledby="top-products-title" className="min-w-0">
          <div className="flex items-baseline justify-between gap-3 pb-3">
            <h2 id="top-products-title" className="text-sm font-semibold">Product demand</h2>
            <Button variant="ghost" size="sm" asChild><Link to="/admin/inventory">Inventory</Link></Button>
          </div>
          {products.error ? <ErrorState message={products.error} onRetry={products.reload} /> : <DataTable
            caption="Best selling products by quantity sold"
            isLoading={products.isLoading}
            rows={products.data?.topProducts ?? []}
            getRowId={(row: TopProduct) => row.productId}
            empty={<div className="rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">No products have been sold yet.</div>}
            columns={[
              { key: "name", header: "Product", primary: true, cell: (row) => <span className="font-medium">{row.name}</span> },
              { key: "sku", header: "SKU", secondary: true, cell: (row) => <span className="text-muted-foreground">{row.sku}</span> },
              { key: "sold", header: "Units sold", numeric: true, cell: (row) => formatCount(row.quantitySold) },
              { key: "revenue", header: "Revenue", numeric: true, cell: (row) => row.revenue === undefined ? <span className="text-xs text-muted-foreground">Owner only</span> : formatMoney(row.revenue) },
            ]}
          />}
        </section>

        <section className="space-y-3" aria-label="Attention">
          <MetricCard label="Pending requests" value={formatCount(dashboard?.pendingRequests)} hint={isOwner ? "Awaiting your review" : "Submitted for owner review"} icon={ShieldCheck} isLoading={stats.isLoading} unavailable={Boolean(stats.error)} />
          <MetricCard label="Average feedback rating" value={dashboard?.averageFeedbackRating === null ? "No ratings yet" : dashboard?.averageFeedbackRating?.toFixed(1)} hint="Across all customer feedback" icon={Star} isLoading={stats.isLoading} unavailable={Boolean(stats.error)} />
          <MetricCard label="Inventory value" value={formatMoney(products.data?.totalInventoryValue)} hint="At current unit prices" icon={Boxes} isLoading={products.isLoading} unavailable={Boolean(products.error)} restricted={!products.isLoading && !products.error && products.data?.totalInventoryValue === undefined} />
          <MetricCard label="Customers" value={formatCount(dashboard?.totalCustomers)} icon={Users} isLoading={stats.isLoading} unavailable={Boolean(stats.error)} />
        </section>
      </div>
    </div>
  )
}
