import { Boxes, Loader2, Minus, Plus, Trash2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { addStock, createProduct, deleteProduct, getInventory, getInventoryReport, reduceStock, uploadProductImage } from "@/api/admin"
import { getCategories } from "@/api/categories"
import { availableStock, formatCount, formatDate, formatMoney, stockStatus } from "@/admin/admin-format"
import { getAdminErrorMessage, useAdminResource } from "@/admin/use-admin-resource"
import { useAuth } from "@/auth/use-auth"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { DataTable, TablePagination } from "@/components/admin/data-table"
import { EmptyState, ErrorState } from "@/components/admin/empty-state"
import { FilterBar, FilterSelect } from "@/components/admin/filter-bar"
import { MetricCard } from "@/components/admin/metric-card"
import { StatusBadge } from "@/components/admin/status-badge"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { PANEL_TYPES } from "@/products/panel-types"
import type { InventoryRecord } from "@/types/admin"
import type { Category } from "@/types/category"

/**
 * Inventory Assessment (owner) and Inventory Management (moderator) share this
 * screen because the backend grants both roles the same inventory routes. Unit
 * prices come from the inventory report, which omits them for a moderator.
 */
export function AdminInventoryPage() {
  useDocumentTitle("Inventory | PanelScan Admin")
  const { user } = useAuth()
  const isModerator = user?.role === "MODERATOR"
  const isOwner = user?.role === "OWNER"
  // Both roles can add/delete products from here: MODERATOR goes through the
  // owner approval workflow, OWNER writes apply directly (backend already
  // supports both - see inventory.controller.ts / product.controller.ts).
  const canManageProducts = isModerator || isOwner

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [adjusting, setAdjusting] = useState<InventoryRecord | null>(null)
  const [showAddProduct, setShowAddProduct] = useState(false)

  const inventory = useAdminResource((signal) => getInventory({ page, limit: 20 }, signal), [page])
  // Second read purely for the value/price summary the inventory routes do not carry.
  const report = useAdminResource((signal) => getInventoryReport({ limit: 1 }, signal), [])

  const records = useMemo(() => inventory.data?.inventory ?? [], [inventory.data])
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase()
    return records.filter((record) => {
      const matchesTerm = term === "" || record.product.name.toLowerCase().includes(term) || record.product.sku.toLowerCase().includes(term)
      const matchesStatus = statusFilter === "" || stockStatus(record) === statusFilter
      return matchesTerm && matchesStatus
    })
  }, [records, search, statusFilter])

  const summary = report.data?.summary

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Stock control"
        title="Inventory"
        description="Live stock levels, reserved quantities, and reorder thresholds for PVC wall and ceiling panels."
        actions={
          canManageProducts ? (
            <Button onClick={() => setShowAddProduct(true)}>
              <Plus className="size-4" data-icon="inline-start" aria-hidden="true" />
              Add product
            </Button>
          ) : undefined
        }
      />

      {inventory.error ? <ErrorState message={inventory.error} onRetry={inventory.reload} /> : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Inventory summary">
            <MetricCard label="Tracked products" value={formatCount(summary?.totalItems)} isLoading={report.isLoading} icon={Boxes} />
            <MetricCard label="Low stock" value={formatCount(summary?.lowStockCount)} hint="At or below reorder level" isLoading={report.isLoading} />
            <MetricCard label="Inventory value" value={formatMoney(summary?.totalInventoryValue)} isLoading={report.isLoading} restricted={!report.isLoading && summary?.totalInventoryValue === undefined} />
            <MetricCard label="On this page" value={formatCount(filtered.length)} hint={search || statusFilter ? "After filters" : undefined} isLoading={inventory.isLoading} />
          </section>

          <FilterBar
            searchValue={search}
            searchPlaceholder="Search product or SKU"
            onSearchChange={setSearch}
            hasActiveFilters={Boolean(search || statusFilter)}
            onClear={() => { setSearch(""); setStatusFilter("") }}
          >
            <FilterSelect
              label="Stock status"
              value={statusFilter}
              allLabel="All stock levels"
              options={[{ value: "HEALTHY", label: "Healthy" }, { value: "LOW_STOCK", label: "Low stock" }, { value: "OUT_OF_STOCK", label: "Out of stock" }]}
              onChange={setStatusFilter}
            />
          </FilterBar>

          <div key={`${search}|${statusFilter}|${page}`} className="motion-swap">
          <DataTable
            caption="Inventory levels by product"
            isLoading={inventory.isLoading}
            rows={filtered}
            getRowId={(row) => row.id}
            empty={<EmptyState icon={Boxes} title="No inventory matches these filters" description="Adjust the search or stock-level filter to see tracked products." />}
            columns={[
              { key: "product", header: "Product", primary: true, cell: (row) => <span><span className="block font-medium">{row.product.name}</span><span className="block text-xs text-muted-foreground">{row.product.sku}</span></span> },
              { key: "type", header: "Type", cell: (row) => <span className="text-muted-foreground">{panelLineForSku(row.product.sku)}</span> },
              { key: "status", header: "Status", cell: (row) => <StatusBadge status={stockStatus(row)} /> },
              { key: "quantity", header: "On hand", numeric: true, cell: (row) => formatCount(row.quantity) },
              { key: "reserved", header: "Reserved", numeric: true, secondary: true, cell: (row) => formatCount(row.reservedQty) },
              { key: "available", header: "Available", numeric: true, cell: (row) => <span className="font-medium">{formatCount(availableStock(row))}</span> },
              { key: "reorder", header: "Reorder at", numeric: true, secondary: true, cell: (row) => formatCount(row.reorderLevel) },
              { key: "restocked", header: "Last restock", secondary: true, cell: (row) => <span className="text-muted-foreground">{formatDate(row.lastRestockedAt)}</span> },
            ]}
            rowAction={(row) => <Button variant="outline" size="sm" onClick={() => setAdjusting(row)}>Adjust</Button>}
          />
          </div>

          <TablePagination pagination={inventory.data?.pagination ?? null} onPageChange={setPage} isLoading={inventory.isLoading} />
        </>
      )}

      <StockAdjustSheet record={adjusting} onClose={() => setAdjusting(null)} onDone={() => { setAdjusting(null); inventory.reload(); report.reload() }} />
      {canManageProducts && (
        <AddProductSheet open={showAddProduct} onClose={() => setShowAddProduct(false)} onDone={() => { setShowAddProduct(false); inventory.reload(); report.reload() }} />
      )}
    </div>
  )
}

function AddProductSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { user } = useAuth()
  const isModerator = user?.role === "MODERATOR"
  const [categories, setCategories] = useState<Category[]>([])
  const [name, setName] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [sku, setSku] = useState("")
  const [price, setPrice] = useState("")
  const [material, setMaterial] = useState("")
  const [unit, setUnit] = useState("panel")
  const [width, setWidth] = useState("")
  const [height, setHeight] = useState("")
  const [thickness, setThickness] = useState("")
  const [stock, setStock] = useState("50")
  const [reorderLevel, setReorderLevel] = useState("10")
  const [description, setDescription] = useState("")
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (open) {
      getCategories()
        .then((cats) => {
          const inScope = cats.filter((c) => c.slug === "wall-panels" || c.slug === "ceiling-panels")
          setCategories(inScope)
          if (inScope.length > 0) setCategoryId((prev) => prev || inScope[0].id)
        })
        .catch(() => {})
    }
  }, [open])

  const reset = () => {
    setName("")
    setSku("")
    setPrice("")
    setMaterial("")
    setUnit("panel")
    setWidth("")
    setHeight("")
    setThickness("")
    setStock("50")
    setReorderLevel("10")
    setDescription("")
    setImageFile(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !sku.trim() || !categoryId || !price.trim()) {
      toast.error("Please fill in Name, Category, SKU, and Price.")
      return
    }

    setIsSaving(true)
    try {
      let imageUrl: string | undefined
      if (imageFile) {
        const uploadResult = await uploadProductImage(imageFile)
        imageUrl = uploadResult.url
      }

      await createProduct({
        categoryId,
        name: name.trim(),
        sku: sku.trim().toUpperCase(),
        price: Number(price),
        material: material.trim() || undefined,
        unit: unit.trim() || "panel",
        width: width ? Number(width) : undefined,
        height: height ? Number(height) : undefined,
        thickness: thickness ? Number(thickness) : undefined,
        stock: Number(stock) || 0,
        reorderLevel: Number(reorderLevel) || 10,
        description: description.trim() || undefined,
        images: imageUrl ? [{ url: imageUrl, isPrimary: true, altText: name.trim() }] : undefined,
      })

      if (isModerator) {
        toast.success("Change request submitted for owner approval", {
          description: `Request to add "${name.trim()}" has been sent for owner review.`,
        })
      } else {
        toast.success(`Product "${name.trim()}" created and inventory initialized.`)
      }
      reset()
      onDone()
    } catch (error) {
      toast.error("Could not create product", { description: getAdminErrorMessage(error) })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) { reset(); onClose() } }}>
      <SheetContent className="admin-surface w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Add Product</SheetTitle>
          <SheetDescription>Create a new panel product. Stock and inventory tracking are initialized immediately.</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4 px-4 pb-6">
          <div className="space-y-1.5">
            <Label htmlFor="prod-name">Product name *</Label>
            <Input id="prod-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fluted Walnut Wall Panel" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="prod-cat">Category *</Label>
              <select
                id="prod-cat"
                required
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id} className="bg-background text-foreground">{c.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prod-sku">SKU *</Label>
              <Input id="prod-sku" required value={sku} onChange={(e) => setSku(e.target.value)} placeholder="e.g. WP-WAL-003" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="prod-price">Price (₱) *</Label>
              <Input id="prod-price" type="number" step="0.01" min="1" required value={price} onChange={(e) => setPrice(e.target.value)} placeholder="1850.00" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prod-unit">Unit</Label>
              <Input id="prod-unit" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="panel" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prod-material">Material</Label>
              <Input id="prod-material" value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="PVC / Oak" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="prod-width">Width (cm)</Label>
              <Input id="prod-width" type="number" step="0.1" value={width} onChange={(e) => setWidth(e.target.value)} placeholder="60" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prod-height">Height (cm)</Label>
              <Input id="prod-height" type="number" step="0.1" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="240" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prod-thick">Thickness (cm)</Label>
              <Input id="prod-thick" type="number" step="0.1" value={thickness} onChange={(e) => setThickness(e.target.value)} placeholder="1.2" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="prod-stock">Initial stock *</Label>
              <Input id="prod-stock" type="number" min="0" required value={stock} onChange={(e) => setStock(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prod-reorder">Reorder level</Label>
              <Input id="prod-reorder" type="number" min="0" value={reorderLevel} onChange={(e) => setReorderLevel(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="prod-image">Product Image (optional)</Label>
            <Input
              id="prod-image"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={(e) => setImageFile(e.target.files?.[0] ?? null)}
            />
            {imageFile && <p className="text-xs text-muted-foreground">{imageFile.name} ({(imageFile.size / 1024).toFixed(0)} KB)</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="prod-desc">Description (optional)</Label>
            <textarea
              id="prod-desc"
              rows={3}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Product highlights, specifications, and finish details..."
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={() => { reset(); onClose() }} disabled={isSaving}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={isSaving}>
              {isSaving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus data-icon="inline-start" aria-hidden="true" />}
              Add Product
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

/**
 * The inventory routes return only id/name/sku/slug for the product, with no
 * category, so the panel line is derived from the SKU prefix the seed uses
 * (WP- wall, CP- ceiling). Anything else is development stock outside the
 * client's two product lines.
 */
function panelLineForSku(sku: string): string {
  if (sku.startsWith("WP-")) return PANEL_TYPES[0].shortLabel
  if (sku.startsWith("CP-")) return PANEL_TYPES[1].shortLabel
  return "Development stock"
}

function StockAdjustSheet({ record, onClose, onDone }: { record: InventoryRecord | null; onClose: () => void; onDone: () => void }) {
  const { user } = useAuth()
  const isModerator = user?.role === "MODERATOR"
  const isOwner = user?.role === "OWNER"
  const [quantity, setQuantity] = useState("1")
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  async function adjust(direction: "add" | "reduce") {
    if (!record) return
    const parsed = Number(quantity)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      toast.error("Enter a whole number greater than zero.")
      return
    }
    setIsSaving(true)
    try {
      if (direction === "add") await addStock(record.productId, parsed)
      else await reduceStock(record.productId, parsed)
      if (isModerator) {
        toast.success("Change request submitted for owner approval", {
          description: `Request to ${direction === "add" ? "add" : "reduce"} ${parsed} unit(s) for "${record.product.name}" has been sent for owner review.`,
        })
      } else {
        toast.success(`${record.product.name}: ${direction === "add" ? "added" : "removed"} ${parsed} unit(s).`)
      }
      setQuantity("1")
      onDone()
    } catch (error) {
      toast.error("Stock not updated", { description: getAdminErrorMessage(error) })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete() {
    if (!record) return
    setIsDeleting(true)
    try {
      await deleteProduct(record.productId)
      if (isModerator) {
        toast.success("Delete request submitted for owner approval", {
          description: `Request to delete "${record.product.name}" has been sent for owner review.`,
        })
      } else {
        toast.success("Product deleted successfully", {
          description: `"${record.product.name}" has been removed from catalogue and inventory.`,
        })
      }
      setShowDeleteDialog(false)
      onDone()
    } catch (error) {
      toast.error("Could not delete product", { description: getAdminErrorMessage(error) })
      setShowDeleteDialog(false)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <>
      <Sheet open={Boolean(record)} onOpenChange={(open) => { if (!open) onClose() }}>
        <SheetContent className="admin-surface w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Adjust stock</SheetTitle>
            <SheetDescription>{record ? `${record.product.name} · ${record.product.sku}` : ""}</SheetDescription>
          </SheetHeader>
          {record && (
            <div className="space-y-5 px-4 pb-6">
              <dl className="grid grid-cols-3 gap-3 surface-card p-3 text-sm">
                <div><dt className="text-xs text-muted-foreground">On hand</dt><dd className="mt-0.5 font-medium tabular-nums">{formatCount(record.quantity)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Reserved</dt><dd className="mt-0.5 font-medium tabular-nums">{formatCount(record.reservedQty)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Available</dt><dd className="mt-0.5 font-medium tabular-nums">{formatCount(availableStock(record))}</dd></div>
              </dl>

              <div className="space-y-2">
                <Label htmlFor="stock-quantity">Quantity</Label>
                <Input id="stock-quantity" inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} disabled={isSaving || isDeleting} />
                <p className="text-xs text-muted-foreground">Whole units. Reducing stock cannot take available quantity below zero — the backend rejects that.</p>
              </div>

              <div className="flex gap-2">
                <Button className="flex-1" onClick={() => void adjust("add")} disabled={isSaving || isDeleting}>
                  {isSaving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus data-icon="inline-start" aria-hidden="true" />}Add stock
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => void adjust("reduce")} disabled={isSaving || isDeleting}>
                  <Minus data-icon="inline-start" aria-hidden="true" />Reduce
                </Button>
              </div>

              {(isModerator || isOwner) && (
                <div className="border-t border-border pt-4">
                  <Button
                    type="button"
                    variant="destructive"
                    className="w-full"
                    onClick={() => setShowDeleteDialog(true)}
                    disabled={isSaving || isDeleting}
                  >
                    <Trash2 className="size-3.5" data-icon="inline-start" aria-hidden="true" />
                    Delete
                  </Button>
                </div>
              )}

              <p className="text-xs leading-5 text-muted-foreground">
                {isModerator
                  ? "Adjustments are submitted for owner approval and are attributed to your account. They take effect once approved."
                  : "Adjustments apply immediately and are attributed to your account by the backend."}
              </p>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {record && (
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Product?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete &ldquo;{record.product.name}&rdquo; ({record.product.sku})? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                disabled={isDeleting}
                onClick={(e) => {
                  e.preventDefault()
                  void handleDelete()
                }}
              >
                {isDeleting ? "Deleting…" : "Delete"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  )
}
