import { CircleCheck, CircleHelp, CircleX, TriangleAlert } from "lucide-react"

import { cn } from "@/lib/utils"
import type { ProductInventory } from "@/types/product"

interface StockStatusProps {
  inventory: ProductInventory | null
  compact?: boolean
}

function getStockLabel(inventory: ProductInventory | null): string {
  if (!inventory) return "Out of stock"
  const available = inventory.quantity - inventory.reservedQty
  if (available <= 0) return "Out of stock"
  if (available <= inventory.reorderLevel) return "Low stock"
  return "In stock"
}

export function StockStatus({ inventory, compact = false }: StockStatusProps) {
  const label = getStockLabel(inventory)
  const Icon = label === "In stock" ? CircleCheck : label === "Low stock" ? TriangleAlert : label === "Out of stock" ? CircleX : CircleHelp

  return (
    <span className={cn(
      "inline-flex w-fit items-center gap-1.5 text-xs font-medium",
      label === "In stock" && "text-emerald-800",
      label === "Low stock" && "text-amber-800",
      label === "Out of stock" && "text-destructive",
      label === "Availability on request" && "text-muted-foreground",
      !compact && "rounded-full surface-card px-2.5 py-1.5",
    )}>
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  )
}
