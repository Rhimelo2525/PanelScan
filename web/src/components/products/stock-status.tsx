import { CircleCheck, CircleX, OctagonAlert, TriangleAlert } from "lucide-react"

import { getStockStatus, STOCK_STATUS_LABELS } from "@/lib/stock-status"
import type { StockStatus as StockStatusValue } from "@/lib/stock-status"
import { cn } from "@/lib/utils"
import type { ProductInventory } from "@/types/product"

interface StockStatusProps {
  inventory: ProductInventory | null
  compact?: boolean
}

const icons: Record<StockStatusValue, typeof CircleCheck> = {
  IN_STOCK: CircleCheck,
  LOW_STOCK: TriangleAlert,
  CRITICAL: OctagonAlert,
  OUT_OF_STOCK: CircleX,
}

const tones: Record<StockStatusValue, string> = {
  IN_STOCK: "text-emerald-800",
  LOW_STOCK: "text-amber-800",
  CRITICAL: "text-orange-700",
  OUT_OF_STOCK: "text-destructive",
}

/** Customer-facing stock badge; the status comes from the shared rule in lib/stock-status. */
export function StockStatus({ inventory, compact = false }: StockStatusProps) {
  const status = getStockStatus(inventory)
  const Icon = icons[status]

  return (
    <span className={cn(
      "inline-flex w-fit items-center gap-1.5 text-xs font-medium",
      tones[status],
      !compact && "rounded-full surface-card px-2.5 py-1.5",
    )}>
      <Icon className="size-3.5" aria-hidden="true" />
      {STOCK_STATUS_LABELS[status]}
    </span>
  )
}
