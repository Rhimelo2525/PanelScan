import { Info, Loader2, Users } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { deactivateUser, getUsers } from "@/api/admin"
import { formatDate } from "@/admin/admin-format"
import { getAdminErrorMessage, useAdminResource } from "@/admin/use-admin-resource"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { DataTable } from "@/components/admin/data-table"
import { EmptyState, ErrorState } from "@/components/admin/empty-state"
import { FilterBar, FilterSelect } from "@/components/admin/filter-bar"
import { MetricCard } from "@/components/admin/metric-card"
import { StatusBadge } from "@/components/admin/status-badge"
import { useAuth } from "@/auth/use-auth"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { useDocumentTitle } from "@/hooks/use-document-title"
import type { AdminUser } from "@/types/admin"

/**
 * Owner-only account administration. Moderator *registration* is intentionally
 * absent: the backend hardcodes every self-registration to CUSTOMER and exposes
 * no endpoint that creates a staff account, so this screen states that gap
 * rather than presenting a form that cannot work.
 */
export function AdminTeamPage() {
  useDocumentTitle("Team | PanelScan Admin")
  const { user } = useAuth()
  const [roleFilter, setRoleFilter] = useState("MODERATOR")
  const [search, setSearch] = useState("")
  const [deactivating, setDeactivating] = useState<AdminUser | null>(null)

  const users = useAdminResource((signal) => getUsers(signal), [])
  const allUsers = useMemo(() => users.data?.users ?? [], [users.data])

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return allUsers.filter((candidate) => {
      const matchesRole = roleFilter === "" || candidate.role === roleFilter
      const matchesTerm = term === "" || `${candidate.firstName} ${candidate.lastName} ${candidate.email}`.toLowerCase().includes(term)
      return matchesRole && matchesTerm
    })
  }, [allUsers, roleFilter, search])

  const moderatorCount = allUsers.filter((candidate) => candidate.role === "MODERATOR").length
  const activeModerators = allUsers.filter((candidate) => candidate.role === "MODERATOR" && candidate.isActive).length

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Access control"
        title="Team and accounts"
        description="Staff and customer accounts across PanelScan, with the ability to restrict access."
      />

      <div className="flex items-start gap-2.5 surface-card p-4 text-sm leading-6">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <p><span className="font-medium">Moderator registration is not available in this build.</span> The backend creates every self-registered account as a customer and exposes no endpoint for creating a staff account, so moderators must currently be provisioned directly in the database. Owner accounts can still restrict existing accounts below.</p>
      </div>

      {users.error ? <ErrorState message={users.error} onRetry={users.reload} /> : (
        <>
          <section className="grid gap-3 sm:grid-cols-3" aria-label="Account summary">
            <MetricCard label="Moderators" value={moderatorCount} hint={`${activeModerators} active`} icon={Users} isLoading={users.isLoading} />
            <MetricCard label="Customers" value={allUsers.filter((candidate) => candidate.role === "CUSTOMER").length} isLoading={users.isLoading} />
            <MetricCard label="Owners" value={allUsers.filter((candidate) => candidate.role === "OWNER").length} isLoading={users.isLoading} />
          </section>

          <FilterBar
            searchValue={search}
            searchPlaceholder="Search name or email"
            onSearchChange={setSearch}
            hasActiveFilters={Boolean(search) || roleFilter !== "MODERATOR"}
            onClear={() => { setSearch(""); setRoleFilter("MODERATOR") }}
          >
            <FilterSelect label="Role" value={roleFilter} allLabel="All roles" options={[{ value: "OWNER", label: "Owner" }, { value: "MODERATOR", label: "Moderator" }, { value: "CUSTOMER", label: "Customer" }]} onChange={setRoleFilter} />
          </FilterBar>

          <DataTable
            caption="User accounts with role and status"
            isLoading={users.isLoading}
            rows={rows}
            getRowId={(row) => row.id}
            empty={<EmptyState icon={Users} title="No accounts match" description="Adjust the role filter or search to find an account." />}
            columns={[
              { key: "name", header: "Name", primary: true, cell: (row) => <span><span className="block font-medium">{row.firstName} {row.lastName}</span><span className="block text-xs break-all text-muted-foreground">{row.email}</span></span> },
              { key: "role", header: "Role", cell: (row) => <StatusBadge status={row.role === "CUSTOMER" ? "INACTIVE" : "ACTIVE"} label={row.role.charAt(0) + row.role.slice(1).toLowerCase()} /> },
              { key: "status", header: "Access", cell: (row) => <StatusBadge status={row.isActive ? "ACTIVE" : "INACTIVE"} label={row.isActive ? "Active" : "Restricted"} /> },
              { key: "phone", header: "Phone", secondary: true, cell: (row) => row.phone ?? "—" },
              { key: "created", header: "Joined", secondary: true, cell: (row) => <span className="text-muted-foreground">{formatDate(row.createdAt)}</span> },
            ]}
            rowAction={(row) => row.isActive && row.id !== user?.id
              ? <Button variant="outline" size="sm" onClick={() => setDeactivating(row)}>Restrict</Button>
              : <span className="text-xs text-muted-foreground">{row.id === user?.id ? "You" : "Restricted"}</span>}
          />
        </>
      )}

      <RestrictDialog account={deactivating} onClose={() => setDeactivating(null)} onDone={() => { setDeactivating(null); users.reload() }} />
    </div>
  )
}

function RestrictDialog({ account, onClose, onDone }: { account: AdminUser | null; onClose: () => void; onDone: () => void }) {
  const [isSaving, setIsSaving] = useState(false)

  async function submit() {
    if (!account) return
    setIsSaving(true)
    try {
      await deactivateUser(account.id)
      toast.success(`${account.firstName} ${account.lastName} can no longer sign in.`)
      onDone()
    } catch (error) {
      toast.error("Account not restricted", { description: getAdminErrorMessage(error) })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AlertDialog open={Boolean(account)} onOpenChange={(open) => { if (!open) onClose() }}>
      <AlertDialogContent className="admin-surface">
        <AlertDialogHeader>
          <AlertDialogTitle>Restrict this account?</AlertDialogTitle>
          <AlertDialogDescription>
            {account?.firstName} {account?.lastName} ({account?.email}) will be deactivated and will no longer be able to sign in. Their orders, projects, and history are preserved. This build has no endpoint to reactivate an account, so reversing this needs a database change.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep active</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => void submit()} disabled={isSaving}>{isSaving && <Loader2 className="animate-spin" aria-hidden="true" />}Restrict account</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
