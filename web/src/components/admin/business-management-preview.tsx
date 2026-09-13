import { Boxes, HardHat, Pencil, Plus, Trash2 } from "lucide-react"
import { useRef, useState } from "react"
import type { FormEvent } from "react"
import { toast } from "sonner"

import type { AdminPreviewRole } from "@/admin/admin-preview-capabilities"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { DataTable } from "@/components/admin/data-table"
import type { Column } from "@/components/admin/data-table"
import { EmptyState } from "@/components/admin/empty-state"
import { MetricCard } from "@/components/admin/metric-card"
import { StatusBadge } from "@/components/admin/status-badge"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import type { AdminReviewRow } from "@/data/admin-review"
import { formatProductPrice } from "@/lib/format-price"
import { useBusinessRows } from "@/preview/business-store"
import { previewStockStatus, validateBusinessRecord } from "@/preview/business-validation"
import type { BusinessKind } from "@/preview/business-validation"

const fields = {
  inventory: [
    { key: "item", label: "Item name" }, { key: "sku", label: "SKU" }, { key: "unitPrice", label: "Unit price (₱)", money: true },
    { key: "onHand", label: "Stock quantity", numeric: true }, { key: "reorder", label: "Reorder level", numeric: true },
    { key: "location", label: "Warehouse / location" },
  ],
  installers: [
    { key: "installer", label: "Installer name" }, { key: "phone", label: "Contact number", phone: true },
    { key: "specialty", label: "Specialty" }, { key: "coverage", label: "Service area" },
    { key: "assignments", label: "Assigned jobs", numeric: true },
  ],
} satisfies Record<BusinessKind, { key: string; label: string; numeric?: boolean; money?: boolean; phone?: boolean }[]>

export function BusinessManagementPreview({ kind, role }: { kind: BusinessKind; role: AdminPreviewRole }) {
  const inventory = kind === "inventory"
  const singular = inventory ? "inventory item" : "installer"
  const Icon = inventory ? Boxes : HardHat
  const [rows, setRows] = useBusinessRows(kind)
  const [draft, setDraft] = useState<AdminReviewRow | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [deleting, setDeleting] = useState<AdminReviewRow | null>(null)
  const [query, setQuery] = useState("")
  const [filter, setFilter] = useState("ALL")
  const formRef = useRef<HTMLFormElement>(null)
  const addRef = useRef<HTMLButtonElement>(null)
  const editing = Boolean(draft && rows.some((row) => row.id === draft.id))
  const statuses = inventory ? ["HEALTHY", "LOW_STOCK", "OUT_OF_STOCK"] : ["ACTIVE", "INACTIVE"]
  const label = (row: AdminReviewRow) => row[inventory ? "item" : "installer"]

  function open(row?: AdminReviewRow) {
    setErrors({})
    setDraft(row ? { ...row } : { id: crypto.randomUUID(), item: "", sku: "", onHand: "0", reorder: "0", unitPrice: "0.00", location: "", installer: "", specialty: "", phone: "", coverage: "", assignments: "0", status: "ACTIVE", verified: "false" })
  }

  function updateField(key: string, value: string) {
    setDraft((previous) => previous ? { ...previous, [key]: value } : null)
    setErrors((previous) => { const next = { ...previous }; delete next[key]; return next })
  }

  function save(event: FormEvent) {
    event.preventDefault()
    if (!draft) return
    const nextErrors = validateBusinessRecord(kind, draft, rows)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    const cleaned = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim()])) as AdminReviewRow
    if (inventory) cleaned.status = previewStockStatus(Number(cleaned.onHand), Number(cleaned.reorder))
    setRows((previous) => editing ? previous.map((row) => row.id === cleaned.id ? cleaned : row) : [...previous, cleaned])
    setDraft(null)
    toast.success(`${inventory ? "Inventory item" : "Installer"} ${editing ? "updated" : "added"}`, { description: "Saved in this preview until the page is reloaded." })
  }

  const textCell = (key: string) => (row: AdminReviewRow) => <span className="break-words [overflow-wrap:anywhere]">{row[key]}</span>
  const columns: Column<AdminReviewRow>[] = inventory ? [
    { key: "item", header: "Inventory item", primary: true, cell: (row) => <div className="max-w-60 break-words [overflow-wrap:anywhere]"><p className="font-medium">{row.item}</p><p className="mt-1 text-xs text-muted-foreground">{row.sku}</p></div> },
    { key: "onHand", header: "On hand", numeric: true, cell: textCell("onHand") },
    { key: "reorder", header: "Reorder at", numeric: true, cell: textCell("reorder") },
    { key: "unitPrice", header: "Unit price", numeric: true, cell: (row) => formatProductPrice(row.unitPrice) },
    { key: "location", header: "Location", secondary: true, cell: textCell("location") },
  ] : [
    { key: "installer", header: "Verified installer", primary: true, cell: (row) => <div className="max-w-60 break-words [overflow-wrap:anywhere]"><p className="font-medium">{row.installer}</p><p className="mt-1 text-xs text-muted-foreground">Verified · {row.phone}</p></div> },
    { key: "specialty", header: "Specialty", cell: textCell("specialty") },
    { key: "coverage", header: "Service area", secondary: true, cell: textCell("coverage") },
    { key: "assignments", header: "Jobs", numeric: true, cell: textCell("assignments") },
  ]
  columns.push({ key: "status", header: inventory ? "Stock status" : "Availability", cell: (row) => <StatusBadge status={row.status} /> })
  const visible = rows.filter((row) => (filter === "ALL" || row.status === filter) && Object.values(row).some((value) => value.toLowerCase().includes(query.trim().toLowerCase())))

  return <>
    <AdminPageHeader eyebrow="Business operations" title={inventory ? "Inventory health" : "Installer management"} description={inventory ? "Keep materials, stock levels, and warehouse details up to date." : "Manage verified installers, service areas, and availability."} actions={<Button ref={addRef} onClick={() => open()}><Plus aria-hidden="true" />Add {singular}</Button>} />
    <p className="mt-3 text-xs text-muted-foreground">{role === "OWNER" ? "Owner" : "Moderator"} operational access · Fictional records · Changes last until reload</p>
    <div className="mt-6 grid gap-3 sm:grid-cols-3">
      <MetricCard icon={Icon} label={inventory ? "Stock items" : "Verified installers"} value={String(rows.length)} hint="Current preview records" />
      <MetricCard label={inventory ? "Units on hand" : "Active installers"} value={String(inventory ? rows.reduce((sum, row) => sum + Number(row.onHand), 0) : rows.filter((row) => row.status === "ACTIVE").length)} />
      <MetricCard label={inventory ? "Need replenishment" : "Assigned jobs"} value={String(inventory ? rows.filter((row) => row.status !== "HEALTHY").length : rows.reduce((sum, row) => sum + Number(row.assignments), 0))} />
    </div>
    <div className="mt-6 mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_13rem]">
      <div><Label htmlFor={`${kind}-search`}>Search {inventory ? "inventory" : "installers"}</Label><Input id={`${kind}-search`} className="mt-2 h-10" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={inventory ? "Name, SKU, or warehouse" : "Name, specialty, or service area"} /></div>
      <div><Label htmlFor={`${kind}-filter`}>Status</Label><select id={`${kind}-filter`} className="mt-2 h-10 w-full rounded-md border border-input bg-card px-3 text-sm" value={filter} onChange={(event) => setFilter(event.target.value)}><option value="ALL">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{status.replaceAll("_", " ").toLowerCase()}</option>)}</select></div>
    </div>
    <DataTable rows={visible} columns={columns} getRowId={(row) => row.id} caption={`${inventory ? "Inventory" : "Verified installer"} preview records`} empty={<EmptyState icon={Icon} title={rows.length ? "No matching records" : `No ${inventory ? "stock items" : "installers"} yet`} description={rows.length ? "Try another search or status filter." : `Add your first ${singular} to this preview.`} />} rowAction={(row) => <div className="flex justify-end gap-2"><Button variant="outline" size="sm" aria-label={`Edit ${label(row)}`} onClick={() => open(row)}><Pencil aria-hidden="true" />Edit</Button><Button variant="ghost" size="icon-sm" aria-label={`Delete ${label(row)}`} onClick={() => setDeleting(row)}><Trash2 aria-hidden="true" /></Button></div>} />
    <Sheet open={Boolean(draft)} onOpenChange={(isOpen) => { if (!isOpen) setDraft(null) }}>
      <SheetContent className="admin-surface @container/business-form w-[calc(100vw-1rem)]! max-w-none! overflow-y-auto sm:max-w-xl!" onCloseAutoFocus={(event) => { event.preventDefault(); addRef.current?.focus() }}>
        <SheetHeader className="pr-12"><SheetTitle>{editing ? "Edit" : "Add"} {singular}</SheetTitle><SheetDescription>{inventory ? "Stock status follows the quantity and reorder level." : "Record verification and current availability."} Preview changes are not sent to a server.</SheetDescription></SheetHeader>
        {draft && <form ref={formRef} onSubmit={save} noValidate className="space-y-5 px-4 pb-6">
          <div className="grid gap-5 @md/business-form:grid-cols-2">
            {fields[kind].map((field: { key: string; label: string; numeric?: boolean; money?: boolean; phone?: boolean }) => <div key={field.key} className={["item", "installer", "location"].includes(field.key) ? "@md/business-form:col-span-2" : "min-w-0"}><Label htmlFor={`business-${field.key}`}>{field.label}</Label><Input id={`business-${field.key}`} value={draft[field.key]} className="mt-2 h-10" type={field.phone ? "tel" : "text"} inputMode={field.numeric ? "numeric" : field.money ? "decimal" : undefined} maxLength={field.phone ? 25 : field.numeric || field.money ? 18 : 120} onChange={(event) => updateField(field.key, event.target.value)} aria-invalid={Boolean(errors[field.key])} aria-describedby={errors[field.key] ? `error-${field.key}` : undefined} required />{errors[field.key] && <p id={`error-${field.key}`} className="mt-1.5 text-xs text-destructive">{errors[field.key]}</p>}</div>)}
          </div>
          {inventory ? <div className="rounded-lg border border-border bg-secondary/40 p-4"><p className="mb-2 text-xs text-muted-foreground">Stock status · calculated automatically</p><StatusBadge status={previewStockStatus(Number(draft.onHand), Number(draft.reorder))} /></div> : <>
            <div><Label htmlFor="installer-status">Availability</Label><select id="installer-status" value={draft.status} onChange={(event) => updateField("status", event.target.value)} className="mt-2 h-10 w-full rounded-md border border-input bg-card px-3"><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></div>
            <div><label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" className="mt-1 size-4 accent-primary" checked={draft.verified === "true"} onChange={(event) => updateField("verified", String(event.target.checked))} aria-invalid={Boolean(errors.verified)} aria-describedby={errors.verified ? "error-verified" : undefined} />I confirm this sample installer has been verified.</label>{errors.verified && <p id="error-verified" className="mt-2 text-xs text-destructive">{errors.verified}</p>}</div>
          </>}
          <div className="sticky bottom-0 -mx-4 flex flex-col-reverse gap-2 border-t border-border bg-popover px-4 py-3 @md/business-form:flex-row @md/business-form:justify-end"><Button type="button" variant="outline" onClick={() => setDraft(null)}>Cancel</Button><Button type="submit">{editing ? "Save changes" : "Add to preview"}</Button></div>
        </form>}
      </SheetContent>
    </Sheet>
    <AlertDialog open={Boolean(deleting)} onOpenChange={(isOpen) => { if (!isOpen) setDeleting(null) }}><AlertDialogContent className="admin-surface max-h-[calc(100dvh-2rem)] overflow-y-auto" onCloseAutoFocus={(event) => { event.preventDefault(); addRef.current?.focus() }}><AlertDialogHeader><AlertDialogTitle>Delete this {singular}?</AlertDialogTitle><AlertDialogDescription className="break-words [overflow-wrap:anywhere]">{deleting && label(deleting)} will be removed from this preview. Reloading restores the fictional sample records.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep record</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { if (deleting) setRows((previous) => previous.filter((row) => row.id !== deleting.id)); setDeleting(null); toast.success("Record removed from preview") }}>Delete record</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </>
}
