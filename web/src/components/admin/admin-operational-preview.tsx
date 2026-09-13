import { RefreshCw } from "lucide-react"
import { useState } from "react"
import type { FormEvent, ReactNode } from "react"
import { toast } from "sonner"

import type { AdminPreviewRole } from "@/admin/admin-preview-capabilities"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { DataTable } from "@/components/admin/data-table"
import { MetricCard } from "@/components/admin/metric-card"
import { StatusBadge } from "@/components/admin/status-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { AdminReviewRow, AdminReviewSection } from "@/data/admin-review"
import {
  resolveProjectForOrder,
  updateProjectRecord,
  useBusinessRows,
} from "@/preview/business-store"
import { VALID_PROJECT_STATUSES } from "@/preview/business-validation"
import type { LucideIcon } from "lucide-react"

interface OperationalActionConfig {
  label: string
  title: string
  description: string
  statuses?: string[]
  numericField?: "onHand" | "assignments"
  numericLabel?: string
}

const actionConfigs: Record<string, OperationalActionConfig> = {
  dashboard: { label: "Open activity", title: "Review operational activity", description: "Inspect this activity and preview its next operational state.", statuses: ["PENDING", "PROCESSING", "IN_PROGRESS", "COMPLETED"] },
  products: { label: "Edit product", title: "Update product preview", description: "Preview a catalogue status change for this product.", statuses: ["ACTIVE", "INACTIVE"] },
  inventory: { label: "Adjust stock", title: "Adjust inventory preview", description: "Preview a stock quantity or restock-status adjustment.", statuses: ["HEALTHY", "LOW_STOCK", "OUT_OF_STOCK"], numericField: "onHand", numericLabel: "Stock quantity" },
  sales: { label: "Update order", title: "Update fulfilment preview", description: "Preview the next step in this order workflow.", statuses: ["PENDING", "PROCESSING", "SHIPPED", "DELIVERED"] },
  installers: { label: "Manage installer", title: "Manage installer preview", description: "Preview installer availability and assigned-job count.", statuses: ["ACTIVE", "INACTIVE"], numericField: "assignments", numericLabel: "Assigned jobs" },
  requests: { label: "Review request", title: "Review change request", description: "Preview the owner approval decision recorded for this change request.", statuses: ["PENDING", "APPROVED", "REJECTED"] },
  projects: { label: "Update project", title: "Update project preview", description: "Preview the project moving to its next operational state.", statuses: ["PENDING", "IN_PROGRESS", "READY_FOR_REVIEW", "COMPLETED"] },
  support: { label: "Manage conversation", title: "Manage support preview", description: "Preview the service status for this conversation.", statuses: ["PENDING", "IN_PROGRESS", "COMPLETED"] },
}

export function AdminOperationalPreview({ role, section, icon }: { role: AdminPreviewRole; section: AdminReviewSection; icon?: LucideIcon }) {
  const [rows, setRows] = useBusinessRows(section.id)

  // Standard operational action state (orders, stock, dashboard, requests)
  const [selected, setSelected] = useState<AdminReviewRow | null>(null)
  const [draftStatus, setDraftStatus] = useState("")
  const [draftNumber, setDraftNumber] = useState("")

  // Dedicated Project update state (Projects tab & Orders & Sales tab)
  const [projectToEdit, setProjectToEdit] = useState<{ project: AdminReviewRow; orderRow?: AdminReviewRow } | null>(null)
  const [projectDraftStatus, setProjectDraftStatus] = useState("")
  const [projectDraftSurface, setProjectDraftSurface] = useState("")
  const [projectDraftNotes, setProjectDraftNotes] = useState("")
  const [projectErrors, setProjectErrors] = useState<Record<string, string>>({})

  const isRequests = section.id === "requests"
  const isProjects = section.id === "projects"
  const isSales = section.id === "sales"
  const canManageRequests = role === "OWNER"
  const action = actionConfigs[section.id] ?? actionConfigs.dashboard

  function openAction(row: AdminReviewRow) {
    if (isRequests && !canManageRequests) return
    setSelected(row)
    setDraftStatus(row.status ?? action.statuses?.[0] ?? "")
    setDraftNumber(action.numericField ? row[action.numericField] ?? "0" : "")
  }

  function closeAction() {
    setSelected(null)
    setDraftStatus("")
    setDraftNumber("")
  }

  function applyPreviewAction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selected) return
    if (isRequests && !canManageRequests) {
      toast.error("Only Owners can review and resolve change requests.")
      closeAction()
      return
    }
    setRows((previous) => previous.map((row) => row.id === selected.id ? {
      ...row,
      ...(draftStatus ? { status: draftStatus } : {}),
      ...(action.numericField ? { [action.numericField]: String(Math.max(0, Number.parseInt(draftNumber, 10) || 0)) } : {}),
    } : row))
    closeAction()
    toast.success(isRequests ? "Request decision recorded in preview" : "Operational change added to preview", {
      description: "This session-only update was not sent to the PanelScan backend.",
    })
  }

  function openProjectUpdate(project: AdminReviewRow, orderRow?: AdminReviewRow) {
    setProjectToEdit({ project, orderRow })
    setProjectDraftStatus(project.status ?? "PENDING")
    setProjectDraftSurface(project.surface ?? "")
    setProjectDraftNotes(project.notes ?? "")
    setProjectErrors({})
  }

  function closeProjectUpdate() {
    setProjectToEdit(null)
    setProjectDraftStatus("")
    setProjectDraftSurface("")
    setProjectDraftNotes("")
    setProjectErrors({})
  }

  function handleProjectUpdateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!projectToEdit) return

    const result = updateProjectRecord(role, projectToEdit.project.id, {
      status: projectDraftStatus,
      surface: projectDraftSurface,
      notes: projectDraftNotes,
    })

    if (!result.success) {
      if (result.errors) {
        setProjectErrors(result.errors)
        const firstError = Object.values(result.errors)[0]
        if (firstError) toast.error(firstError)
      }
      return
    }

    toast.success("Project updated in preview", {
      description: `Project "${result.project?.project ?? projectToEdit.project.id}" updated to ${projectDraftStatus.replaceAll("_", " ").toLowerCase()}.`,
    })
    closeProjectUpdate()
  }

  const primaryColumn = section.columns[0]
  const selectedLabel = selected?.[primaryColumn?.key ?? "id"] ?? "record"

  let rowAction: ((row: AdminReviewRow) => ReactNode) | undefined

  if (isRequests) {
    rowAction = canManageRequests ? (row: AdminReviewRow) => (
      <Button variant="outline" size="sm" onClick={() => openAction(row)}>
        {action.label}
      </Button>
    ) : undefined
  } else if (isProjects) {
    rowAction = (row: AdminReviewRow) => (
      <Button variant="outline" size="sm" onClick={() => openProjectUpdate(row)}>
        Update project
      </Button>
    )
  } else if (isSales) {
    rowAction = (row: AdminReviewRow) => {
      const linkedProject = resolveProjectForOrder(row)
      return (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (linkedProject) {
                openProjectUpdate(linkedProject, row)
              } else {
                toast.error("No linked project found for this order record.")
              }
            }}
          >
            Update project
          </Button>
          <Button variant="ghost" size="sm" onClick={() => openAction(row)}>
            Update order
          </Button>
        </div>
      )
    }
  } else {
    rowAction = (row: AdminReviewRow) => (
      <Button variant="outline" size="sm" onClick={() => openAction(row)}>
        {action.label}
      </Button>
    )
  }

  const headerEyebrow = isRequests && role === "MODERATOR" ? "Change requests" : section.eyebrow
  const headerTitle = isRequests && role === "MODERATOR" ? "Submitted change requests" : section.title
  const headerDescription = isRequests && role === "MODERATOR"
    ? "View your submitted change requests and check whether they have been approved, rejected, or remain pending owner review."
    : section.description
  const roleBadge = isRequests && role === "MODERATOR"
    ? "Moderator status view"
    : `${role === "OWNER" ? "Owner" : "Moderator"} operational access`
  const recordsTitle = isRequests && role === "MODERATOR" ? "Submitted requests" : "Operational records"
  const recordsNote = isRequests && role === "MODERATOR"
    ? "Track the status of submitted change requests. Approval and rejection are managed by the owner."
    : section.note

  return (
    <>
      <AdminPageHeader
        eyebrow={headerEyebrow}
        title={headerTitle}
        description={headerDescription}
        actions={<><span className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">{roleBadge}</span><Button variant="outline" size="sm" onClick={() => toast.success("Preview refreshed", { description: "Fictional sample data remains session-only." })}><RefreshCw data-icon="inline-start" aria-hidden="true" />Refresh</Button></>}
      />

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {section.metrics.map((metric) => <MetricCard key={metric.label} label={metric.label} value={metric.value} hint={metric.hint} icon={icon} />)}
      </div>

      <section className="mt-6" aria-labelledby="operational-records-title">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 id="operational-records-title" className="text-sm font-semibold">{recordsTitle}</h2><p className="mt-1 text-xs text-muted-foreground">{recordsNote}</p></div><span className="text-xs text-muted-foreground">Preview mode · changes are not persisted</span></div>
        <DataTable<AdminReviewRow>
          rows={rows}
          getRowId={(row) => row.id}
          caption={`${section.label} operational sample records`}
          columns={section.columns.map((column, index) => ({
            key: column.key,
            header: column.label,
            numeric: column.numeric,
            secondary: column.secondary,
            primary: index === 0,
            cell: (row) => {
              if (column.key === "status") {
                return <StatusBadge status={row[column.key]} />
              }
              if (isSales && column.key === "project") {
                return (
                  <div>
                    <div>{row.project}</div>
                    {row.projectStatus && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        Status: <span className="font-medium text-foreground">{row.projectStatus.replaceAll("_", " ").toLowerCase()}</span>
                      </div>
                    )}
                  </div>
                )
              }
              return <span className={column.numeric ? "font-medium tabular-nums" : undefined}>{row[column.key]}</span>
            },
          }))}
          rowAction={rowAction}
        />
      </section>

      {/* Standard operational action sheet (Order status, Stock, Dashboard) */}
      <Sheet open={Boolean(selected) && (!isRequests || canManageRequests)} onOpenChange={(open) => { if (!open) closeAction() }}>
        <SheetContent className="admin-surface w-full overflow-y-auto sm:max-w-md">
          <SheetHeader><SheetTitle>{action.title}</SheetTitle><SheetDescription>{action.description} All changes stay in this preview session.</SheetDescription></SheetHeader>
          {selected && <form className="space-y-5 px-4 pb-6" onSubmit={applyPreviewAction}>
            <div className="rounded-lg border border-border bg-secondary/50 p-3"><p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Selected record</p><p className="mt-1 break-words text-sm font-medium">{selectedLabel}</p></div>
            {selected.details && <div className="rounded-lg border border-border bg-card p-3 text-xs leading-5 text-muted-foreground"><p className="font-semibold text-foreground">Details</p><p className="mt-1">{selected.details}</p></div>}
            {action.numericField && <div><Label htmlFor="preview-operational-number">{action.numericLabel}</Label><Input id="preview-operational-number" type="number" min={0} inputMode="numeric" value={draftNumber} onChange={(event) => setDraftNumber(event.target.value)} className="mt-2 h-10" required /></div>}
            {action.statuses && <div><Label htmlFor="preview-operational-status">{isRequests ? "Review decision" : "Operational status"}</Label><select id="preview-operational-status" value={draftStatus} onChange={(event) => setDraftStatus(event.target.value)} className="mt-2 h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none">{action.statuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ").toLowerCase().replace(/^./, (letter) => letter.toUpperCase())}</option>)}</select></div>}
            <div className="rounded-lg border border-[color-mix(in_oklch,var(--status-info),transparent_70%)] bg-[var(--status-info-surface)] p-3 text-xs leading-5 text-muted-foreground">{isRequests ? "Owner governance control: moderators can view request outcomes but cannot resolve requests." : "This control demonstrates intended operational access. It does not call an API or update production data."}</div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" onClick={closeAction}>Cancel</Button><Button type="submit">{isRequests ? "Record decision" : "Apply to preview"}</Button></div>
          </form>}
        </SheetContent>
      </Sheet>

      {/* Dedicated Project update sheet (Projects tab & Orders & Sales tab) */}
      <Sheet open={Boolean(projectToEdit)} onOpenChange={(open) => { if (!open) closeProjectUpdate() }}>
        <SheetContent className="admin-surface w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Update project preview</SheetTitle>
            <SheetDescription>
              Preview project status, surface specifications, and operational notes. Changes synchronize across preview views.
            </SheetDescription>
          </SheetHeader>
          {projectToEdit && (
            <form className="space-y-5 px-4 pb-6" onSubmit={handleProjectUpdateSubmit}>
              <div className="rounded-lg border border-border bg-secondary/50 p-3">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Project record</p>
                <p className="mt-1 break-words text-sm font-semibold">{projectToEdit.project.project ?? projectToEdit.project.id}</p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>
                    <span className="block font-medium text-foreground">Customer:</span>
                    <span>{projectToEdit.project.customer ?? "—"}</span>
                  </div>
                  <div>
                    <span className="block font-medium text-foreground">Linked order:</span>
                    <span>{projectToEdit.orderRow?.order ?? projectToEdit.project.orderNumber ?? "—"}</span>
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="project-update-status">Project status</Label>
                <select
                  id="project-update-status"
                  value={projectDraftStatus}
                  onChange={(e) => setProjectDraftStatus(e.target.value)}
                  className="mt-2 h-10 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
                >
                  {VALID_PROJECT_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {st.replaceAll("_", " ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}
                    </option>
                  ))}
                </select>
                {projectErrors.status && (
                  <p className="mt-1.5 text-xs text-destructive">{projectErrors.status}</p>
                )}
              </div>

              <div>
                <Label htmlFor="project-update-surface">Surface specification</Label>
                <Input
                  id="project-update-surface"
                  value={projectDraftSurface}
                  onChange={(e) => {
                    setProjectDraftSurface(e.target.value)
                    if (projectErrors.surface) {
                      setProjectErrors((prev) => ({ ...prev, surface: "" }))
                    }
                  }}
                  placeholder="e.g. Wall · 12.96 m²"
                  className="mt-2 h-10"
                  required
                />
                {projectErrors.surface && (
                  <p className="mt-1.5 text-xs text-destructive">{projectErrors.surface}</p>
                )}
              </div>

              <div>
                <Label htmlFor="project-update-notes">Operational notes</Label>
                <Textarea
                  id="project-update-notes"
                  value={projectDraftNotes}
                  onChange={(e) => {
                    setProjectDraftNotes(e.target.value)
                    if (projectErrors.notes) {
                      setProjectErrors((prev) => ({ ...prev, notes: "" }))
                    }
                  }}
                  placeholder="Add operational notes or measurement remarks..."
                  className="mt-2 min-h-20"
                />
                {projectErrors.notes && (
                  <p className="mt-1.5 text-xs text-destructive">{projectErrors.notes}</p>
                )}
              </div>

              <div className="rounded-lg border border-[color-mix(in_oklch,var(--status-info),transparent_70%)] bg-[var(--status-info-surface)] p-3 text-xs leading-5 text-muted-foreground">
                Operational changes are saved to the shared preview session and immediately reflected across Projects and Orders &amp; Sales.
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={closeProjectUpdate}>
                  Cancel
                </Button>
                <Button type="submit">
                  Save project
                </Button>
              </div>
            </form>
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
