import { Eye, MoreHorizontal, Plus, ShieldCheck, UserCog, UserRoundCheck } from "lucide-react"
import { useState } from "react"
import type { FormEvent, InputHTMLAttributes } from "react"
import { toast } from "sonner"

import { MODERATOR_PASSWORD_MAX_LENGTH, MODERATOR_PASSWORD_MIN_LENGTH, validateModeratorForm } from "@/admin/moderator-preview-validation"
import type { ModeratorFormErrors, ModeratorFormValues } from "@/admin/moderator-preview-validation"
import { PasswordInput } from "@/components/auth/password-input"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { DataTable } from "@/components/admin/data-table"
import { StatusBadge } from "@/components/admin/status-badge"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"

type ModeratorStatus = "ACTIVE" | "PENDING" | "DISABLED"

interface PreviewModerator {
  id: string
  name: string
  email: string
  contactNumber: string
  role: "Moderator"
  status: ModeratorStatus
  created: string
  sessionOnly?: boolean
}

const INITIAL_FORM: ModeratorFormValues = {
  firstName: "",
  lastName: "",
  email: "",
  contactNumber: "",
  temporaryPassword: "",
  confirmTemporaryPassword: "",
}

const FICTIONAL_MODERATORS: PreviewModerator[] = [
  { id: "moderator-preview-1", name: "Sample Moderator One", email: "moderator.one@example.test", contactNumber: "+63 917 555 0101", role: "Moderator", status: "ACTIVE", created: "Aug 18, 2026" },
  { id: "moderator-preview-2", name: "Sample Moderator Two", email: "moderator.two@example.test", contactNumber: "+63 917 555 0102", role: "Moderator", status: "PENDING", created: "Aug 27, 2026" },
  { id: "moderator-preview-3", name: "Sample Moderator Three", email: "moderator.three@example.test", contactNumber: "+63 917 555 0103", role: "Moderator", status: "DISABLED", created: "Jul 09, 2026" },
]

const moderatorPermissions = [
  "Complete operational dashboard",
  "Products, projects, and customer records",
  "Inventory, stock, sales, and order management",
  "Installer, support, and change-request workflows",
]

const ownerPermissions = [
  "Business oversight and read-only products",
  "Create and manage moderator accounts",
  "Edit, disable, and remove moderators",
]

interface PreviewTextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  id: string
  label: string
  value: string
  error?: string
  onChange: (value: string) => void
}

function PreviewTextField({ id, label, value, error, onChange, ...props }: PreviewTextFieldProps) {
  const errorId = `${id}-error`
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 h-10" aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} required {...props} />
      {error && <p id={errorId} className="motion-swap mt-1.5 text-xs text-destructive">{error}</p>}
    </div>
  )
}

export function ModeratorManagementPreview() {
  const [moderators, setModerators] = useState(FICTIONAL_MODERATORS)
  const [isAdding, setIsAdding] = useState(false)
  const [form, setForm] = useState(INITIAL_FORM)
  const [errors, setErrors] = useState<ModeratorFormErrors>({})
  const [viewing, setViewing] = useState<PreviewModerator | null>(null)
  const [confirming, setConfirming] = useState<{ action: "disable" | "remove"; moderator: PreviewModerator } | null>(null)

  function updateField(field: keyof ModeratorFormValues, value: string) {
    setForm((previous) => ({ ...previous, [field]: value }))
    setErrors((previous) => {
      if (!previous[field] && !(field === "temporaryPassword" && previous.confirmTemporaryPassword)) return previous
      const next = { ...previous }
      delete next[field]
      if (field === "temporaryPassword") delete next.confirmTemporaryPassword
      return next
    })
  }

  function resetAddForm() {
    setForm(INITIAL_FORM)
    setErrors({})
  }

  function closeAddForm() {
    setIsAdding(false)
    resetAddForm()
  }

  function submitModerator(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = validateModeratorForm(form)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    const moderator: PreviewModerator = {
      id: `moderator-preview-${Date.now()}`,
      name: `${form.firstName.trim()} ${form.lastName.trim()}`,
      email: form.email.trim(),
      contactNumber: form.contactNumber.trim(),
      role: "Moderator",
      status: "PENDING",
      created: "Just now",
      sessionOnly: true,
    }

    setModerators((previous) => [moderator, ...previous])
    closeAddForm()
    toast.success("Moderator added to preview", { description: "This session-only row is not an authentication account." })
  }

  function confirmPreviewAction() {
    if (!confirming) return
    const { action, moderator } = confirming
    if (action === "disable") {
      setModerators((previous) => previous.map((row) => row.id === moderator.id ? { ...row, status: "DISABLED" } : row))
      toast.success("Access disabled in preview", { description: "No real account or permission was changed." })
    } else {
      setModerators((previous) => previous.filter((row) => row.id !== moderator.id))
      toast.success("Moderator removed from preview", { description: "The change only lasts for this page session." })
    }
    setConfirming(null)
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Team access"
        title="Moderators"
        description="Manage moderator access and permissions."
        actions={<Button size="sm" onClick={() => setIsAdding(true)}><Plus data-icon="inline-start" aria-hidden="true" />Add Moderator</Button>}
      />

      <section className="rounded-lg border border-[color-mix(in_oklch,var(--status-warning),transparent_70%)] bg-[var(--status-warning-surface)] p-4" aria-label="Frontend preview notice">
        <p className="text-sm font-semibold text-[var(--status-warning)]">Frontend preview · Session only</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">These fictional records demonstrate the intended Owner workflow. Adding or changing a moderator here does not create a login, send an invitation, or call the backend.</p>
      </section>

      <section className="grid gap-3 lg:grid-cols-2" aria-labelledby="role-access-title">
        <h2 id="role-access-title" className="sr-only">Owner and moderator access comparison</h2>
        <AccessCard icon={ShieldCheck} role="OWNER" summary="Oversight + moderator management" permissions={ownerPermissions} />
        <AccessCard icon={UserCog} role="MODERATOR" summary="Full business operations" permissions={moderatorPermissions} />
      </section>

      <section aria-labelledby="moderator-list-title">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div><h2 id="moderator-list-title" className="text-sm font-semibold">Moderator accounts</h2><p className="mt-1 text-xs text-muted-foreground">Fictional sample data plus additions from this page session.</p></div>
          <span className="text-xs text-muted-foreground">{moderators.length} preview record{moderators.length === 1 ? "" : "s"}</span>
        </div>
        <DataTable
          caption="Preview moderator accounts with role and access status"
          rows={moderators}
          getRowId={(row) => row.id}
          columns={[
            { key: "name", header: "Name", primary: true, cell: (row) => <span><span className="block font-medium">{row.name}</span>{row.sessionOnly && <span className="block text-xs text-muted-foreground">Added this session</span>}</span> },
            { key: "email", header: "Email", secondary: true, cell: (row) => <span className="break-all text-muted-foreground">{row.email}</span> },
            { key: "role", header: "Role", cell: (row) => row.role },
            { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} label={row.status === "DISABLED" ? "Disabled" : row.status === "PENDING" ? "Pending" : "Active"} /> },
            { key: "created", header: "Created", secondary: true, cell: (row) => <span className="text-muted-foreground">{row.created}</span> },
          ]}
          rowAction={(row) => <ModeratorActions moderator={row} onView={setViewing} onConfirm={setConfirming} />}
        />
      </section>

      <Sheet open={isAdding} onOpenChange={(open) => { if (!open) closeAddForm(); else setIsAdding(true) }}>
        <SheetContent className="admin-surface @container/moderator-form w-[calc(100vw-1rem)]! max-w-none! overflow-y-auto sm:w-[calc(100vw-2rem)]! sm:max-w-2xl!">
          <SheetHeader><SheetTitle>Add Moderator</SheetTitle><SheetDescription>Preview the details an Owner would provide. No account or invitation will be created.</SheetDescription></SheetHeader>
          <form className="space-y-5 px-4 pb-6" onSubmit={submitModerator} noValidate>
            <div className="grid gap-4 @md/moderator-form:grid-cols-2">
              <PreviewTextField id="moderator-first-name" name="firstName" label="First Name" value={form.firstName} onChange={(value) => updateField("firstName", value)} autoComplete="given-name" maxLength={50} error={errors.firstName} />
              <PreviewTextField id="moderator-last-name" name="lastName" label="Last Name" value={form.lastName} onChange={(value) => updateField("lastName", value)} autoComplete="family-name" maxLength={50} error={errors.lastName} />
            </div>
            <PreviewTextField id="moderator-email" name="email" label="Email Address" type="email" value={form.email} onChange={(value) => updateField("email", value)} autoComplete="email" maxLength={254} error={errors.email} />
            <PreviewTextField id="moderator-contact" name="contactNumber" label="Contact Number" type="tel" inputMode="tel" value={form.contactNumber} onChange={(value) => updateField("contactNumber", value)} autoComplete="tel" maxLength={20} error={errors.contactNumber} />
            <div>
              <Label htmlFor="moderator-role">Role</Label>
              <Input id="moderator-role" value="Moderator" className="mt-2 h-10" readOnly disabled />
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">Full operational role. Creating or managing other moderators remains Owner-only.</p>
            </div>
            <div className="grid gap-4 @xl/moderator-form:grid-cols-2">
              <PasswordInput id="moderator-password" name="temporaryPassword" label="Temporary Password" value={form.temporaryPassword} onChange={(value) => updateField("temporaryPassword", value)} autoComplete="new-password" minLength={MODERATOR_PASSWORD_MIN_LENGTH} maxLength={MODERATOR_PASSWORD_MAX_LENGTH} description="8–16 characters" error={errors.temporaryPassword} inputClassName="h-10" />
              <PasswordInput id="moderator-confirm-password" name="confirmTemporaryPassword" label="Confirm Temporary Password" value={form.confirmTemporaryPassword} onChange={(value) => updateField("confirmTemporaryPassword", value)} autoComplete="new-password" minLength={MODERATOR_PASSWORD_MIN_LENGTH} maxLength={MODERATOR_PASSWORD_MAX_LENGTH} error={errors.confirmTemporaryPassword} inputClassName="h-10" />
            </div>
            <div className="rounded-lg border border-border bg-secondary/50 p-3 text-xs leading-5 text-muted-foreground">Passwords are used only for this form validation and are cleared when the sheet closes. They are never stored or sent anywhere.</div>
            <div className="sticky bottom-0 -mx-4 flex flex-col-reverse gap-2 border-t border-border bg-popover/95 px-4 pt-3 pb-1 backdrop-blur @md/moderator-form:flex-row @md/moderator-form:justify-end">
              <Button type="button" variant="outline" className="w-full @md/moderator-form:w-auto" onClick={closeAddForm}>Cancel</Button>
              <Button type="submit" className="w-full @md/moderator-form:w-auto">Add to preview</Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={Boolean(viewing)} onOpenChange={(open) => { if (!open) setViewing(null) }}>
        <SheetContent className="admin-surface w-full overflow-y-auto sm:max-w-md">
          <SheetHeader><SheetTitle>{viewing?.name ?? "Moderator"}</SheetTitle><SheetDescription>Session-only moderator details and the fixed operational permission preview.</SheetDescription></SheetHeader>
          {viewing && <div className="space-y-5 px-4 pb-6">
            <dl className="space-y-3 rounded-lg border border-border bg-card p-4 text-sm">
              <DetailRow label="Email" value={viewing.email} />
              <DetailRow label="Contact" value={viewing.contactNumber} />
              <DetailRow label="Role" value={viewing.role} />
              <DetailRow label="Status" value={viewing.status.charAt(0) + viewing.status.slice(1).toLowerCase()} />
              <DetailRow label="Created" value={viewing.created} />
            </dl>
            <div><h3 className="text-sm font-semibold">Moderator access</h3><ul className="mt-3 space-y-2">{moderatorPermissions.map((permission) => <li key={permission} className="flex items-start gap-2 text-sm text-muted-foreground"><UserRoundCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />{permission}</li>)}</ul></div>
          </div>}
        </SheetContent>
      </Sheet>

      <AlertDialog open={Boolean(confirming)} onOpenChange={(open) => { if (!open) setConfirming(null) }}>
        <AlertDialogContent className="admin-surface">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirming?.action === "remove" ? "Remove this moderator from the preview?" : "Disable access in the preview?"}</AlertDialogTitle>
            <AlertDialogDescription>{confirming?.moderator.name} will be {confirming?.action === "remove" ? "removed from this session-only list" : "shown as disabled in this session-only list"}. No real account, credential, or permission will be changed.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={confirmPreviewAction}>{confirming?.action === "remove" ? "Remove from preview" : "Disable in preview"}</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function AccessCard({ icon: Icon, role, summary, permissions }: { icon: typeof ShieldCheck; role: string; summary: string; permissions: string[] }) {
  return <article className="surface-card p-5"><div className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-primary"><Icon className="size-4" aria-hidden="true" /></span><div><p className="text-xs font-semibold tracking-[0.12em] text-muted-foreground">{role}</p><h3 className="mt-1 text-sm font-semibold">{summary}</h3></div></div><ul className="mt-4 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">{permissions.map((permission) => <li key={permission} className="flex items-start gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-primary" aria-hidden="true" />{permission}</li>)}</ul></article>
}

function ModeratorActions({ moderator, onView, onConfirm }: { moderator: PreviewModerator; onView: (moderator: PreviewModerator) => void; onConfirm: (value: { action: "disable" | "remove"; moderator: PreviewModerator }) => void }) {
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${moderator.name}`}><MoreHorizontal aria-hidden="true" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-48"><DropdownMenuItem onSelect={() => onView(moderator)}><Eye aria-hidden="true" />View moderator</DropdownMenuItem><DropdownMenuItem onSelect={() => toast.info("Permissions are fixed in this preview", { description: "Backend role authorization is required before permissions can be edited." })}><UserCog aria-hidden="true" />Edit permissions</DropdownMenuItem><DropdownMenuSeparator />{moderator.status !== "DISABLED" && <DropdownMenuItem variant="destructive" onSelect={() => onConfirm({ action: "disable", moderator })}>Disable access</DropdownMenuItem>}<DropdownMenuItem variant="destructive" onSelect={() => onConfirm({ action: "remove", moderator })}>Remove moderator</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="grid gap-1 sm:grid-cols-[5rem_minmax(0,1fr)]"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words font-medium sm:text-right">{value}</dd></div>
}
