import { Eye, KeyRound, Loader2, Mail, Pencil, Send, Trash2, UserPlus, Users } from "lucide-react"
import { useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import { checkStaffEmail, createModerator, deactivateUser, getUsers, reactivateUser, removeUser, resendStaffInvitation, sendStaffPasswordReset, updateUser } from "@/api/admin"
import { formatDate, formatDateTime } from "@/admin/admin-format"
import { getAdminErrorMessage, useAdminResource } from "@/admin/use-admin-resource"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { DataTable } from "@/components/admin/data-table"
import { EmptyState, ErrorState } from "@/components/admin/empty-state"
import { FilterBar, FilterSelect } from "@/components/admin/filter-bar"
import { MetricCard } from "@/components/admin/metric-card"
import { StatusBadge } from "@/components/admin/status-badge"
import { useAuth } from "@/auth/use-auth"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { useConfirm } from "@/components/confirm/use-confirm"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PhoneInput } from "@/components/ui/phone-input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { isValidPersonName, personNameMessage, sanitizeNameInput } from "@/auth/registration-validation"
import { ApiRequestError } from "@/api/client"
import { registerEmailErrorMessage } from "@/auth/errors"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { PHILIPPINE_PHONE_MESSAGE, formatPhoneForDisplay, isValidPhilippinePhone, phoneLocalDigits, toPhoneFieldValue } from "@/lib/phone"
import type { AdminUser } from "@/types/admin"

/**
 * Owner-only account administration. Owners invite moderators (who activate
 * their own account from an emailed code), restrict and unrestrict access,
 * and permanently remove accounts that are already restricted.
 */
export function AdminTeamPage() {
  useDocumentTitle("Team | PanelScan Admin")
  const { user } = useAuth()
  const [roleFilter, setRoleFilter] = useState("MODERATOR")
  const [search, setSearch] = useState("")
  const [deactivating, setDeactivating] = useState<AdminUser | null>(null)
  const [removing, setRemoving] = useState<AdminUser | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null)
  const [showAddModerator, setShowAddModerator] = useState(false)
  const [reactivatingId, setReactivatingId] = useState<string | null>(null)
  const [resendingId, setResendingId] = useState<string | null>(null)
  const confirmUnrestrict = useConfirm()

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

  async function handleUnrestrict(account: AdminUser) {
    if (reactivatingId) return
    if (!(await confirmUnrestrict({
      title: "Unrestrict this account?",
      description: "They will be able to sign in again with their existing password.",
      details: [{ label: "Name", value: `${account.firstName} ${account.lastName}` }, { label: "Email", value: account.email }],
      confirmLabel: "Unrestrict account",
    }))) return
    setReactivatingId(account.id)
    try {
      await reactivateUser(account.id)
      toast.success(`${account.firstName} ${account.lastName} can sign in again.`)
      users.reload()
    } catch (error) {
      toast.error("Account not unrestricted", { description: getAdminErrorMessage(error) })
    } finally {
      setReactivatingId(null)
    }
  }

  async function handleResend(account: AdminUser) {
    if (resendingId) return
    setResendingId(account.id)
    try {
      await resendStaffInvitation(account.id)
      toast.success("Invitation sent again", { description: `A new code and link were emailed to ${account.email}.` })
    } catch (error) {
      toast.error("Invitation not sent", { description: getAdminErrorMessage(error) })
    } finally {
      setResendingId(null)
    }
  }

  // Looked up by id so the panel shows the reloaded row after an edit.
  const viewing = allUsers.find((candidate) => candidate.id === viewingId) ?? null

  const moderatorCount = allUsers.filter((candidate) => candidate.role === "MODERATOR").length
  const activeModerators = allUsers.filter((candidate) => candidate.role === "MODERATOR" && candidate.isActive).length
  const pendingModerators = allUsers.filter((candidate) => candidate.role === "MODERATOR" && candidate.invitationPending).length

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Access control"
        title="Team and accounts"
        description="Staff and customer accounts across PanelScan, with the ability to invite moderators, restrict access, and remove restricted accounts."
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
            <MetricCard label="Moderators" value={moderatorCount} hint={`${activeModerators} active${pendingModerators > 0 ? ` · ${pendingModerators} pending verification` : ""}`} icon={Users} isLoading={users.isLoading} />
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
              {
                key: "status",
                header: "Access",
                cell: (row) => row.invitationPending
                  ? <StatusBadge status="PENDING" label="Pending verification" />
                  : <StatusBadge status={row.isActive ? "ACTIVE" : "INACTIVE"} label={row.isActive ? "Active" : "Restricted"} />,
              },
              { key: "phone", header: "Phone", secondary: true, cell: (row) => row.phone ? formatPhoneForDisplay(row.phone) : "—" },
              { key: "created", header: "Joined", secondary: true, cell: (row) => <span className="text-muted-foreground">{row.invitationPending ? `Invited ${formatDate(row.createdAt)}` : formatDate(row.createdAt)}</span> },
            ]}
            rowAction={(row) => (
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setViewingId(row.id)} aria-label={`View ${row.firstName} ${row.lastName}`}>
                  <Eye data-icon="inline-start" aria-hidden="true" />
                  View
                </Button>
                {accessActions(row)}
              </div>
            )}
          />
        </>
      )}

      <AccountSheet account={viewing} canEdit={viewing?.role === "MODERATOR"} onClose={() => setViewingId(null)} onSaved={users.reload} />
      <RestrictDialog account={deactivating} onClose={() => setDeactivating(null)} onDone={() => { setDeactivating(null); users.reload() }} />
      <RemoveDialog account={removing} onClose={() => setRemoving(null)} onDone={() => { setRemoving(null); users.reload() }} />
      <AddModeratorSheet open={showAddModerator} onClose={() => setShowAddModerator(false)} onDone={() => { setShowAddModerator(false); users.reload() }} />
    </div>
  )

  /** Restrict / Unrestrict / Remove, or Resend / Cancel for a pending invitation. */
  function accessActions(row: AdminUser) {
    if (row.id === user?.id) return <span className="text-xs text-muted-foreground">You</span>
    if (row.invitationPending) {
      return (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => void handleResend(row)} disabled={resendingId !== null}>
            {resendingId === row.id ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Send data-icon="inline-start" aria-hidden="true" />}
            Resend
          </Button>
          <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setRemoving(row)}>Cancel invite</Button>
        </div>
      )
    }
    if (row.isActive) return <Button variant="outline" size="sm" onClick={() => setDeactivating(row)}>Restrict</Button>
    return (
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm" onClick={() => void handleUnrestrict(row)} disabled={reactivatingId === row.id}>{reactivatingId === row.id && <Loader2 className="animate-spin" aria-hidden="true" />}Unrestrict</Button>
        {row.role !== "OWNER" && (
          <Button variant="destructive" size="sm" onClick={() => setRemoving(row)}>
            <Trash2 data-icon="inline-start" aria-hidden="true" />
            Remove
          </Button>
        )}
      </div>
    )
  }
}

/**
 * An account's details, read-only by default. For a moderator the owner can
 * switch to editing the first name, last name and phone (same rules as when
 * the moderator was added); the email is the sign-in identity and stays fixed.
 */
function AccountSheet({ account, canEdit, onClose, onSaved }: { account: AdminUser | null; canEdit: boolean; onClose: () => void; onSaved: () => void }) {
  const [isEditing, setIsEditing] = useState(false)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [phone, setPhone] = useState("")
  const [errors, setErrors] = useState<{ firstName?: string; lastName?: string; phone?: string }>({})
  const [isSaving, setIsSaving] = useState(false)
  const [isSendingReset, setIsSendingReset] = useState(false)
  const confirm = useConfirm()
  // Only a moderator who can sign in today can be sent a reset (pending
  // invitations use Resend; restricted accounts can't sign in anyway).
  const canSendReset = canEdit && Boolean(account?.isActive) && !account?.invitationPending

  async function sendReset() {
    if (!account || isSendingReset) return
    if (!(await confirm({
      title: "Send a password reset?",
      description: "They'll get an email with a 6-digit code and a link to choose a new password. You never see the password. Their current password keeps working until they set the new one, which signs them out on every device.",
      details: [{ label: "Name", value: `${account.firstName} ${account.lastName}` }, { label: "Email", value: account.email }],
      confirmLabel: "Send reset email",
    }))) return
    setIsSendingReset(true)
    try {
      await sendStaffPasswordReset(account.id)
      toast.success("Password reset sent", { description: `A code and link were emailed to ${account.email}. It expires in 24 hours.` })
    } catch (error) {
      toast.error("Password reset not sent", { description: getAdminErrorMessage(error) })
    } finally {
      setIsSendingReset(false)
    }
  }

  function startEditing() {
    if (!account) return
    setFirstName(account.firstName)
    setLastName(account.lastName)
    setPhone(toPhoneFieldValue(account.phone))
    setErrors({})
    setIsEditing(true)
  }

  function close() {
    if (isSaving) return
    setIsEditing(false)
    onClose()
  }

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!account) return
    const nextErrors: typeof errors = {}
    for (const [key, label, value] of [["firstName", "First name", firstName], ["lastName", "Last name", lastName]] as const) {
      if (value.trim().length < 2) nextErrors[key] = `${label} must be at least 2 characters.`
      else if (!isValidPersonName(value)) nextErrors[key] = personNameMessage(label)
    }
    const hasPhone = phoneLocalDigits(phone) !== ""
    if (hasPhone && !isValidPhilippinePhone(phone)) nextErrors.phone = PHILIPPINE_PHONE_MESSAGE
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setIsSaving(true)
    try {
      await updateUser(account.id, { firstName: firstName.trim(), lastName: lastName.trim(), phone: hasPhone ? phone : null })
      toast.success("Account updated", { description: `${firstName.trim()} ${lastName.trim()}'s details were saved.` })
      setIsEditing(false)
      onSaved()
    } catch (error) {
      toast.error("Account not updated", { description: getAdminErrorMessage(error) })
    } finally {
      setIsSaving(false)
    }
  }

  const accessBadge = account?.invitationPending
    ? <StatusBadge status="PENDING" label="Pending verification" />
    : <StatusBadge status={account?.isActive ? "ACTIVE" : "INACTIVE"} label={account?.isActive ? "Active" : "Restricted"} />

  return (
    <Sheet open={Boolean(account)} onOpenChange={(open) => { if (!open) close() }}>
      <SheetContent className="admin-surface w-full overflow-y-auto sm:max-w-md">
        {account && (
          <>
            <SheetHeader>
              <SheetTitle>{isEditing ? "Edit account" : `${account.firstName} ${account.lastName}`}</SheetTitle>
              <SheetDescription className="break-all">{account.email}</SheetDescription>
            </SheetHeader>

            {isEditing ? (
              <form onSubmit={save} noValidate className="mt-2 space-y-4 px-4 pb-6">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-first-name">First name *</Label>
                    <Input id="edit-first-name" maxLength={35} value={firstName} onChange={(e) => { setFirstName(sanitizeNameInput("firstName", e.target.value)); setErrors((current) => ({ ...current, firstName: undefined })) }} aria-invalid={Boolean(errors.firstName)} aria-describedby={errors.firstName ? "edit-first-name-error" : undefined} />
                    {errors.firstName && <p id="edit-first-name-error" className="text-xs text-destructive">{errors.firstName}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="edit-last-name">Last name *</Label>
                    <Input id="edit-last-name" maxLength={35} value={lastName} onChange={(e) => { setLastName(sanitizeNameInput("lastName", e.target.value)); setErrors((current) => ({ ...current, lastName: undefined })) }} aria-invalid={Boolean(errors.lastName)} aria-describedby={errors.lastName ? "edit-last-name-error" : undefined} />
                    {errors.lastName && <p id="edit-last-name-error" className="text-xs text-destructive">{errors.lastName}</p>}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-email">Email address</Label>
                  <Input id="edit-email" value={account.email} disabled aria-describedby="edit-email-hint" />
                  <p id="edit-email-hint" className="text-xs text-muted-foreground">The email is the sign-in address and can't be changed here.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-phone">Phone number (optional)</Label>
                  <PhoneInput id="edit-phone" value={phone} onChange={(next) => { setPhone(next); setErrors((current) => ({ ...current, phone: undefined })) }} aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? "edit-phone-error" : "edit-phone-hint"} />
                  {errors.phone
                    ? <p id="edit-phone-error" className="text-xs text-destructive">{errors.phone}</p>
                    : <p id="edit-phone-hint" className="text-xs text-muted-foreground">Leave it empty to remove the number.</p>}
                </div>
                <div className="flex gap-2 pt-4">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => setIsEditing(false)} disabled={isSaving}>Cancel</Button>
                  <Button type="submit" className="flex-1" disabled={isSaving}>
                    {isSaving && <Loader2 className="animate-spin" aria-hidden="true" />}
                    Save changes
                  </Button>
                </div>
              </form>
            ) : (
              <div className="mt-2 space-y-6 px-4 pb-6">
                <dl className="divide-y divide-border rounded-lg border border-border text-sm">
                  {[
                    ["First name", account.firstName],
                    ["Last name", account.lastName],
                    ["Email", account.email],
                    ["Phone", account.phone ? formatPhoneForDisplay(account.phone) : "—"],
                    ["Role", account.role.charAt(0) + account.role.slice(1).toLowerCase()],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between gap-4 px-3 py-2.5">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="text-right font-medium break-all">{value}</dd>
                    </div>
                  ))}
                  <div className="flex items-center justify-between gap-4 px-3 py-2.5">
                    <dt className="text-muted-foreground">Access</dt>
                    <dd>{accessBadge}</dd>
                  </div>
                  <div className="flex justify-between gap-4 px-3 py-2.5">
                    <dt className="text-muted-foreground">{account.invitationPending ? "Invited" : "Joined"}</dt>
                    <dd className="text-right">{formatDateTime(account.createdAt)}</dd>
                  </div>
                  <div className="flex justify-between gap-4 px-3 py-2.5">
                    <dt className="text-muted-foreground">Last updated</dt>
                    <dd className="text-right">{formatDateTime(account.updatedAt)}</dd>
                  </div>
                </dl>
                {canEdit ? (
                  <div className="space-y-2">
                    <Button className="w-full" onClick={startEditing}>
                      <Pencil data-icon="inline-start" aria-hidden="true" />
                      Edit name and phone
                    </Button>
                    {canSendReset && (
                      <>
                        <Button variant="outline" className="w-full" onClick={() => void sendReset()} disabled={isSendingReset}>
                          {isSendingReset ? <Loader2 className="animate-spin" aria-hidden="true" /> : <KeyRound data-icon="inline-start" aria-hidden="true" />}
                          Send password reset
                        </Button>
                        <p className="text-xs text-muted-foreground">Passwords are never shown, even to the owner. A reset emails them a code to choose a new one.</p>
                      </>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">Only moderator accounts can be edited here.</p>
                )}
              </div>
            )}
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

/**
 * The owner only names the moderator and their email: the account is created
 * as "Pending verification" and an emailed code + link lets the moderator
 * verify the address and choose their own password, which activates it.
 */
function AddModeratorSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [email, setEmail] = useState("")
  const [phone, setPhone] = useState("")
  const [errorEmail, setErrorEmail] = useState<string | undefined>()
  const [errorPhone, setErrorPhone] = useState<string | undefined>()
  const [isSaving, setIsSaving] = useState(false)
  const [isCheckingEmail, setIsCheckingEmail] = useState(false)
  const savingRef = useRef(false)
  const confirm = useConfirm()

  /** An email problem from the API (wrong provider, temp mail, no mailbox, already used), or null for anything else. */
  const emailProblem = (error: unknown): string | null =>
    registerEmailErrorMessage(error) ?? (error instanceof ApiRequestError && error.status === 409 ? error.message : null)

  const reset = () => {
    setFirstName("")
    setLastName("")
    setEmail("")
    setPhone("")
    setErrorEmail(undefined)
    setErrorPhone(undefined)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorEmail(undefined)
    setErrorPhone(undefined)

    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      toast.error("Please fill in all required fields.")
      return
    }

    for (const [label, value] of [["First name", firstName], ["Last name", lastName]] as const) {
      if (value.trim().length < 2 || !isValidPersonName(value)) {
        toast.error(value.trim().length < 2 ? `${label} must be at least 2 characters.` : personNameMessage(label))
        return
      }
    }

    // Optional, but when given it must be a complete number.
    if (phone && !isValidPhilippinePhone(phone)) {
      setErrorPhone(PHILIPPINE_PHONE_MESSAGE)
      toast.error(PHILIPPINE_PHONE_MESSAGE)
      return
    }

    // The email is checked before asking for confirmation, so a wrong address
    // turns red right away instead of after the owner has confirmed.
    if (savingRef.current) return
    setIsCheckingEmail(true)
    try {
      await checkStaffEmail(email.trim())
    } catch (error) {
      const problem = emailProblem(error)
      if (problem) setErrorEmail(problem)
      toast.error("Invitation not sent", { description: problem ?? getAdminErrorMessage(error) })
      return
    } finally {
      setIsCheckingEmail(false)
    }

    if (!(await confirm({
      title: "Send a moderator invitation?",
      description: "We'll email them a 6-digit code and an activation link. The account stays Pending verification until they verify their email and set their own password.",
      details: [{ label: "Name", value: `${firstName.trim()} ${lastName.trim()}` }, { label: "Email", value: email.trim() }],
      confirmLabel: "Send invitation",
    }))) return
    // A second submit while this one is still saving never sends a second invitation.
    if (savingRef.current) return
    savingRef.current = true

    setIsSaving(true)
    try {
      await createModerator({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        role: "MODERATOR",
      })
      toast.success("Invitation sent", { description: `${firstName.trim()} ${lastName.trim()} can activate the account from the email sent to ${email.trim()}.` })
      reset()
      onDone()
    } catch (error) {
      // Email problems (rarely left by now) are shown under the Email field.
      const problem = emailProblem(error)
      if (problem) setErrorEmail(problem)
      toast.error("Invitation not sent", { description: problem ?? getAdminErrorMessage(error) })
    } finally {
      savingRef.current = false
      setIsSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) { reset(); onClose() } }}>
      <SheetContent className="admin-surface w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add Moderator</SheetTitle>
          <SheetDescription>Invite a staff moderator. They verify their email and set their own password before the account becomes active.</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4 px-4 pb-6">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mod-first-name">First name *</Label>
              <Input id="mod-first-name" required maxLength={35} value={firstName} onChange={(e) => setFirstName(sanitizeNameInput("firstName", e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mod-last-name">Last name *</Label>
              <Input id="mod-last-name" required maxLength={35} value={lastName} onChange={(e) => setLastName(sanitizeNameInput("lastName", e.target.value))} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mod-email">Email address *</Label>
            <Input id="mod-email" type="email" required value={email} onChange={(e) => { setEmail(e.target.value); setErrorEmail(undefined) }} aria-invalid={Boolean(errorEmail)} aria-describedby={errorEmail ? "mod-email-error" : "mod-email-hint"} />
            {errorEmail
              ? <p id="mod-email-error" className="text-xs text-destructive">{errorEmail}</p>
              : <p id="mod-email-hint" className="text-xs text-muted-foreground">Use a Gmail, Outlook/Hotmail, Yahoo, iCloud or Proton address, or the business email. The invitation code and link are sent here and expire in 48 hours.</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="mod-phone">Phone number (optional)</Label>
            <PhoneInput id="mod-phone" value={phone} onChange={(next) => { setPhone(next); setErrorPhone(undefined) }} aria-invalid={Boolean(errorPhone)} aria-describedby={errorPhone ? "mod-phone-error" : undefined} />
            {errorPhone && <p id="mod-phone-error" className="text-xs text-destructive">{errorPhone}</p>}
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={() => { reset(); onClose() }} disabled={isSaving || isCheckingEmail}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={isSaving || isCheckingEmail}>
              {isSaving || isCheckingEmail ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Mail data-icon="inline-start" aria-hidden="true" />}
              {isCheckingEmail ? "Checking email…" : "Send invitation"}
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
            {account?.firstName} {account?.lastName} ({account?.email}) will be deactivated and will no longer be able to sign in. Their orders, projects, and history are preserved. You can unrestrict the account from this page at any time.
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

/** Permanently removes a restricted account, or withdraws an invitation that was never accepted. */
function RemoveDialog({ account, onClose, onDone }: { account: AdminUser | null; onClose: () => void; onDone: () => void }) {
  const [isSaving, setIsSaving] = useState(false)
  const isInvitation = Boolean(account?.invitationPending)

  async function submit() {
    if (!account) return
    setIsSaving(true)
    try {
      await removeUser(account.id)
      toast.success(isInvitation ? `The invitation for ${account.email} was cancelled.` : `${account.firstName} ${account.lastName}'s account was removed.`)
      onDone()
    } catch (error) {
      toast.error(isInvitation ? "Invitation not cancelled" : "Account not removed", { description: getAdminErrorMessage(error) })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AlertDialog open={Boolean(account)} onOpenChange={(open) => { if (!open && !isSaving) onClose() }}>
      <AlertDialogContent className="admin-surface border-destructive/40">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-destructive">{isInvitation ? "Cancel this invitation?" : "Remove this account?"}</AlertDialogTitle>
          <AlertDialogDescription>
            {isInvitation
              ? `The invitation for ${account?.firstName} ${account?.lastName} (${account?.email}) will be withdrawn and its code will stop working. You can invite this email again later.`
              : "Are you sure you want to permanently remove this account? This action cannot be undone."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {account && !isInvitation && (
          <div className="space-y-2 text-sm">
            <dl className="space-y-1 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2">
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Name</dt><dd className="text-right font-medium">{account.firstName} {account.lastName}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Email</dt><dd className="text-right font-medium break-all">{account.email}</dd></div>
            </dl>
            <p className="text-xs text-muted-foreground">Every sign-in is revoked and the account disappears from this list. Its orders and history are kept for your records, and its email cannot be used for a new account.</p>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isSaving}>{isInvitation ? "Keep invitation" : "Keep account"}</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={(event) => { event.preventDefault(); void submit() }} disabled={isSaving}>
            {isSaving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Trash2 data-icon="inline-start" aria-hidden="true" />}
            {isInvitation ? "Cancel invitation" : "Remove account"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
