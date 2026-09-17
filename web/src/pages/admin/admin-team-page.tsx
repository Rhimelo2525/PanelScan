import { Loader2, UserPlus, Users } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { createModerator, deactivateUser, getUsers } from "@/api/admin"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useDocumentTitle } from "@/hooks/use-document-title"
import type { AdminUser } from "@/types/admin"

/**
 * Owner-only account administration. Allows owners to provision moderator accounts
 * and restrict access.
 */
export function AdminTeamPage() {
  useDocumentTitle("Team | PanelScan Admin")
  const { user } = useAuth()
  const [roleFilter, setRoleFilter] = useState("MODERATOR")
  const [search, setSearch] = useState("")
  const [deactivating, setDeactivating] = useState<AdminUser | null>(null)
  const [showAddModerator, setShowAddModerator] = useState(false)

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
        description="Staff and customer accounts across PanelScan, with the ability to provision moderators and restrict access."
        actions={user?.role === "OWNER" ? (
          <Button onClick={() => setShowAddModerator(true)}>
            <UserPlus className="size-4" data-icon="inline-start" aria-hidden="true" />
            Add moderator
          </Button>
        ) : undefined}
      />

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
      <AddModeratorSheet open={showAddModerator} onClose={() => setShowAddModerator(false)} onDone={() => { setShowAddModerator(false); users.reload() }} />
    </div>
  )
}

function AddModeratorSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [phone, setPhone] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  const reset = () => {
    setFirstName("")
    setLastName("")
    setEmail("")
    setPassword("")
    setPhone("")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password.trim()) {
      toast.error("Please fill in all required fields.")
      return
    }

    setIsSaving(true)
    try {
      await createModerator({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        password,
        phone: phone.trim() || undefined,
        role: "MODERATOR",
      })
      toast.success(`Moderator ${firstName.trim()} ${lastName.trim()} provisioned successfully.`)
      reset()
      onDone()
    } catch (error) {
      toast.error("Could not create moderator", { description: getAdminErrorMessage(error) })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) { reset(); onClose() } }}>
      <SheetContent className="admin-surface w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Add Moderator</SheetTitle>
          <SheetDescription>Provision a new staff moderator account with operations access.</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4 px-4 pb-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mod-first-name">First name *</Label>
              <Input id="mod-first-name" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mod-last-name">Last name *</Label>
              <Input id="mod-last-name" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mod-email">Email address *</Label>
            <Input id="mod-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mod-password">Temporary password *</Label>
            <Input id="mod-password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Minimum 8 characters" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mod-phone">Phone number (optional)</Label>
            <Input id="mod-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+63 912 345 6789" />
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={() => { reset(); onClose() }} disabled={isSaving}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={isSaving}>
              {isSaving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <UserPlus data-icon="inline-start" aria-hidden="true" />}
              Create moderator
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
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
