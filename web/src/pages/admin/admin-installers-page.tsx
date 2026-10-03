import { HardHat, Loader2, Plus } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { createInstaller, deactivateInstaller, getInstallers } from "@/api/admin"
import { formatDate } from "@/admin/admin-format"
import { getAdminErrorMessage, useAdminResource, useDebouncedValue } from "@/admin/use-admin-resource"
import { FilterBar } from "@/components/admin/filter-bar"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { DataTable, TablePagination } from "@/components/admin/data-table"
import { EmptyState, ErrorState } from "@/components/admin/empty-state"
import { StatusBadge } from "@/components/admin/status-badge"
import { useConfirm } from "@/components/confirm/use-confirm"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { PhoneInput } from "@/components/ui/phone-input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { formatMiddleInitial, isValidMiddleInitial, isValidPersonName, MIDDLE_INITIAL_MESSAGE, normalizeMiddleInitial, personNameMessage, registerSpaceRejection, sanitizeNameInput } from "@/auth/registration-validation"
import { registerEmailErrorMessage } from "@/auth/errors"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { PHILIPPINE_PHONE_MESSAGE, formatPhoneForDisplay, isValidPhilippinePhone } from "@/lib/phone"
import type { Installer } from "@/types/admin"

/** Moderator-only: the backend 403s an owner on every installer route. */
export function AdminInstallersPage() {
  useDocumentTitle("Installers | PanelScan Admin")
  const [page, setPage] = useState(1)
  const [isCreating, setIsCreating] = useState(false)
  const confirm = useConfirm()

  const [searchInput, setSearchInput] = useState("")
  const search = useDebouncedValue(searchInput.trim())
  const installers = useAdminResource((signal) => getInstallers({ page, limit: 10, search: search || undefined }, signal), [page, search])
  const rows = installers.data?.installers ?? []

  async function handleDeactivate(installer: Installer) {
    if (!(await confirm({
      title: `Deactivate ${installer.firstName} ${installer.lastName}?`,
      description: "They will no longer be listed as available for installation bookings.",
      confirmLabel: "Deactivate",
      destructive: true,
    }))) return
    try {
      await deactivateInstaller(installer.id)
      toast.success(`${installer.firstName} ${installer.lastName} is no longer listed as available.`)
      installers.reload()
    } catch (error) {
      toast.error("Installer not updated", { description: getAdminErrorMessage(error) })
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Installer management"
        title="Installation team"
        description="The installer directory used when scheduling installation bookings."
        actions={<Button size="sm" onClick={() => setIsCreating(true)}><Plus data-icon="inline-start" aria-hidden="true" />Add installer</Button>}
      />

      <FilterBar searchValue={searchInput} searchPlaceholder="Search name, phone, email or specialty" onSearchChange={(value) => { setSearchInput(value); setPage(1) }} hasActiveFilters={Boolean(searchInput)} onClear={() => { setSearchInput(""); setPage(1) }} />

      {installers.error ? <ErrorState message={installers.error} onRetry={installers.reload} /> : (
        <>
          <DataTable
            caption="Installers with specialty and contact details"
            isLoading={installers.isLoading}
            rows={rows}
            getRowId={(row) => row.id}
            empty={search ? <EmptyState icon={HardHat} title="No installers match your search" description="Try a different name, phone number or specialty." /> : <EmptyState icon={HardHat} title="No installers yet" description="Add the installers who carry out PanelScan installations so they can be assigned to bookings." action={<Button size="sm" onClick={() => setIsCreating(true)}>Add installer</Button>} />}
            columns={[
              { key: "name", header: "Installer", primary: true, cell: (row) => <span className="font-medium">{[row.firstName, formatMiddleInitial(row.middleInitial), row.lastName].filter(Boolean).join(" ")}</span> },
              { key: "specialty", header: "Specialty", cell: (row) => row.specialty ?? <span className="text-muted-foreground">—</span> },
              { key: "phone", header: "Phone", cell: (row) => formatPhoneForDisplay(row.phone) },
              { key: "email", header: "Email", secondary: true, cell: (row) => <span className="break-all text-muted-foreground">{row.email ?? "—"}</span> },
              { key: "added", header: "Added", secondary: true, cell: (row) => <span className="text-muted-foreground">{formatDate(row.createdAt)}</span> },
              { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.isActive ? "ACTIVE" : "INACTIVE"} label={row.isActive ? "Available" : "Inactive"} /> },
            ]}
            rowAction={(row) => row.isActive ? <Button variant="outline" size="sm" onClick={() => void handleDeactivate(row)}>Deactivate</Button> : null}
          />
          <TablePagination pagination={installers.data?.pagination ?? null} onPageChange={setPage} isLoading={installers.isLoading} />
          <p className="text-xs leading-5 text-muted-foreground">Installer assignment happens on a booking. Installation scheduling and delivery coordination are not yet wired into fulfilment.</p>
        </>
      )}

      <CreateInstallerSheet open={isCreating} onClose={() => setIsCreating(false)} onCreated={() => { setIsCreating(false); installers.reload() }} />
    </div>
  )
}

type InstallerForm = { firstName: string; middleInitial: string; lastName: string; phone: string; email: string; specialty: string }
type GuardedField = "firstName" | "middleInitial" | "lastName" | "email"
type InstallerErrors = Partial<Record<GuardedField, string>>

/** Same limit as Create Account and the API (utils/nameSchema.ts). */
const NAME_MAX_LENGTH = 35

const EMPTY_INSTALLER_FORM: InstallerForm = { firstName: "", middleInitial: "", lastName: "", phone: "", email: "", specialty: "" }

function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <p id={id} className="text-xs text-destructive">{message}</p> : null
}

function CreateInstallerSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<InstallerForm>(EMPTY_INSTALLER_FORM)
  const [errors, setErrors] = useState<InstallerErrors>({})
  const [isSaving, setIsSaving] = useState(false)
  const savingRef = useRef(false)
  const confirm = useConfirm()

  // The field stops taking letters at the limit; say so, so it doesn't look broken.
  const nameLimitNotes = ([["firstName", "First name"], ["lastName", "Last name"]] as const)
    .filter(([field]) => form[field].length >= NAME_MAX_LENGTH)
    .map(([, label]) => `${label} can be up to ${NAME_MAX_LENGTH} characters.`)

  // Same space rules as Create Account: names keep single spaces between
  // words but can't start with one or double them; middle initial and email
  // take none. A refused value never reaches the field.
  function update(field: keyof InstallerForm, value: string) {
    const rejection = registerSpaceRejection(field, value)
    if (rejection) {
      setErrors((current) => ({ ...current, [field]: rejection }))
      return
    }
    setForm((previous) => ({ ...previous, [field]: sanitizeNameInput(field, value) }))
    setErrors((current) => (current[field as GuardedField] ? { ...current, [field]: undefined } : current))
  }

  /** Refuses a space keystroke or paste that breaks the rule, and trims a trailing space on blur. */
  function spaceGuard(field: GuardedField) {
    const refuseIfInvalid = (event: React.SyntheticEvent<HTMLInputElement>, inserted: string) => {
      const input = event.currentTarget
      const start = input.selectionStart ?? input.value.length
      const end = input.selectionEnd ?? input.value.length
      const rejection = registerSpaceRejection(field, input.value.slice(0, start) + inserted + input.value.slice(end))
      if (!rejection) return
      event.preventDefault()
      setErrors((current) => ({ ...current, [field]: rejection }))
    }
    return {
      onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => { if (event.key === " ") refuseIfInvalid(event, " ") },
      onPaste: (event: React.ClipboardEvent<HTMLInputElement>) => refuseIfInvalid(event, event.clipboardData.getData("text")),
      onBlur: (event: React.FocusEvent<HTMLInputElement>) => {
        if (event.currentTarget.value !== event.currentTarget.value.trim()) update(field, event.currentTarget.value.trim())
      },
      "aria-invalid": Boolean(errors[field]),
      "aria-describedby": errors[field] ? `installer-${field}-error` : undefined,
    }
  }

  function reject(field: GuardedField, message: string) {
    setErrors((current) => ({ ...current, [field]: message }))
    toast.error(message)
  }

  async function submit() {
    if (form.firstName.trim().length < 2 || form.lastName.trim().length < 2 || !form.phone) {
      toast.error("Enter a first name, last name, and contact number.")
      return
    }
    for (const [field, label] of [["firstName", "First name"], ["lastName", "Last name"]] as const) {
      if (!isValidPersonName(form[field])) return reject(field, personNameMessage(label))
    }
    if (form.middleInitial.trim() && !isValidMiddleInitial(form.middleInitial)) return reject("middleInitial", MIDDLE_INITIAL_MESSAGE)
    if (!isValidPhilippinePhone(form.phone)) {
      toast.error(PHILIPPINE_PHONE_MESSAGE)
      return
    }
    const middleInitial = form.middleInitial.trim() ? normalizeMiddleInitial(form.middleInitial) : undefined
    const fullName = [form.firstName.trim(), formatMiddleInitial(middleInitial), form.lastName.trim()].filter(Boolean).join(" ")
    if (savingRef.current) return
    if (!(await confirm({
      title: "Are you sure you want to add this Installer?",
      details: [{ label: "Name", value: fullName }, { label: "Phone", value: formatPhoneForDisplay(form.phone) }],
      confirmLabel: "Add Installer",
    }))) return
    // A second click while this one is still saving never adds the installer twice.
    if (savingRef.current) return
    savingRef.current = true
    setIsSaving(true)
    try {
      await createInstaller({
        firstName: form.firstName.trim(),
        middleInitial,
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        specialty: form.specialty.trim() || undefined,
      })
      toast.success("Installer added.")
      setForm(EMPTY_INSTALLER_FORM)
      setErrors({})
      onCreated()
    } catch (error) {
      // Temporary or non-existent addresses are shown under the Email field.
      const emailError = registerEmailErrorMessage(error)
      if (emailError) setErrors((current) => ({ ...current, email: emailError }))
      toast.error("Installer not added", { description: emailError ?? getAdminErrorMessage(error) })
    } finally {
      savingRef.current = false
      setIsSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <SheetContent className="admin-surface w-full sm:max-w-md">
        <SheetHeader><SheetTitle>Add installer</SheetTitle><SheetDescription>Installers can be assigned to installation bookings.</SheetDescription></SheetHeader>
        <div className="space-y-4 px-4 pb-6">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_6.5rem] gap-3">
            <div className="space-y-2"><Label htmlFor="installer-first">First name</Label><Input id="installer-first" value={form.firstName} onChange={(event) => update("firstName", event.target.value)} maxLength={NAME_MAX_LENGTH} {...spaceGuard("firstName")} /></div>
            <div className="space-y-2"><Label htmlFor="installer-last">Last name</Label><Input id="installer-last" value={form.lastName} onChange={(event) => update("lastName", event.target.value)} maxLength={NAME_MAX_LENGTH} {...spaceGuard("lastName")} /></div>
            <div className="space-y-2"><Label htmlFor="installer-middle" className="whitespace-nowrap">M.I. (optional)</Label><Input id="installer-middle" value={form.middleInitial} onChange={(event) => update("middleInitial", event.target.value)} maxLength={6} {...spaceGuard("middleInitial")} /></div>
          </div>
          {(errors.firstName || errors.lastName || errors.middleInitial || nameLimitNotes.length > 0) && (
            <div className="-mt-2 space-y-1">
              <FieldError id="installer-firstName-error" message={errors.firstName} />
              <FieldError id="installer-lastName-error" message={errors.lastName} />
              <FieldError id="installer-middleInitial-error" message={errors.middleInitial} />
              {nameLimitNotes.map((note) => <p key={note} className="text-xs text-muted-foreground">{note}</p>)}
            </div>
          )}
          <div className="space-y-2"><Label htmlFor="installer-phone">Phone</Label><PhoneInput id="installer-phone" value={form.phone} onChange={(next) => update("phone", next)} autoComplete="off" /></div>
          <div className="space-y-2"><Label htmlFor="installer-email">Email (optional)</Label><Input id="installer-email" type="email" value={form.email} onChange={(event) => update("email", event.target.value)} {...spaceGuard("email")} /><FieldError id="installer-email-error" message={errors.email} /></div>
          <div className="space-y-2"><Label htmlFor="installer-specialty">Specialty (optional)</Label><Input id="installer-specialty" value={form.specialty} onChange={(event) => update("specialty", event.target.value)} placeholder="Wall panel installation" /></div>
          <Button className="w-full" onClick={() => void submit()} disabled={isSaving}>{isSaving && <Loader2 className="animate-spin" aria-hidden="true" />}Add installer</Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
