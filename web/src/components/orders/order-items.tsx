import { Package } from "lucide-react"

import { formatProductPrice } from "@/lib/format-price"
import type { OrderItem } from "@/types/order"

export function OrderItems({ items }: { items: OrderItem[] }) {
  return (
    <div className="divide-y divide-border border-y border-border">
      {items.map((item) => (
        <article key={item.id} className="grid grid-cols-[3rem_1fr] gap-4 py-5 sm:grid-cols-[3.5rem_1fr_auto] sm:items-center">
          <div className="flex size-12 items-center justify-center bg-secondary text-primary sm:size-14"><Package className="size-5" aria-hidden="true" /></div>
          <div className="min-w-0"><h3 className="font-semibold">{item.productName}</h3><p className="mt-1 text-xs text-muted-foreground">{item.quantity} × {formatProductPrice(item.unitPrice)}</p></div>
          <p className="col-start-2 text-sm font-semibold tabular-nums sm:col-start-auto sm:text-base">{formatProductPrice(item.lineTotal)}</p>
        </article>
      ))}
    </div>
  )
}
