import { Star } from "lucide-react"
import { useState } from "react"

import { getFeedback } from "@/api/admin"
import { formatDateTime, fullName } from "@/admin/admin-format"
import { useAdminResource } from "@/admin/use-admin-resource"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { DataTable, TablePagination } from "@/components/admin/data-table"
import { EmptyState, ErrorState } from "@/components/admin/empty-state"
import { MetricCard } from "@/components/admin/metric-card"
import { useDocumentTitle } from "@/hooks/use-document-title"

/** Read-only for staff: only the customer who wrote a review may edit or delete it. */
export function AdminFeedbackPage() {
  useDocumentTitle("Feedback | PanelScan Admin")
  const [page, setPage] = useState(1)
  const feedback = useAdminResource((signal) => getFeedback({ page, limit: 20 }, signal), [page])
  const rows = feedback.data?.feedbacks ?? []
  const average = rows.length === 0 ? null : rows.reduce((sum, row) => sum + row.rating, 0) / rows.length

  return (
    <div className="space-y-6">
      <AdminPageHeader eyebrow="Customer service" title="Feedback" description="Ratings and comments submitted by customers against their completed orders." />

      {feedback.error ? <ErrorState message={feedback.error} onRetry={feedback.reload} /> : (
        <>
          <section className="grid gap-3 sm:grid-cols-3" aria-label="Feedback summary">
            <MetricCard label="Entries on this page" value={rows.length} isLoading={feedback.isLoading} icon={Star} />
            <MetricCard label="Average rating (page)" value={average === null ? "No ratings" : average.toFixed(1)} isLoading={feedback.isLoading} />
            <MetricCard label="Total entries" value={feedback.data?.pagination.total ?? 0} isLoading={feedback.isLoading} />
          </section>

          <DataTable
            caption="Customer feedback with rating and comment"
            isLoading={feedback.isLoading}
            rows={rows}
            getRowId={(row) => row.id}
            empty={<EmptyState icon={Star} title="No feedback yet" description="Customer ratings appear here once orders have been completed and reviewed." />}
            columns={[
              { key: "customer", header: "Customer", primary: true, cell: (row) => <span className="font-medium">{fullName(row.customer)}</span> },
              { key: "rating", header: "Rating", cell: (row) => <span className="flex items-center gap-1 tabular-nums" aria-label={`${row.rating} out of 5`}><Star className="size-3.5 fill-current text-[var(--status-warning)]" aria-hidden="true" />{row.rating}/5</span> },
              { key: "order", header: "Order", secondary: true, cell: (row) => row.order?.orderNumber ?? <span className="text-muted-foreground">—</span> },
              { key: "comment", header: "Comment", cell: (row) => row.comment ? <span className="line-clamp-3 max-w-md">{row.comment}</span> : <span className="text-muted-foreground">No comment</span> },
              { key: "date", header: "Submitted", secondary: true, cell: (row) => <span className="text-muted-foreground">{formatDateTime(row.createdAt)}</span> },
            ]}
          />

          <TablePagination pagination={feedback.data?.pagination ?? null} onPageChange={setPage} isLoading={feedback.isLoading} />
        </>
      )}
    </div>
  )
}
