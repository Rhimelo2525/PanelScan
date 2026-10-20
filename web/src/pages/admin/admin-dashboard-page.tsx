import { AlertTriangle, ArrowLeft, ArrowRight, Boxes, ClipboardList, Coins, History, PackageCheck, ShieldCheck, Star, Users } from "lucide-react"
import { useState } from "react"
import { Link, useSearchParams } from "react-router-dom"

import { getDashboardArchive, getDashboardCycle, getDashboardStats, getInventoryReport, getProductStats, getProjects } from "@/api/admin"
import { formatCount, formatDate, formatManilaDate, formatManilaDateTime, formatMoney, fullName, manilaDayKey } from "@/admin/admin-format"
import { dayKey, daysInMonth, getMonthOrders } from "@/admin/month-orders"
import { MONTHS } from "@/components/admin/month-colors"
import { MonthSelector } from "@/components/admin/month-selector"
import { RecentOrdersCard } from "@/components/admin/recent-orders-card"
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
import type { CycleProductDemand, DashboardArchiveDetail, DashboardCycle } from "@/types/admin"

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

  const stats = useAdminResource((signal) => getDashboardStats(signal), [], { pollIntervalMs: 45_000 })
  const products = useAdminResource((signal) => getProductStats({ limit: 5 }, signal), [], { pollIntervalMs: 45_000 })
  // Gross revenue, Orders, Orders by status and Product demand count the current
  // monthly cycle only (the 1st to the month's end, Philippine time); each
  // finished cycle is kept on the owner's Archives page.
  // Owners see revenue; moderators see order volume (no amounts reach them).
  const cycle = useAdminResource((signal) => getDashboardCycle(signal), [], { pollIntervalMs: 45_000 })
  // ?archiveId=... (the period links on the Archives page): the owner looks back
  // at an archived cycle. Its frozen figures replace the cycle widgets above;
  // the other cards stay live. Archives are owner-only, so others ignore it.
  const [searchParams] = useSearchParams()
  const archiveId = isOwner ? searchParams.get("archiveId") : null
  const isArchiveView = Boolean(archiveId)
  const archived = useAdminResource((signal) => archiveId ? getDashboardArchive(archiveId, signal).then((result) => result.archive) : Promise.resolve(null), [archiveId])
  // Stock by panel line: the inventory report carries the SKU, which is the only
  // field available to tell a wall panel from a ceiling panel here.
  const inventory = useAdminResource((signal) => getInventoryReport({ limit: 100 }, signal), [], { pollIntervalMs: 45_000 })

  const dashboard = stats.data
  const inventoryRows = inventory.data?.inventory ?? []
  const wallStock = inventoryRows.filter((row) => row.sku.startsWith("WP-"))
  const ceilingStock = inventoryRows.filter((row) => row.sku.startsWith("CP-"))
  const archive = isArchiveView ? archived.data : null
  // The cycle shown by Gross revenue, Orders, Product demand and Orders by status.
  const shownState = isArchiveView ? archived : cycle
  const shownCycle: DashboardCycle | DashboardArchiveDetail | null | undefined = isArchiveView ? archive : cycle.data?.cycle
  const cycleLabel = shownCycle ? `${isArchiveView ? "Archived cycle" : "Cycle"} #${shownCycle.cycleNumber} · ${formatManilaDate(shownCycle.startTimestamp)} – ${formatManilaDate(shownCycle.endTimestamp)}` : undefined
  const cycleSince = shownCycle ? (isArchiveView ? cycleLabel : `Cycle #${shownCycle.cycleNumber} · since ${formatManilaDate(shownCycle.startTimestamp)}`) : undefined

  // Revenue over time: one calendar month at a time (Philippine time), picked
  // with the month boxes under the chart; each month has its own colour.
  const today = manilaDayKey(new Date().toISOString())
  const currentYear = Number(today.slice(0, 4))
  const currentMonth = Number(today.slice(5, 7)) - 1
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const monthOrders = useAdminResource((signal) => getMonthOrders(currentYear, selectedMonth, signal), [currentYear, selectedMonth], { pollIntervalMs: 45_000 })
  const month = MONTHS[selectedMonth]
  const monthName = `${month.long} ${currentYear}`
  // Cancelled orders are not revenue (same rule as the cycle archives).
  const countedOrders = (monthOrders.data ?? []).filter((row) => row.status !== "CANCELLED")
  const monthTotal = countedOrders.reduce((sum, row) => sum + (row.totalAmount ?? 0), 0)
  const lastDay = selectedMonth === currentMonth ? Number(today.slice(8, 10)) : daysInMonth(currentYear, selectedMonth)
  const valueByDay = new Map<string, number>()
  for (const row of countedOrders) {
    const key = manilaDayKey(row.createdAt)
    valueByDay.set(key, (valueByDay.get(key) ?? 0) + (isOwner ? row.totalAmount ?? 0 : 1))
  }
  const dayLabel = (day: number) => `${month.short} ${String(day).padStart(2, "0")}`
  const trendPoints = Array.from({ length: lastDay }, (_, index) => ({ label: dayLabel(index + 1), value: valueByDay.get(dayKey(currentYear, selectedMonth, index + 1)) ?? 0 }))
  const monthSummary = isOwner
    ? `${formatMoney(monthTotal)} from ${formatCount(countedOrders.length)} order${countedOrders.length === 1 ? "" : "s"} · ${monthName}`
    : `${formatCount(countedOrders.length)} order${countedOrders.length === 1 ? "" : "s"} · ${monthName}`
  const hasCycleOrders = (shownCycle?.totalOrdersCount ?? 0) > 0

  // An archived cycle plots its own frozen days, in the colour of its month.
  const archiveDays = archive?.revenueOverTime ?? []
  const archiveMonth = archive ? MONTHS[Number(manilaDayKey(archive.startTimestamp).slice(5, 7)) - 1] : month
  const archivePoints = archiveDays.map((day) => ({ label: `${MONTHS[Number(day.date.slice(5, 7)) - 1].short} ${day.date.slice(8, 10)}`, value: day.grossRevenue ?? 0 }))
  const archiveOrderCount = archiveDays.reduce((sum, day) => sum + day.ordersCount, 0)
  const archiveSummary = archive ? `${formatMoney(archive.totalGrossRevenue)} from ${formatCount(archiveOrderCount)} order${archiveOrderCount === 1 ? "" : "s"} · Archived cycle #${archive.cycleNumber}` : ""
  const archiveAxis: [string, string, string] = [archivePoints[0]?.label ?? "", archivePoints[Math.floor((archivePoints.length - 1) / 2)]?.label ?? "", archivePoints[archivePoints.length - 1]?.label ?? ""]

  return (
    <div className="space-y-7">
      {isArchiveView && (
        <section role="status" aria-label="Archived cycle view" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
          <div className="flex min-w-0 items-start gap-3">
            <History className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0 text-sm">
              <p className="font-semibold">
                {archive
                  ? `Viewing archived cycle #${archive.cycleNumber}: ${formatManilaDateTime(archive.startTimestamp)} – ${formatManilaDateTime(archive.endTimestamp)}`
                  : archived.error ? "This archived cycle could not be loaded" : "Loading the archived cycle…"}
              </p>
              <p className="mt-0.5 text-muted-foreground">
                {archive
                  ? `Historical snapshot saved ${formatManilaDateTime(archive.archivedAt)}. Gross revenue, orders, revenue over time, product demand and orders by status are from this archive; the other cards are live.`
                  : archived.error ?? "Historical snapshot data is being loaded."}
              </p>
            </div>
          </div>
          <Button size="sm" asChild>
            <Link to="/admin/archives"><ArrowLeft data-icon="inline-start" aria-hidden="true" />Back to Reports</Link>
          </Button>
        </section>
      )}

      <AdminPageHeader
        eyebrow={isOwner ? "Owner" : "Moderator"}
        title={`Good to see you, ${user?.firstName ?? ""}`.trim()}
        description={isOwner
          ? "Business performance, inventory health, and governance across PanelScan."
          : "Operational status across projects, inventory, and customer activity. Financial figures are limited to the owner account."}
        actions={<Button variant="outline" size="sm" onClick={() => { stats.reload(); products.reload(); cycle.reload(); archived.reload(); monthOrders.reload(); inventory.reload() }}>Refresh</Button>}
      />

      {stats.error ? <ErrorState message={stats.error} onRetry={stats.reload} /> : (
        <section aria-label="Key metrics" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard label="Gross revenue" value={formatMoney(shownCycle?.totalGrossRevenue)} hint={cycleSince ? `Non-cancelled orders · ${cycleSince}` : undefined} icon={Coins} isLoading={shownState.isLoading} unavailable={Boolean(shownState.error)} restricted={!shownState.isLoading && !shownState.error && shownCycle?.totalGrossRevenue === undefined} />
          <MetricCard label="Orders" value={formatCount(shownCycle?.totalOrdersCount)} hint={cycleSince} to="/admin/sales" icon={PackageCheck} isLoading={shownState.isLoading} unavailable={Boolean(shownState.error)} />
          <MetricCard to="/admin/projects" label="Active projects" value={formatCount(dashboard?.totalProjects)} hint={dashboard?.projectsByStatus.length ? undefined : "No projects recorded yet"} icon={ClipboardList} isLoading={stats.isLoading} />
          <MetricCard to="/admin/inventory" label="Low stock items" value={formatCount(dashboard?.lowStockCount)} hint={`${formatCount(dashboard?.totalActiveProducts)} active products`} icon={AlertTriangle} isLoading={stats.isLoading} />
          <MetricCard to="/admin/inventory" label="Wall panel stock" value={formatCount(wallStock.reduce((total, row) => total + row.available, 0))} hint={`${wallStock.length} product${wallStock.length === 1 ? "" : "s"} · ${wallStock.filter((row) => row.isLowStock).length} low`} icon={Boxes} isLoading={inventory.isLoading} unavailable={Boolean(inventory.error)} />
          <MetricCard to="/admin/inventory" label="Ceiling panel stock" value={formatCount(ceilingStock.reduce((total, row) => total + row.available, 0))} hint={`${ceilingStock.length} product${ceilingStock.length === 1 ? "" : "s"} · ${ceilingStock.filter((row) => row.isLowStock).length} low`} icon={Boxes} isLoading={inventory.isLoading} unavailable={Boolean(inventory.error)} />
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-8">
          <section className="surface-card p-5" aria-label={isOwner ? "Revenue trend" : "Order volume trend"}>
            {isArchiveView ? (
              archived.isLoading && !archive ? <Skeleton className="h-52 w-full" /> : archived.error || !archive ? <ErrorState message={archived.error ?? "This archived cycle could not be loaded."} onRetry={archived.reload} /> : archiveOrderCount === 0 ? (
                <div className="min-h-52"><p className="text-sm font-semibold">Revenue over time</p><p className="mt-1 text-xs text-muted-foreground">Archived cycle #{archive.cycleNumber}</p><p className="mt-3 text-sm text-muted-foreground">No orders were placed in this cycle, so there is no trend to plot.</p></div>
              ) : (
                <TrendChart
                  points={archivePoints}
                  title="Revenue over time"
                  formatValue={(value) => formatMoney(value)}
                  description={archiveSummary}
                  color={archiveMonth.color}
                  axisLabels={archiveAxis}
                />
              )
            ) : monthOrders.isLoading && !monthOrders.data ? <Skeleton className="h-52 w-full" /> : monthOrders.error ? <ErrorState message={monthOrders.error} onRetry={monthOrders.reload} /> : countedOrders.length === 0 ? (
              <div className="min-h-52"><p className="text-sm font-semibold">{isOwner ? "Revenue over time" : "Orders over time"}</p><p className="mt-1 text-xs text-muted-foreground">{monthName}</p><p className="mt-3 text-sm text-muted-foreground">No orders were placed in {monthName}, so there is no trend to plot.</p></div>
            ) : (
              <TrendChart
                points={trendPoints}
                title={isOwner ? "Revenue over time" : "Orders over time"}
                formatValue={isOwner ? (value) => formatMoney(value) : (value) => formatCount(value)}
                description={monthSummary}
                color={month.color}
                axisLabels={[dayLabel(1), dayLabel(Math.min(15, Math.ceil(lastDay / 2))), dayLabel(lastDay)]}
              />
            )}
            {!isArchiveView && <MonthSelector value={selectedMonth} onChange={setSelectedMonth} lastSelectableMonth={currentMonth} year={currentYear} />}
          </section>

          {/* Live orders have no place in a look back at an archived cycle. */}
          {!isArchiveView && <RecentOrdersCard />}

          <section aria-labelledby="top-products-title" className="min-w-0">
            <div className="flex items-baseline justify-between gap-3 pb-3">
              <div>
                <h2 id="top-products-title" className="text-sm font-semibold">Product demand</h2>
                {cycleLabel && <p className="mt-0.5 text-xs text-muted-foreground">{cycleLabel}</p>}
              </div>
              <Button variant="ghost" size="sm" asChild><Link to="/admin/inventory">Inventory</Link></Button>
            </div>
            {shownState.error ? <ErrorState message={shownState.error} onRetry={shownState.reload} /> : <DataTable
              caption="Best selling products this cycle by quantity sold"
              isLoading={shownState.isLoading}
              rows={(shownCycle?.productDemand ?? []).slice(0, 5)}
              getRowId={(row: CycleProductDemand) => row.productId}
              empty={<div className="rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">No products have been sold in this cycle yet.</div>}
              columns={[
                { key: "name", header: "Product", primary: true, cell: (row) => <span className="font-medium">{row.productName}</span> },
                { key: "sku", header: "Product Code", secondary: true, cell: (row) => <span className="text-muted-foreground">{row.sku}</span> },
                { key: "sold", header: "Units sold", numeric: true, cell: (row) => formatCount(row.unitsSold) },
                { key: "revenue", header: "Revenue", numeric: true, cell: (row) => row.totalRevenue === undefined ? <span className="text-xs text-muted-foreground">Owner only</span> : formatMoney(row.totalRevenue) },
              ]}
            />}
          </section>
        </div>

        <aside className="grid content-start gap-4 sm:grid-cols-2 lg:col-span-4 lg:grid-cols-1" aria-label="Summary">
          <div className="surface-card p-5">
            {shownState.isLoading ? <Skeleton className="h-32 w-full" /> : shownState.error ? <ErrorState message={shownState.error} onRetry={shownState.reload} /> : <>
              <StatusBreakdownBars title="Orders by status" items={hasCycleOrders ? shownCycle?.ordersByStatus ?? [] : []} emptyLabel="No orders in this cycle yet." />
              {cycleLabel && <p className="mt-3 text-xs text-muted-foreground">{cycleLabel}</p>}
            </>}
          </div>
          <RecentProjectsCard />
          <MetricCard to="/admin/requests" label="Pending requests" value={formatCount(dashboard?.pendingRequests)} hint={isOwner ? "Awaiting your review" : "Submitted for owner review"} icon={ShieldCheck} isLoading={stats.isLoading} unavailable={Boolean(stats.error)} />
          <MetricCard to="/admin/feedback" label="Average feedback rating" value={dashboard?.averageFeedbackRating === null ? "No ratings yet" : dashboard?.averageFeedbackRating?.toFixed(1)} hint="Across all customer feedback" icon={Star} isLoading={stats.isLoading} unavailable={Boolean(stats.error)} />
          <MetricCard to="/admin/inventory" label="Inventory value" value={formatMoney(products.data?.totalInventoryValue)} hint="At current unit prices" icon={Boxes} isLoading={products.isLoading} unavailable={Boolean(products.error)} restricted={!products.isLoading && !products.error && products.data?.totalInventoryValue === undefined} />
          <MetricCard label="Customers" value={formatCount(dashboard?.totalCustomers)} icon={Users} isLoading={stats.isLoading} unavailable={Boolean(stats.error)} />
        </aside>
      </div>
    </div>
  )
}

const RECENT_PROJECTS_LIMIT = 5

/** The latest customer projects, each opening on the Projects page. */
function RecentProjectsCard() {
  const projects = useAdminResource((signal) => getProjects({ page: 1, limit: RECENT_PROJECTS_LIMIT }, signal), [], { pollIntervalMs: 45_000 })
  const rows = projects.data?.projects ?? []

  return (
    <section className="surface-card p-5" aria-labelledby="recent-projects-title">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="recent-projects-title" className="text-sm font-semibold">Recent projects</h2>
        <Link to="/admin/projects" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">View all<ArrowRight className="size-3" aria-hidden="true" /></Link>
      </div>
      {projects.isLoading && !projects.data ? <Skeleton className="mt-3 h-32 w-full" /> : projects.error ? <ErrorState message={projects.error} onRetry={projects.reload} /> : rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">No projects have been created yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {rows.map((project) => (
            <li key={project.id}>
              <Link to={`/admin/projects?customer=${project.customerId}&project=${project.id}`} className="-mx-2 block rounded-md px-2 py-2 transition-colors hover:bg-muted/50">
                <p className="truncate text-sm font-medium">{project.name}</p>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{fullName(project.customer)} · {formatDate(project.createdAt)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
