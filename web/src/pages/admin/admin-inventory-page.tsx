import { Boxes, Loader2, Minus, Plus } from "lucide-react"
import { useMemo, useState } from "react"
import { toast } from "sonner"

import { addStock, getInventory, getInventoryReport, reduceStock } from "@/api/admin"
import { availableStock, formatCount, formatDate, formatMoney, stockStatus } from "@/admin/admin-format"
import { getAdminErrorMessage, useAdminResource } from "@/admin/use-admin-resource"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { DataTable, TablePagination } from "@/components/admin/data-table"
import { EmptyState, ErrorState } from "@/components/admin/empty-state"
import { FilterBar, FilterSelect } from "@/components/admin/filter-bar"
import { MetricCard } from "@/components/admin/metric-card"
import { StatusBadge } from "@/components/admin/status-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { PANEL_TYPES } from "@/products/panel-types"
import type { InventoryRecord } from "@/types/admin"

/**
 * Inventory Assessment (owner) and Inventory Management (moderator) share this
 * screen because the backend grants both roles the same inventory routes. Unit
 * prices come from the inventory report, which omits them for a moderator.
 */
export function AdminInventoryPage() {
  useDocumentTitle("Inventory | PanelScan Admin")
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("")
  const [adjusting, setAdjusting] = useState<InventoryRecord | null>(null)

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
    </div>
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
      toast.success(`${record.product.name}: ${direction === "add" ? "added" : "removed"} ${parsed} unit(s).`)
      setQuantity("1")
      onDone()
    } catch (error) {
      toast.error("Stock not updated", { description: getAdminErrorMessage(error) })
    } finally {
      setIsSaving(false)
    }
  }

  return (
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
              <Input id="stock-quantity" inputMode="numeric" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
              <p className="text-xs text-muted-foreground">Whole units. Reducing stock cannot take available quantity below zero — the backend rejects that.</p>
            </div>

            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => void adjust("add")} disabled={isSaving}>{isSaving ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Plus data-icon="inline-start" aria-hidden="true" />}Add stock</Button>
              <Button variant="outline" className="flex-1" onClick={() => void adjust("reduce")} disabled={isSaving}><Minus data-icon="inline-start" aria-hidden="true" />Reduce</Button>
            </div>

            <p className="text-xs leading-5 text-muted-foreground">Adjustments apply immediately and are attributed to your account by the backend. Restock approvals that need owner sign-off should be raised under Requests.</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
