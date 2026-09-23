import { useState } from "react"

import { ProductImage } from "@/components/products/product-image"
import { formatMoney } from "@/admin/admin-format"
import type { OrderReportItem } from "@/types/admin"

const COLLAPSED_COUNT = 2

/**
 * Compact per-order product list for the admin Sales table: thumbnail, name,
 * and quantity for every product in the order (not just a count) - sourced
 * entirely from OrderReportItem, itself sourced from the order's own stored
 * OrderItem snapshot (never the customer's current cart - see
 * reports.service.ts#toOrderRow). Collapses beyond COLLAPSED_COUNT items so
 * a many-product order doesn't blow out row height, but never hides the
 * rest permanently - "+N more" expands it in place.
 */
export function OrderItemsCell({ items }: { items: OrderReportItem[] | undefined | null }) {
  const [expanded, setExpanded] = useState(false)

  if (!items || items.length === 0) {
    return <span className="text-xs text-muted-foreground">No items</span>
  }

  const visibleItems = expanded ? items : items.slice(0, COLLAPSED_COUNT)
  const hiddenCount = items.length - visibleItems.length

  return (
    <div className="flex min-w-48 flex-col gap-2.5">
      {visibleItems.map((item) => (
        <div key={item.id} className="flex items-center gap-2.5">
          <ProductImage
            image={item.productImage}
            productName={item.productName}
            categorySlug="cart-material"
            className="size-10 shrink-0 rounded-md"
          />
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-foreground" title={item.productName}>
              {item.productName}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {item.quantity} {item.quantity === 1 ? "pc" : "pcs"}
              {item.unitPrice !== undefined && <> · {formatMoney(item.unitPrice)} each</>}
            </p>
          </div>
        </div>
      ))}
      {hiddenCount > 0 && (
        <button type="button" onClick={() => setExpanded(true)} className="w-fit text-[11px] font-medium text-primary hover:underline">
          + {hiddenCount} more
        </button>
      )}
      {expanded && items.length > COLLAPSED_COUNT && (
        <button type="button" onClick={() => setExpanded(false)} className="w-fit text-[11px] font-medium text-muted-foreground hover:underline">
          Show less
        </button>
      )}
    </div>
  )
}
