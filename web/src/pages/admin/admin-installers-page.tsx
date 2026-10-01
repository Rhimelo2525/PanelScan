import { HardHat, Loader2, Plus } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { createInstaller, deactivateInstaller, getInstallers } from "@/api/admin"
import { formatDate } from "@/admin/admin-format"
import { getAdminErrorMessage, useAdminResource } from "@/admin/use-admin-resource"
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
import { isValidPersonName, personNameMessage, sanitizeNameInput } from "@/auth/registration-validation"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { PHILIPPINE_PHONE_MESSAGE, formatPhoneForDisplay, isValidPhilippinePhone } from "@/lib/phone"
import type { Installer } from "@/types/admin"

/** Moderator-only: the backend 403s an owner on every installer route. */
export function AdminInstallersPage() {
  useDocumentTitle("Installers | PanelScan Admin")
  const [page, setPage] = useState(1)
  const [isCreating, setIsCreating] = useState(false)
  const confirm = useConfirm()

  const installers = useAdminResource((signal) => getInstallers({ page, limit: 20 }, signal), [page])
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

      {installers.error ? <ErrorState message={installers.error} onRetry={installers.reload} /> : (
        <>
          <DataTable
            caption="Installers with specialty and contact details"
            isLoading={installers.isLoading}
            rows={rows}
            getRowId={(row) => row.id}
            empty={<EmptyState icon={HardHat} title="No installers yet" description="Add the installers who carry out PanelScan installations so they can be assigned to bookings." action={<Button size="sm" onClick={() => setIsCreating(true)}>Add installer</Button>} />}
            columns={[
              { key: "name", header: "Installer", primary: true, cell: (row) => <span className="font-medium">{row.firstName} {row.lastName}</span> },
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

function CreateInstallerSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", email: "", specialty: "" })
  const [isSaving, setIsSaving] = useState(false)
  const savingRef = useRef(false)
  const confirm = useConfirm()

  function update(field: keyof typeof form, value: string) {
    setForm((previous) => ({ ...previous, [field]: sanitizeNameInput(field, value) }))
  }

  async function submit() {
    if (form.firstName.trim().length < 2 || form.lastName.trim().length < 2 || !form.phone) {
      toast.error("Enter a first name, last name, and contact number.")
      return
    }
    if (!isValidPersonName(form.firstName) || !isValidPersonName(form.lastName)) {
      toast.error(personNameMessage(isValidPersonName(form.firstName) ? "Last name" : "First name"))
      return
    }
    if (!isValidPhilippinePhone(form.phone)) {
      toast.error(PHILIPPINE_PHONE_MESSAGE)
      return
    }
    if (savingRef.current) return
    if (!(await confirm({
      title: "Are you sure you want to add this Installer?",
      details: [{ label: "Name", value: `${form.firstName.trim()} ${form.lastName.trim()}` }, { label: "Phone", value: formatPhoneForDisplay(form.phone) }],
      confirmLabel: "Add Installer",
    }))) return
    // A second click while this one is still saving never adds the installer twice.
    if (savingRef.current) return
    savingRef.current = true
    setIsSaving(true)
    try {
      await createInstaller({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        specialty: form.specialty.trim() || undefined,
      })
      toast.success("Installer added.")
      setForm({ firstName: "", lastName: "", phone: "", email: "", specialty: "" })
      onCreated()
    } catch (error) {
      toast.error("Installer not added", { description: getAdminErrorMessage(error) })
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label htmlFor="installer-first">First name</Label><Input id="installer-first" value={form.firstName} onChange={(event) => update("firstName", event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="installer-last">Last name</Label><Input id="installer-last" value={form.lastName} onChange={(event) => update("lastName", event.target.value)} /></div>
          </div>
          <div className="space-y-2"><Label htmlFor="installer-phone">Phone</Label><PhoneInput id="installer-phone" value={form.phone} onChange={(next) => update("phone", next)} autoComplete="off" /></div>
          <div className="space-y-2"><Label htmlFor="installer-email">Email (optional)</Label><Input id="installer-email" type="email" value={form.email} onChange={(event) => update("email", event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="installer-specialty">Specialty (optional)</Label><Input id="installer-specialty" value={form.specialty} onChange={(event) => update("specialty", event.target.value)} placeholder="Wall panel installation" /></div>
          <Button className="w-full" onClick={() => void submit()} disabled={isSaving}>{isSaving && <Loader2 className="animate-spin" aria-hidden="true" />}Add installer</Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
