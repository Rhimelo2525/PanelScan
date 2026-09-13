import { Loader2, Plus, ShieldCheck } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { approveRequest, createRequest, getRequests, rejectRequest } from "@/api/admin"
import { formatDateTime, formatEnumLabel, fullName } from "@/admin/admin-format"
import { getAdminErrorMessage, useAdminResource } from "@/admin/use-admin-resource"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { DataTable, TablePagination } from "@/components/admin/data-table"
import { EmptyState, ErrorState } from "@/components/admin/empty-state"
import { FilterBar, FilterSelect } from "@/components/admin/filter-bar"
import { StatusBadge } from "@/components/admin/status-badge"
import { useAuth } from "@/auth/use-auth"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { useDocumentTitle } from "@/hooks/use-document-title"
import type { AdminRequest, RequestType } from "@/types/admin"

const REQUEST_TYPES: RequestType[] = ["INVENTORY_RESTOCK", "REFUND", "DISCOUNT_APPROVAL", "PROJECT_BUDGET_CHANGE", "OTHER"]
const REQUEST_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"]

/**
 * The capstone's approval loop: a moderator raises a change request, the owner
 * approves or rejects it with a note. Both sides live here, and each role only
 * sees the controls the backend will actually accept from it.
 */
export function AdminRequestsPage() {
  useDocumentTitle("Requests | PanelScan Admin")
  const { user } = useAuth()
  const isOwner = user?.role === "OWNER"
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState("")
  const [type, setType] = useState("")
  const [isComposing, setIsComposing] = useState(false)
  const [reviewing, setReviewing] = useState<{ request: AdminRequest; decision: "approve" | "reject" } | null>(null)

  const requests = useAdminResource((signal) => getRequests({ page, limit: 20, status: status || undefined, type: type || undefined }, signal), [page, status, type])
  const rows = requests.data?.requests ?? []

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow={isOwner ? "Request approval" : "Change requests"}
        title={isOwner ? "Requests awaiting your decision" : "Your change requests"}
        description={isOwner
          ? "Moderators raise changes that need owner sign-off. Approving or rejecting records your decision and note against the request."
          : "Raise changes that require owner approval, and follow their outcome here."}
        actions={!isOwner ? <Button size="sm" onClick={() => setIsComposing(true)}><Plus data-icon="inline-start" aria-hidden="true" />New request</Button> : undefined}
      />

      {requests.error ? <ErrorState message={requests.error} onRetry={requests.reload} /> : (
        <>
          <FilterBar hasActiveFilters={Boolean(status || type)} onClear={() => { setStatus(""); setType(""); setPage(1) }}>
            <FilterSelect label="Status" value={status} allLabel="All statuses" options={REQUEST_STATUSES.map((value) => ({ value, label: formatEnumLabel(value) }))} onChange={(value) => { setStatus(value); setPage(1) }} />
            <FilterSelect label="Type" value={type} allLabel="All types" options={REQUEST_TYPES.map((value) => ({ value, label: formatEnumLabel(value) }))} onChange={(value) => { setType(value); setPage(1) }} />
          </FilterBar>

          <div key={`${status}|${type}|${page}`} className="motion-swap">
          <DataTable
            caption="Change requests with type, submitter, and review status"
            isLoading={requests.isLoading}
            rows={rows}
            getRowId={(row) => row.id}
            empty={<EmptyState icon={ShieldCheck} title="No requests" description={isOwner ? "Requests raised by moderators for owner approval appear here." : "You have not raised any change requests yet."} action={!isOwner ? <Button size="sm" onClick={() => setIsComposing(true)}>New request</Button> : undefined} />}
            columns={[
              { key: "title", header: "Request", primary: true, cell: (row) => <span><span className="block font-medium">{row.title}</span><span className="block text-xs text-muted-foreground">{formatEnumLabel(row.type)}</span></span> },
              { key: "by", header: "Submitted by", cell: (row) => fullName(row.requestedBy) },
              { key: "created", header: "Submitted", secondary: true, cell: (row) => <span className="text-muted-foreground">{formatDateTime(row.createdAt)}</span> },
              { key: "reviewer", header: "Reviewed by", secondary: true, cell: (row) => row.reviewedBy ? fullName(row.reviewedBy) : <span className="text-muted-foreground">—</span> },
              { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
            ]}
            rowAction={(row) => isOwner && row.status === "PENDING" ? (
              <span className="flex justify-end gap-2">
                <Button size="sm" onClick={() => setReviewing({ request: row, decision: "approve" })}>Approve</Button>
                <Button size="sm" variant="outline" onClick={() => setReviewing({ request: row, decision: "reject" })}>Reject</Button>
              </span>
            ) : row.reviewNote ? <span className="text-xs text-muted-foreground">Note recorded</span> : null}
          />
          </div>

          <TablePagination pagination={requests.data?.pagination ?? null} onPageChange={setPage} isLoading={requests.isLoading} />
        </>
      )}

      <ComposeRequestSheet open={isComposing} onClose={() => setIsComposing(false)} onCreated={() => { setIsComposing(false); requests.reload() }} />
      <ReviewDialog review={reviewing} onClose={() => setReviewing(null)} onDone={() => { setReviewing(null); requests.reload() }} />
    </div>
  )
}

function ComposeRequestSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [type, setType] = useState<RequestType>("INVENTORY_RESTOCK")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  async function submit() {
    if (title.trim().length < 3) {
      toast.error("Give the request a title of at least 3 characters.")
      return
    }
    setIsSaving(true)
    try {
      await createRequest({ type, title: title.trim(), description: description.trim() || undefined })
      toast.success("Request submitted for owner review.")
      setTitle(""); setDescription("")
      onCreated()
    } catch (error) {
      toast.error("Request not submitted", { description: getAdminErrorMessage(error) })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <SheetContent className="admin-surface w-full sm:max-w-md">
        <SheetHeader><SheetTitle>New change request</SheetTitle><SheetDescription>Requests are reviewed by the owner before they take effect.</SheetDescription></SheetHeader>
        <div className="space-y-5 px-4 pb-6">
          <div className="space-y-2">
            <Label htmlFor="request-type">Type</Label>
            <Select value={type} onValueChange={(next) => setType(next as RequestType)}>
              <SelectTrigger id="request-type" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{REQUEST_TYPES.map((value) => <SelectItem key={value} value={value}>{formatEnumLabel(value)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="request-title">Title</Label>
            <Input id="request-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Restock oak wall panels" maxLength={150} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="request-description">Details</Label>
            <Textarea id="request-description" rows={5} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Why this change is needed" maxLength={2000} />
          </div>
          <Button className="w-full" onClick={() => void submit()} disabled={isSaving}>{isSaving && <Loader2 className="animate-spin" aria-hidden="true" />}Submit for approval</Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function ReviewDialog({ review, onClose, onDone }: { review: { request: AdminRequest; decision: "approve" | "reject" } | null; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const isApprove = review?.decision === "approve"

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
      <AlertDialogContent className="admin-surface">
        <AlertDialogHeader>
          <AlertDialogTitle>{isApprove ? "Approve this request?" : "Reject this request?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {review?.request.title} — submitted by {fullName(review?.request.requestedBy)}. Your decision and note are recorded against the request and cannot be undone from this screen.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="review-note">Review note (optional)</Label>
          <Textarea id="review-note" rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder={isApprove ? "Approved for this week's procurement run" : "Reason for rejection"} maxLength={1000} />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant={isApprove ? "default" : "destructive"} onClick={() => void submit()} disabled={isSaving}>{isSaving && <Loader2 className="animate-spin" aria-hidden="true" />}{isApprove ? "Approve request" : "Reject request"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
