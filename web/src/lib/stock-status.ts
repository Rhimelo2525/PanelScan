/**
 * The one stock-status rule for the whole website - customer product cards and
 * detail page, and the moderator/owner Products and Inventory pages all call
 * getStockStatus, so the same quantity always shows the same status.
 *
 * It reuses each product's existing reorder threshold (Inventory.reorderLevel,
 * default 10, editable on the Inventory page) and adds a "Critical" tier at half
 * of it:
 *
 *   available = 0                          -> Out of Stock
 *   available <= floor(reorderLevel / 2)   -> Critical      (default: 1-5)
 *   available <= reorderLevel              -> Low Stock     (default: 6-10)
 *   otherwise                              -> In Stock      (default: 11+)
 *
 * "Available" is on-hand quantity minus reserved, the same figure cart and
 * checkout validate against.
 */
export type StockStatus = "IN_STOCK" | "LOW_STOCK" | "CRITICAL" | "OUT_OF_STOCK"

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  IN_STOCK: "In Stock",
  LOW_STOCK: "Low Stock",
  CRITICAL: "Critical",
  OUT_OF_STOCK: "Out of Stock",
}

/** For stock-status filters, most to least available. */
export const STOCK_STATUS_OPTIONS = (["IN_STOCK", "LOW_STOCK", "CRITICAL", "OUT_OF_STOCK"] as const).map((value) => ({ value, label: STOCK_STATUS_LABELS[value] }))

export interface StockLevels {
  quantity: number
  reservedQty?: number
  reorderLevel: number
}

export function availableQuantity(inventory: Pick<StockLevels, "quantity" | "reservedQty"> | null | undefined): number {
  if (!inventory) return 0
  return Math.max(0, inventory.quantity - (inventory.reservedQty ?? 0))
}

export function criticalStockLevel(reorderLevel: number): number {
  return Math.floor(Math.max(0, reorderLevel) / 2)
}

/** A product with no inventory record counts as Out of Stock. */
export function getStockStatus(inventory: StockLevels | null | undefined): StockStatus {
  const available = availableQuantity(inventory)
  if (!inventory || available <= 0) return "OUT_OF_STOCK"
  if (available <= criticalStockLevel(inventory.reorderLevel)) return "CRITICAL"
  if (available <= inventory.reorderLevel) return "LOW_STOCK"
  return "IN_STOCK"
}
