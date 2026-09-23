import { Loader2, RotateCw, Shield, ShieldCheck } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { approveRequest, getRequests, rejectRequest } from "@/api/admin"
import { formatCount, formatDateTime, formatEnumLabel, fullName } from "@/admin/admin-format"
import { getAdminErrorMessage, useAdminResource } from "@/admin/use-admin-resource"
import { useAuth } from "@/auth/use-auth"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { DataTable, TablePagination } from "@/components/admin/data-table"
import type { Column } from "@/components/admin/data-table"
import { EmptyState, ErrorState } from "@/components/admin/empty-state"
import { FilterBar, FilterSelect } from "@/components/admin/filter-bar"
import { MetricCard } from "@/components/admin/metric-card"
import { StatusBadge } from "@/components/admin/status-badge"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { cn } from "@/lib/utils"
import type { AdminRequest, RequestType } from "@/types/admin"

const REQUEST_TYPES: RequestType[] = ["INVENTORY_RESTOCK", "REFUND", "DISCOUNT_APPROVAL", "PROJECT_BUDGET_CHANGE", "OTHER"]
const REQUEST_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"]

const CHANGE_PAYLOAD_DELIMITER = "\n\n__PANELSCAN_CHANGE_PAYLOAD__:\n"

interface ChangePayload {
  action: "ADD_PRODUCT" | "EDIT_PRODUCT" | "DELETE_PRODUCT" | "ADJUST_STOCK"
  scope: "PRODUCTS" | "INVENTORY"
  productId?: string
  productName?: string
  sku?: string
  currentValues?: Record<string, any>
  proposedValues?: Record<string, any>
  productData?: any
  updateData?: any
  adjustData?: { direction: "add" | "reduce"; quantity: number }
}

function parseRequestDescription(raw?: string | null): { summary: string; payload: ChangePayload | null } {
  if (!raw) return { summary: "—", payload: null }
  const idx = raw.indexOf(CHANGE_PAYLOAD_DELIMITER)
  if (idx !== -1) {
    const summary = raw.substring(0, idx).trim()
    try {
      const payload = JSON.parse(raw.substring(idx + CHANGE_PAYLOAD_DELIMITER.length)) as ChangePayload
      return { summary, payload }
    } catch {
      return { summary, payload: null }
    }
  }
  return { summary: raw.trim(), payload: null }
}

function formatScope(type: RequestType, payload?: ChangePayload | null): string {
  if (payload?.scope === "PRODUCTS") return "Products"
  if (payload?.scope === "INVENTORY") return "Inventory"
  switch (type) {
    case "INVENTORY_RESTOCK":
      return "Inventory"
    case "PROJECT_BUDGET_CHANGE":
      return "Projects"
    case "DISCOUNT_APPROVAL":
      return "Sales"
    case "REFUND":
      return "Finance"
    case "OTHER":
    default:
      return "Accounts"
  }
}

function formatRelativeDate(dateString: string | null | undefined): string {
  if (!dateString) return "—"
  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return "—"

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diffDays = Math.round((today.getTime() - target.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Yesterday"

  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

/**
 * The capstone's approval loop:
 * - Moderator: Views and tracks submitted change requests (view-only).
 * - Owner: Reviews, approves, or rejects pending requests with decision notes.
 */
export function AdminRequestsPage() {
  const { user } = useAuth()
  const isOwner = user?.role === "OWNER"

  useDocumentTitle(isOwner ? "Requests | PanelScan Admin" : "Change Requests | PanelScan Admin")

  const [page, setPage] = useState(1)
  const [status, setStatus] = useState("")
  const [type, setType] = useState("")
  const [selectedRequest, setSelectedRequest] = useState<AdminRequest | null>(null)
  const [reviewing, setReviewing] = useState<{ request: AdminRequest; decision: "approve" | "reject" } | null>(null)

  const requests = useAdminResource(
    (signal) => getRequests({ page, limit: 50, status: status || undefined, type: type || undefined }, signal),
    [page, status, type],
    { pollIntervalMs: 20_000 }
  )
  const rows = useMemo(() => requests.data?.requests ?? [], [requests.data])

  // Compute live real metrics from database requests
  const { pendingCount, approvedThisMonth, rejectedThisMonth } = useMemo(() => {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

    const pending = rows.filter((r) => r.status === "PENDING").length
    const approved = rows.filter((r) => {
      if (r.status !== "APPROVED") return false
      const d = new Date(r.reviewedAt || r.updatedAt || r.createdAt)
      return d >= startOfMonth
    }).length
    const rejected = rows.filter((r) => {
      if (r.status !== "REJECTED") return false
      const d = new Date(r.reviewedAt || r.updatedAt || r.createdAt)
      return d >= startOfMonth
    }).length

    return { pendingCount: pending, approvedThisMonth: approved, rejectedThisMonth: rejected }
  }, [rows])

  // Table columns for Moderator view (exact match to desired design)
  const moderatorColumns: Column<AdminRequest>[] = [
    {
      key: "title",
      header: "Request",
      primary: true,
      cell: (row) => (
        <button
          type="button"
          onClick={() => setSelectedRequest(row)}
          className="text-left font-medium text-foreground hover:underline focus-visible:outline-none"
        >
          {row.title}
        </button>
      ),
    },
    {
      key: "scope",
      header: "Scope",
      cell: (row) => {
        const { payload } = parseRequestDescription(row.description)
        return <span className="text-muted-foreground">{formatScope(row.type, payload)}</span>
      },
    },
    {
      key: "details",
      header: "Request details",
      cell: (row) => {
        const { summary } = parseRequestDescription(row.description)
        return (
          <span className="line-clamp-2 max-w-lg text-muted-foreground">
            {summary || "—"}
          </span>
        )
      },
    },
    {
      key: "submittedBy",
      header: "Submitted by",
      cell: (row) => <span>{fullName(row.requestedBy)}</span>,
    },
    {
      key: "submitted",
      header: "Submitted",
      cell: (row) => (
        <span className="text-muted-foreground whitespace-nowrap">
          {formatRelativeDate(row.createdAt)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={row.status} />,
    },
  ]

  // Table columns for Owner view (review / approval controls)
  const ownerColumns: Column<AdminRequest>[] = [
    {
      key: "title",
      header: "Request",
      primary: true,
      cell: (row) => {
        const { payload } = parseRequestDescription(row.description)
        return (
          <button
            type="button"
            onClick={() => setSelectedRequest(row)}
            className="text-left group focus-visible:outline-none"
          >
            <span className="block font-medium group-hover:underline text-foreground">{row.title}</span>
            <span className="block text-xs text-muted-foreground">{formatScope(row.type, payload)}</span>
          </button>
        )
      },
    },
    {
      key: "by",
      header: "Submitted by",
      cell: (row) => fullName(row.requestedBy),
    },
    {
      key: "created",
      header: "Submitted",
      secondary: true,
      cell: (row) => <span className="text-muted-foreground">{formatDateTime(row.createdAt)}</span>,
    },
    {
      key: "reviewer",
      header: "Reviewed by",
      secondary: true,
      cell: (row) =>
        row.reviewedBy ? fullName(row.reviewedBy) : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={row.status} />,
    },
  ]

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow={isOwner ? "Request approval" : "CHANGE REQUESTS"}
        title={isOwner ? "Requests awaiting your decision" : "Submitted change requests"}
        description={
          isOwner
            ? "Moderators raise changes that need owner sign-off. Approving or rejecting records your decision and note against the request."
            : "View your submitted change requests and check whether they have been approved, rejected, or remain pending owner review."
        }
        actions={
          !isOwner ? (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-full border border-border bg-secondary/50 px-3 py-1 text-xs font-medium text-muted-foreground">
                Moderator status view
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => requests.reload()}
                disabled={requests.isLoading}
              >
                <RotateCw
                  className={cn("size-3.5", requests.isLoading && "animate-spin")}
                  data-icon="inline-start"
                  aria-hidden="true"
                />
                Refresh
              </Button>
            </div>
          ) : undefined
        }
      />

      {requests.error ? (
        <ErrorState message={requests.error} onRetry={requests.reload} />
      ) : (
        <>
          {/* Summary Cards (exact match to screenshot) */}
          {!isOwner && (
            <section className="grid gap-4 sm:grid-cols-3" aria-label="Change request summary metrics">
              <MetricCard
                label="Pending"
                value={formatCount(pendingCount)}
                hint="Awaiting operational review"
                icon={Shield}
                isLoading={requests.isLoading}
              />
              <MetricCard
                label="Approved this month"
                value={formatCount(approvedThisMonth)}
                hint="Representative decisions"
                icon={Shield}
                isLoading={requests.isLoading}
              />
              <MetricCard
                label="Rejected this month"
                value={formatCount(rejectedThisMonth)}
                hint="Representative decisions"
                icon={Shield}
                isLoading={requests.isLoading}
              />
            </section>
          )}

          {/* Owner Filter Controls */}
          {isOwner && (
            <FilterBar
              hasActiveFilters={Boolean(status || type)}
              onClear={() => {
                setStatus("")
                setType("")
                setPage(1)
              }}
            >
              <FilterSelect
                label="Status"
                value={status}
                allLabel="All statuses"
                options={REQUEST_STATUSES.map((val) => ({ value: val, label: formatEnumLabel(val) }))}
                onChange={(val) => {
                  setStatus(val)
                  setPage(1)
                }}
              />
              <FilterSelect
                label="Type"
                value={type}
                allLabel="All types"
                options={REQUEST_TYPES.map((val) => ({ value: val, label: formatEnumLabel(val) }))}
                onChange={(val) => {
                  setType(val)
                  setPage(1)
                }}
              />
            </FilterBar>
          )}

          {/* Moderator Section Header */}
          {!isOwner && (
            <div className="space-y-1 pt-2">
              <h2 className="text-base font-semibold tracking-tight">Submitted requests</h2>
              <p className="text-xs text-muted-foreground">
                Track the status of submitted change requests. Approval and rejection are managed by the owner.
              </p>
            </div>
          )}

          <div key={`${status}|${type}|${page}`} className="motion-swap">
            <DataTable
              caption={isOwner ? "Change requests awaiting owner review" : "Submitted change requests tracking table"}
              isLoading={requests.isLoading}
              rows={rows}
              getRowId={(row) => row.id}
              empty={
                <EmptyState
                  icon={ShieldCheck}
                  title="No requests"
                  description={
                    isOwner
                      ? "Requests raised by moderators for owner approval appear here."
                      : "No change requests have been submitted yet."
                  }
                />
              }
              columns={isOwner ? ownerColumns : moderatorColumns}
              rowAction={
                isOwner
                  ? (row) =>
                      row.status === "PENDING" ? (
                        <span className="flex justify-end gap-2">
                          <Button size="sm" onClick={() => setReviewing({ request: row, decision: "approve" })}>
                            Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setReviewing({ request: row, decision: "reject" })}
                          >
                            Reject
                          </Button>
                        </span>
                      ) : row.reviewNote ? (
                        <span className="text-xs text-muted-foreground">Note recorded</span>
                      ) : null
                  : undefined
              }
            />
          </div>

          <TablePagination
            pagination={requests.data?.pagination ?? null}
            onPageChange={setPage}
            isLoading={requests.isLoading}
          />
        </>
      )}

      {/* Read-only Request Details Sheet for tracking */}
      <RequestDetailsSheet
        request={selectedRequest}
        onClose={() => setSelectedRequest(null)}
      />

      {/* Owner Review Dialog */}
      <ReviewDialog
        review={reviewing}
        onClose={() => setReviewing(null)}
        onDone={() => {
          setReviewing(null)
          requests.reload()
        }}
      />
    </div>
  )
}

function RequestDetailsSheet({
  request,
  onClose,
}: {
  request: AdminRequest | null
  onClose: () => void
}) {
  if (!request) return null
  const { summary, payload } = parseRequestDescription(request.description)

  return (
    <Sheet open={Boolean(request)} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent className="admin-surface w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Request Details</SheetTitle>
          <SheetDescription>{request.title}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4 pb-6 mt-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Status</span>
            <StatusBadge status={request.status} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Scope</span>
            <span className="font-medium text-foreground">{formatScope(request.type, payload)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Submitted by</span>
            <span className="text-foreground">{fullName(request.requestedBy)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Submitted date</span>
            <span className="text-muted-foreground">{formatDateTime(request.createdAt)}</span>
          </div>

          <div className="space-y-1.5 border-t border-border pt-3">
            <Label className="text-xs text-muted-foreground">Request Details</Label>
            <p className="text-sm leading-relaxed text-foreground">
              {summary || "No additional details provided."}
            </p>
          </div>

          {payload?.proposedValues && (
            <div className="space-y-2 border-t border-border pt-3">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Current vs Proposed
              </Label>
              <div className="space-y-2 rounded-lg border border-border bg-muted/20 p-3">
                {Object.entries(payload.proposedValues).map(([key, val]) => (
                  <div key={key} className="space-y-1">
                    <span className="text-xs font-medium text-foreground">{key}</span>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded border border-border bg-card p-2">
                        <span className="block text-[10px] font-medium text-muted-foreground uppercase">Current</span>
                        <span className="font-mono text-foreground">{String(payload.currentValues?.[key] ?? "—")}</span>
                      </div>
                      <div className="rounded border border-primary/30 bg-primary/5 p-2">
                        <span className="block text-[10px] font-medium text-primary uppercase">Proposed</span>
                        <span className="font-mono font-medium text-foreground">{String(val ?? "—")}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {request.reviewNote && (
            <div className="space-y-1.5 border-t border-border pt-3">
              <Label className="text-xs text-muted-foreground">Owner Decision Note</Label>
              <p className="text-sm leading-relaxed text-foreground italic bg-muted/30 p-2.5 rounded-md border border-border">
                &ldquo;{request.reviewNote}&rdquo;
              </p>
              {request.reviewedBy && (
                <p className="text-xs text-muted-foreground">
                  Decided by {fullName(request.reviewedBy)} on {formatDateTime(request.reviewedAt)}
                </p>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}

function ReviewDialog({
  review,
  onClose,
  onDone,
}: {
  review: { request: AdminRequest; decision: "approve" | "reject" } | null
  onClose: () => void
  onDone: () => void
}) {
  const [note, setNote] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const isApprove = review?.decision === "approve"
  const { summary, payload } = parseRequestDescription(review?.request.description)

  async function submit() {
    if (!review) return
    setIsSaving(true)
    try {
      const trimmed = note.trim()
      if (isApprove) await approveRequest(review.request.id, trimmed || undefined)
      else await rejectRequest(review.request.id, trimmed || undefined)
      toast.success(`Request ${isApprove ? "approved" : "rejected"}.`)
      setNote("")
      onDone()
    } catch (error) {
      toast.error("Decision not recorded", { description: getAdminErrorMessage(error) })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AlertDialog open={Boolean(review)} onOpenChange={(open) => { if (!open) onClose() }}>
      <AlertDialogContent className="admin-surface sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle>{isApprove ? "Approve this change request?" : "Reject this change request?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {review?.request.title} — submitted by {fullName(review?.request.requestedBy)}.
            {isApprove
              ? " Approving will apply the requested changes directly to the live system."
              : " Rejecting will discard the proposed changes without modifying live data."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-border bg-muted/20 p-2.5">
            <span className="text-xs text-muted-foreground block mb-1 font-medium">Summary</span>
            <p className="text-xs text-foreground leading-relaxed">{summary}</p>
          </div>

          {payload?.proposedValues && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Current vs Proposed
              </Label>
              <div className="space-y-1.5 rounded-md border border-border bg-muted/10 p-2.5">
                {Object.entries(payload.proposedValues).map(([key, val]) => (
                  <div key={key} className="text-xs space-y-0.5">
                    <span className="font-medium text-foreground text-[11px]">{key}</span>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded border border-border bg-card p-1.5">
                        <span className="block text-[9px] font-medium text-muted-foreground uppercase">Current</span>
                        <span className="font-mono text-foreground">{String(payload.currentValues?.[key] ?? "—")}</span>
                      </div>
                      <div className="rounded border border-primary/30 bg-primary/5 p-1.5">
                        <span className="block text-[9px] font-medium text-primary uppercase">Proposed</span>
                        <span className="font-mono font-medium text-foreground">{String(val ?? "—")}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-1.5 pt-1">
            <Label htmlFor="review-note">Review note (optional)</Label>
            <Textarea
              id="review-note"
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={isApprove ? "Approved and applied to production" : "Reason for rejection"}
              maxLength={1000}
            />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSaving}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant={isApprove ? "default" : "destructive"}
            onClick={() => void submit()}
            disabled={isSaving}
          >
            {isSaving && <Loader2 className="animate-spin" aria-hidden="true" />}
            {isApprove ? "Approve request" : "Reject request"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
