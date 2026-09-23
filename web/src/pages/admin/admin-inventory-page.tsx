import { Boxes, Loader2, Minus, Plus, Trash2 } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { addStock, adjustStock, createInventory, deleteInventory, getAvailableProductsForRecordStock, getInventory, getInventoryReport, reduceStock } from "@/api/admin"
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
import type { Product } from "@/types/product"

/**
 * Inventory Assessment (owner) and Inventory Management (moderator) share this
 * screen. Stock modifications (Record Stock, Adjust) are MODERATOR-only and
 * create change requests. OWNER has view, review, and approval responsibilities.
 */
export function AdminInventoryPage() {
  useDocumentTitle("Inventory | PanelScan Admin")
  const { user } = useAuth()
  const isModerator = user?.role === "MODERATOR"
  const canManageStock = isModerator

  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [adjusting, setAdjusting] = useState<InventoryRecord | null>(null)
  const [showRecordStock, setShowRecordStock] = useState(false)

  const inventory = useAdminResource((signal) => getInventory({ page, limit: 20 }, signal), [page], { pollIntervalMs: 30_000 })
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
          canManageStock ? (
            <Button onClick={() => setShowRecordStock(true)}>
              <Plus className="size-4" data-icon="inline-start" aria-hidden="true" />
              Record stock
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
            empty={
              <EmptyState
                icon={Boxes}
                title={records.length === 0 ? "No inventory yet" : "No inventory matches these filters"}
                description={
                  records.length === 0
                    ? "Inventory will appear when products are added and stock is recorded."
                    : "Adjust the search or stock-level filter to see tracked products."
                }
              />
            }
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
            rowAction={canManageStock ? (row) => <Button variant="outline" size="sm" onClick={() => setAdjusting(row)}>Adjust</Button> : undefined}
          />
          </div>

          <TablePagination pagination={inventory.data?.pagination ?? null} onPageChange={setPage} isLoading={inventory.isLoading} />
        </>
      )}

      {canManageStock && (
        <>
          <StockAdjustSheet record={adjusting} onClose={() => setAdjusting(null)} onDone={() => { setAdjusting(null); inventory.reload(); report.reload() }} />
          <RecordStockSheet open={showRecordStock} onClose={() => setShowRecordStock(false)} onDone={() => { setShowRecordStock(false); inventory.reload(); report.reload() }} />
        </>
      )}
    </div>
  )
}

function RecordStockSheet({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [products, setProducts] = useState<Product[]>([])
  const [isLoadingProducts, setIsLoadingProducts] = useState(false)
  const [productId, setProductId] = useState("")
  const [quantity, setQuantity] = useState("50")
  const [reorderLevel, setReorderLevel] = useState("10")
  const [warehouseLocation, setWarehouseLocation] = useState("Main Warehouse")
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setIsLoadingProducts(true)
      getAvailableProductsForRecordStock()
        .then((res) => {
          setProducts(res.products)
          if (res.products.length > 0) {
            setProductId(res.products[0].id)
          } else {
            setProductId("")
          }
        })
        .catch(() => {})
        .finally(() => setIsLoadingProducts(false))
    }
  }, [open])

  const reset = () => {
    setQuantity("50")
    setReorderLevel("10")
    setWarehouseLocation("Main Warehouse")
    setProductId("")
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!productId) {
      toast.error("Please select a product from the catalogue.")
      return
    }

    const parsedQty = Number(quantity)
    if (!Number.isInteger(parsedQty) || parsedQty < 0) {
      toast.error("Stock quantity must be a non-negative whole number.")
      return
    }

    const parsedReorder = Number(reorderLevel)
    if (!Number.isInteger(parsedReorder) || parsedReorder < 0) {
      toast.error("Reorder level must be a non-negative whole number.")
      return
    }

    setIsSaving(true)
    try {
      const selectedProduct = products.find((p) => p.id === productId)
      await createInventory({
        productId,
        quantity: parsedQty,
        reorderLevel: parsedReorder,
        warehouseLocation: warehouseLocation.trim() || "Main Warehouse",
      })

      toast.success("Stock recording request submitted for owner approval", {
        description: `Request to record ${parsedQty} units for "${selectedProduct?.name ?? 'product'}" has been sent for owner review.`,
      })
      reset()
      onDone()
    } catch (error) {
      toast.error("Could not record physical stock", { description: getAdminErrorMessage(error) })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={(isOpen) => { if (!isOpen) { reset(); onClose() } }}>
      <SheetContent className="admin-surface w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Record Physical Stock</SheetTitle>
          <SheetDescription>Record initial physical inventory for a product in your catalogue.</SheetDescription>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4 px-4 pb-6">
          <div className="space-y-1.5">
            <Label htmlFor="stock-product">Catalogue Product *</Label>
            {isLoadingProducts ? (
              <p className="text-xs text-muted-foreground">Loading available products...</p>
            ) : products.length === 0 ? (
              <p className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400">
                No products awaiting initial stock. All approved products either have existing inventory records or have initial stock requests pending owner review.
              </p>
            ) : (
              <select
                id="stock-product"
                required
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id} className="bg-background text-foreground">
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="stock-initial-qty">Initial physical stock *</Label>
              <Input
                id="stock-initial-qty"
                type="number"
                min="0"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stock-reorder-lvl">Reorder threshold</Label>
              <Input
                id="stock-reorder-lvl"
                type="number"
                min="0"
                value={reorderLevel}
                onChange={(e) => setReorderLevel(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="stock-location">Warehouse Location</Label>
            <Input
              id="stock-location"
              value={warehouseLocation}
              onChange={(e) => setWarehouseLocation(e.target.value)}
              placeholder="Main Warehouse"
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button type="button" variant="outline" className="flex-1" onClick={() => { reset(); onClose() }} disabled={isSaving}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={isSaving || products.length === 0}>
              {isSaving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus data-icon="inline-start" aria-hidden="true" />}
              Record Stock
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
  const [quantity, setQuantity] = useState("1")
  const [isSaving, setIsSaving] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  // Initialize input to current quantity when record is opened
  useEffect(() => {
    if (record) {
      setQuantity(String(record.quantity))
    }
  }, [record])

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
      toast.success("Change request submitted for owner approval", {
        description: `Request to ${direction === "add" ? "add" : "reduce"} ${parsed} unit(s) for "${record.product.name}" has been sent for owner review.`,
      })
      onDone()
    } catch (error) {
      toast.error("Stock not updated", { description: getAdminErrorMessage(error) })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleSetStock() {
    if (!record) return
    const parsed = Number(quantity)
    if (!Number.isInteger(parsed) || parsed < 0) {
      toast.error("Enter a non-negative whole number (0 or greater).")
      return
    }
    if (parsed < record.reservedQty) {
      toast.error(`Cannot set stock below reserved quantity (${record.reservedQty}).`)
      return
    }
    setIsSaving(true)
    try {
      await adjustStock(record.productId, parsed)
      toast.success("Change request submitted for owner approval", {
        description: `Request to set on-hand stock from ${record.quantity} to ${parsed} for "${record.product.name}" has been sent for owner review.`,
      })
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
      await deleteInventory(record.productId)
      toast.success("Removal request submitted for owner approval", {
        description: `Request to remove inventory record for "${record.product.name}" has been sent for owner review.`,
      })
      setShowDeleteDialog(false)
      onDone()
    } catch (error) {
      toast.error("Could not remove inventory record", { description: getAdminErrorMessage(error) })
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
                <Label htmlFor="stock-quantity">Stock quantity / Units</Label>
                <Input id="stock-quantity" inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} disabled={isSaving || isDeleting} />
                <p className="text-xs text-muted-foreground">Set new target on-hand stock directly, or add/reduce by units. Stock cannot go below reserved quantity.</p>
              </div>

              <div className="space-y-2">
                <Button className="w-full" variant="secondary" onClick={() => void handleSetStock()} disabled={isSaving || isDeleting}>
                  Set On-Hand Stock to {quantity.trim() || "0"}
                </Button>
                <div className="flex gap-2">
                  <Button className="flex-1" variant="outline" onClick={() => void adjust("add")} disabled={isSaving || isDeleting}>
                    {isSaving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus data-icon="inline-start" aria-hidden="true" />}Add units
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={() => void adjust("reduce")} disabled={isSaving || isDeleting}>
                    <Minus data-icon="inline-start" aria-hidden="true" />Reduce units
                  </Button>
                </div>
              </div>

              <div className="border-t border-border pt-4">
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full"
                  onClick={() => setShowDeleteDialog(true)}
                  disabled={isSaving || isDeleting}
                >
                  <Trash2 className="size-3.5" data-icon="inline-start" aria-hidden="true" />
                  Remove Inventory Record
                </Button>
              </div>

              <p className="text-xs leading-5 text-muted-foreground">
                Stock adjustments are submitted for owner approval. Live inventory remains unchanged until an owner approves the request.
              </p>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {record && (
        <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Inventory Record?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove the inventory record for &ldquo;{record.product.name}&rdquo; ({record.product.sku})? The product will remain in the catalogue with 0 stock.
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
                {isDeleting ? "Removing…" : "Remove Record"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  )
}
