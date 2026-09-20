import { ClipboardList, Loader2 } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { assignProject, getProjects, getUsers, updateProject, updateProjectStatus } from "@/api/admin"
import { formatDate, formatMoneyDetail, fullName } from "@/admin/admin-format"
import { getAdminErrorMessage, useAdminResource, useDebouncedValue } from "@/admin/use-admin-resource"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { DataTable, TablePagination } from "@/components/admin/data-table"
import { EmptyState, ErrorState } from "@/components/admin/empty-state"
import { FilterBar, FilterSelect } from "@/components/admin/filter-bar"
import { StatusBadge } from "@/components/admin/status-badge"
import { useAuth } from "@/auth/use-auth"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { useDocumentTitle } from "@/hooks/use-document-title"
import type { AdminProject, ProjectStatus } from "@/types/admin"

const PROJECT_STATUSES: ProjectStatus[] = ["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]

/**
 * Project Monitoring (owner) and Project Management (moderator) in one screen.
 * The backend already scopes the list - an owner receives every project, a
 * moderator only their assigned ones - so no client-side filtering pretends to
 * be a permission boundary.
 */
export function AdminProjectsPage() {
  useDocumentTitle("Projects | PanelScan Admin")
  const { user } = useAuth()
  const isOwner = user?.role === "OWNER"
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState("")
  const [searchInput, setSearchInput] = useState("")
  const search = useDebouncedValue(searchInput)
  const [selected, setSelected] = useState<AdminProject | null>(null)

  const projects = useAdminResource((signal) => getProjects({ page, limit: 20, status: status || undefined, search: search || undefined, source: "MOBILE_AR_3D" }, signal), [page, status, search])
  const rows = (projects.data?.projects ?? []).filter((row) => row.source === "MOBILE_AR_3D")

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow={isOwner ? "Project monitoring" : "Project management"}
        title="Customer projects"
        description={isOwner
          ? "Every project across PanelScan, with assignment, schedule, and progress."
          : "Projects assigned to you. Schedule and work notes can be updated; reassignment stays with the owner."}
      />

      {projects.error ? <ErrorState message={projects.error} onRetry={projects.reload} /> : (
        <>
          <FilterBar
            searchValue={searchInput}
            searchPlaceholder="Search project name"
            onSearchChange={(value) => { setSearchInput(value); setPage(1) }}
            hasActiveFilters={Boolean(searchInput || status)}
            onClear={() => { setSearchInput(""); setStatus(""); setPage(1) }}
          >
            <FilterSelect label="Status" value={status} allLabel="All statuses" options={PROJECT_STATUSES.map((value) => ({ value, label: value.charAt(0) + value.slice(1).toLowerCase().replace("_", " ") }))} onChange={(value) => { setStatus(value); setPage(1) }} />
          </FilterBar>

          <div key={`${status}|${search}|${page}`} className="motion-swap">
          <DataTable
            caption="Projects with customer, assignment, schedule, and status"
            isLoading={projects.isLoading}
            rows={rows}
            getRowId={(row) => row.id}
            empty={<EmptyState icon={ClipboardList} title="No projects yet" description="Projects created from the PanelScan mobile AR and 3D workflow will appear here." />}
            columns={[
              { key: "name", header: "Project", primary: true, cell: (row) => <span><span className="block font-medium">{row.name}</span><span className="block text-xs text-muted-foreground">{fullName(row.customer)}</span></span> },
              { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
              { key: "moderator", header: "Assigned to", cell: (row) => row.moderator ? fullName(row.moderator) : <span className="text-muted-foreground">Unassigned</span> },
              { key: "start", header: "Start", secondary: true, cell: (row) => <span className="text-muted-foreground">{formatDate(row.startDate)}</span> },
              { key: "end", header: "Target end", secondary: true, cell: (row) => <span className="text-muted-foreground">{formatDate(row.endDate)}</span> },
              { key: "budget", header: "Budget", numeric: true, cell: (row) => row.budget === null || row.budget === undefined || row.budget === "" ? "" : formatMoneyDetail(Number(row.budget)) },
            ]}
            rowAction={(row) => <Button variant="outline" size="sm" onClick={() => setSelected(row)}>Open</Button>}
          />
          </div>

          <TablePagination pagination={projects.data?.pagination ?? null} onPageChange={setPage} isLoading={projects.isLoading} />
        </>
      )}

      <ProjectSheet project={selected} isOwner={isOwner} onClose={() => setSelected(null)} onSaved={() => { setSelected(null); projects.reload() }} />
    </div>
  )
}

function ProjectSheet({ project, isOwner, onClose, onSaved }: { project: AdminProject | null; isOwner: boolean; onClose: () => void; onSaved: () => void }) {
  const [notes, setNotes] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [notesProjectId, setNotesProjectId] = useState<string | null>(null)
  // Moderator options are only fetchable by an owner (GET /users is owner-only).
  const staff = useAdminResource(async (signal) => (isOwner && project ? (await getUsers(signal)).users.filter((candidate) => candidate.role === "MODERATOR" && candidate.isActive) : []), [isOwner, project?.id])

  if (project && notesProjectId !== project.id) {
    setNotesProjectId(project.id)
    setNotes(project.notes ?? "")
  }

  async function run(action: () => Promise<unknown>, successMessage: string) {
    setIsSaving(true)
    try {
      await action()
      toast.success(successMessage)
      onSaved()
    } catch (error) {
      toast.error("Change not saved", { description: getAdminErrorMessage(error) })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Sheet open={Boolean(project)} onOpenChange={(open) => { if (!open) onClose() }}>
      <SheetContent className="admin-surface w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{project?.name ?? "Project"}</SheetTitle>
          <SheetDescription>{project ? `Customer: ${fullName(project.customer)}` : ""}</SheetDescription>
        </SheetHeader>

        {project && (
          <div className="space-y-6 px-4 pb-8">
            <dl className="grid grid-cols-2 gap-3 surface-card p-3 text-sm">
              <div><dt className="text-xs text-muted-foreground">Status</dt><dd className="mt-1"><StatusBadge status={project.status} /></dd></div>
              <div><dt className="text-xs text-muted-foreground">Assigned moderator</dt><dd className="mt-1">{project.moderator ? fullName(project.moderator) : "Unassigned"}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Start</dt><dd className="mt-1">{formatDate(project.startDate)}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Target end</dt><dd className="mt-1">{formatDate(project.endDate)}</dd></div>
            </dl>

            {project.description && <div><h3 className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">Overview</h3><p className="mt-2 text-sm leading-6">{project.description}</p></div>}

            <div className="space-y-2">
              <Label htmlFor="project-status">Update status</Label>
              <Select value={project.status} onValueChange={(next) => void run(() => updateProjectStatus(project.id, next as ProjectStatus), "Project status updated.")}>
                <SelectTrigger id="project-status" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>{PROJECT_STATUSES.map((value) => <SelectItem key={value} value={value}>{value.charAt(0) + value.slice(1).toLowerCase().replace("_", " ")}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="project-notes">Work notes</Label>
              <Textarea id="project-notes" rows={5} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Site conditions, progress, blockers" />
              <Button size="sm" disabled={isSaving || notes === (project.notes ?? "")} onClick={() => void run(() => updateProject(project.id, { notes }), "Work notes saved.")}>{isSaving && <Loader2 className="animate-spin" aria-hidden="true" />}Save notes</Button>
              <p className="text-xs text-muted-foreground">Notes are the moderator's running work log and are kept separate from the owner's project overview.</p>
            </div>

            {isOwner && (
              <div className="space-y-2 border-t border-border pt-5">
                <Label htmlFor="project-assign">Assign moderator</Label>
                <Select value={project.moderatorId ?? ""} onValueChange={(next) => void run(() => assignProject(project.id, { moderatorId: next }), "Project reassigned.")}>
                  <SelectTrigger id="project-assign" className="w-full"><SelectValue placeholder={staff.isLoading ? "Loading moderators…" : "Select a moderator"} /></SelectTrigger>
                  <SelectContent>{(staff.data ?? []).map((moderator) => <SelectItem key={moderator.id} value={moderator.id}>{fullName(moderator)}</SelectItem>)}</SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Reassignment is an owner-only action; moderators cannot reassign their own projects.</p>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
