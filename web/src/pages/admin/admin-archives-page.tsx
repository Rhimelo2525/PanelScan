import { Archive, CalendarClock, Download, Loader2 } from "lucide-react"
import { useState } from "react"
import { Link, Navigate } from "react-router-dom"
import { toast } from "sonner"

import { downloadDashboardArchive, getDashboardArchives, getDashboardCycle } from "@/api/admin"
import { formatCount, formatManilaDate, formatManilaDateTime, formatMoney, manilaDayKey } from "@/admin/admin-format"
import { getAdminErrorMessage, useAdminResource } from "@/admin/use-admin-resource"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { DataTable } from "@/components/admin/data-table"
import { EmptyState, ErrorState } from "@/components/admin/empty-state"
import { MONTHS } from "@/components/admin/month-colors"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useAuth } from "@/auth/use-auth"
import { useDocumentTitle } from "@/hooks/use-document-title"
import type { ArchivedMetricType, DashboardArchiveSummary } from "@/types/admin"

const METRIC_LABELS: Record<ArchivedMetricType, string> = {
  REVENUE_OVER_TIME: "Revenue Over Time",
  PRODUCT_DEMAND: "Product Demand",
  ORDERS_BY_STATUS: "Orders By Status",
}

/** "Sep19" and "2026" - a Philippine date for the file name. */
const fileDate = (value: string) => {
  const [year, month, day] = manilaDayKey(value).split("-")
  return { day: `${MONTHS[Number(month) - 1].short}${day}`, year }
}

/** Same name the API gives the file: "PanelScan_Archive_Sep19_to_Sep30_2026.xlsx" (both years if it spans New Year). */
const archiveFileName = (archive: DashboardArchiveSummary) => {
  const from = fileDate(archive.startTimestamp)
  const to = fileDate(archive.endTimestamp)
  return from.year === to.year
    ? `PanelScan_Archive_${from.day}_to_${to.day}_${to.year}.xlsx`
    : `PanelScan_Archive_${from.day}_${from.year}_to_${to.day}_${to.year}.xlsx`
}

/**
 * OWNER only. At the end of every month the dashboard's figures (Gross
 * revenue, Orders, Product demand and Orders by status) are frozen into an
 * archive and start again from zero.
 * Orders and payments themselves are never changed or deleted.
 */
export function AdminArchivesPage() {
  const { user } = useAuth()
  // The API refuses a moderator anyway; send one who types the URL back to the dashboard.
  if (user && user.role !== "OWNER") return <Navigate to="/admin" replace />
  return <ArchivesContent />
}

function ArchivesContent() {
  useDocumentTitle("Archives | PanelScan Admin")
  const archives = useAdminResource((signal) => getDashboardArchives(signal), [])
  const cycle = useAdminResource((signal) => getDashboardCycle(signal), [])
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  const rows = archives.data?.archives ?? []
  const currentCycle = cycle.data?.cycle

  async function handleDownload(archive: DashboardArchiveSummary) {
    if (downloadingId) return
    setDownloadingId(archive.id)
    try {
      const blob = await downloadDashboardArchive(archive.id)
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = archiveFileName(archive)
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      toast.success("Archive downloaded", { description: `${archiveFileName(archive)} has been saved.` })
    } catch (error) {
      toast.error("Archive not downloaded", { description: getAdminErrorMessage(error) })
    } finally {
      setDownloadingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Governance"
        title="Archives"
        description="At the end of every month, the dashboard's revenue, orders, product demand and orders by status are saved here and start again from zero on the 1st. Orders, payments and products are never changed or deleted. Times are in Philippine time."
      />

      <section className="surface-card flex items-start gap-3 p-4" aria-label="Current cycle">
        <CalendarClock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        {cycle.isLoading ? <Skeleton className="h-10 w-full max-w-md" /> : cycle.error || !currentCycle ? (
          <p className="text-sm text-muted-foreground">The current cycle could not be loaded.</p>
        ) : (
          <div className="text-sm">
            <p className="font-medium">Current cycle #{currentCycle.cycleNumber}: {formatManilaDateTime(currentCycle.startTimestamp)} – {formatManilaDateTime(currentCycle.endTimestamp)}</p>
            <p className="mt-0.5 text-muted-foreground">
              So far: {formatMoney(currentCycle.totalGrossRevenue)} gross revenue from {formatCount(currentCycle.totalOrdersCount)} order{currentCycle.totalOrdersCount === 1 ? "" : "s"}. It is archived automatically after {formatManilaDate(currentCycle.endTimestamp)}.
            </p>
          </div>
        )}
      </section>

      {archives.error ? <ErrorState message={archives.error} onRetry={archives.reload} /> : (
        <DataTable
          caption="Archived monthly dashboard cycles"
          isLoading={archives.isLoading}
          rows={rows}
          getRowId={(row) => row.id}
          empty={
            <EmptyState
              icon={Archive}
              title="No archives yet"
              description={currentCycle
                ? `The first archive is created automatically when cycle #${currentCycle.cycleNumber} ends on ${formatManilaDate(currentCycle.endTimestamp)}.`
                : "An archive is created automatically at the end of each month."}
            />
          }
          columns={[
            {
              key: "period",
              header: "Cycle Period",
              primary: true,
              cell: (row) => (
                <span>
                  {/* The period itself opens this cycle on the dashboard. */}
                  <Link
                    to={`/admin?archiveId=${row.id}`}
                    className="block rounded-sm font-medium text-primary underline-offset-4 transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    title={`View cycle #${row.cycleNumber} on the dashboard`}
                  >
                    {formatManilaDateTime(row.startTimestamp)} – {formatManilaDateTime(row.endTimestamp)}
                  </Link>
                  <span className="block text-xs text-muted-foreground">Cycle #{row.cycleNumber}</span>
                </span>
              ),
            },
            { key: "archived", header: "Archived", cell: (row) => <span className="text-muted-foreground">{formatManilaDateTime(row.archivedAt)}</span> },
            {
              key: "metrics",
              header: "Metric Types Covered",
              secondary: true,
              cell: (row) => (
                <span className="flex flex-wrap gap-1">
                  {row.metricTypesIncluded.map((type) => (
                    <span key={type} className="rounded-full border border-border bg-secondary px-2 py-0.5 text-[11px] whitespace-nowrap text-secondary-foreground">{METRIC_LABELS[type] ?? type}</span>
                  ))}
                </span>
              ),
            },
            {
              key: "summary",
              header: "Cycle Summary",
              cell: (row) => (
                <span>
                  <span className="block font-medium tabular-nums">{formatMoney(row.totalGrossRevenue)}</span>
                  <span className="block text-xs text-muted-foreground">{formatCount(row.totalOrdersCount)} order{row.totalOrdersCount === 1 ? "" : "s"}</span>
                </span>
              ),
            },
          ]}
          rowAction={(row) => (
            <Button variant="outline" size="sm" onClick={() => void handleDownload(row)} disabled={downloadingId !== null}>
              {downloadingId === row.id ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download data-icon="inline-start" aria-hidden="true" />}
              Download Excel Record
            </Button>
          )}
        />
      )}
    </div>
  )
}
