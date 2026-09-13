import { Loader2, LockKeyhole } from "lucide-react"

import { ProductImage } from "@/components/products/product-image"
import { Button } from "@/components/ui/button"
import { calculateLineTotal, formatMinorUnits, formatProductPrice } from "@/lib/format-price"
import type { CartItem } from "@/types/cart"

interface CheckoutOrderSummaryProps {
  items: CartItem[]
  itemCount: number
  isSubmitting: boolean
  canSubmit: boolean
}

export function CheckoutOrderSummary({ items, itemCount, isSubmitting, canSubmit }: CheckoutOrderSummaryProps) {
  const subtotal = items.reduce<number | null>((sum, item) => {
    const lineTotal = calculateLineTotal(item.product.price, item.quantity)
    return sum === null || lineTotal === null ? null : sum + lineTotal
  }, 0)

  return (
    <aside className="rounded-xl border border-border bg-secondary/42 p-5 sm:p-6 lg:sticky lg:top-28" aria-labelledby="checkout-summary-title">
      <h2 id="checkout-summary-title" className="text-xl font-semibold tracking-[-0.025em]">Order summary</h2>
      <p className="mt-1 text-xs text-muted-foreground">{itemCount} {itemCount === 1 ? "item" : "items"}</p>

      <div className="mt-6 max-h-[25rem] space-y-4 overflow-y-auto pr-1">
        {items.map((item) => {
          const lineTotal = calculateLineTotal(item.product.price, item.quantity)
          return (
            <div key={item.id} className="grid grid-cols-[4.5rem_1fr] gap-3 border-b border-border pb-4 last:border-0">
              <ProductImage image={item.product.images[0]} productName={item.product.name} categorySlug="cart-material" className="aspect-square" />
              <div className="min-w-0">
                <h3 className="text-sm leading-5 font-semibold">{item.product.name}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{item.quantity} × {formatProductPrice(item.product.price)}</p>
                <p className="mt-2 text-sm font-medium tabular-nums">{lineTotal === null ? "Unavailable" : formatMinorUnits(lineTotal)}</p>
              </div>
            </div>
          )
        })}
      </div>

      <dl className="mt-6 space-y-3 border-t border-border pt-5 text-sm">
        <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Subtotal</dt><dd className="font-medium tabular-nums">{subtotal === null ? "Unavailable" : formatMinorUnits(subtotal)}</dd></div>
        <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Shipping fee</dt><dd className="font-medium">{formatProductPrice("0.00")}</dd></div>
        <div className="flex items-end justify-between gap-4 border-t border-border pt-4"><dt className="font-semibold">Estimated total</dt><dd className="text-xl font-semibold tabular-nums">{subtotal === null ? "Unavailable" : formatMinorUnits(subtotal)}</dd></div>
      </dl>

      <p className="mt-4 text-xs leading-5 text-muted-foreground">The server recalculates the final order total and validates inventory when you place the order. Delivery coordination follows afterward.</p>
      <Button type="submit" size="lg" className="mt-6 h-11 w-full" disabled={!canSubmit || isSubmitting}>
        {isSubmitting ? <Loader2 className="animate-spin" aria-hidden="true" /> : <LockKeyhole data-icon="inline-start" aria-hidden="true" />}
        {isSubmitting ? "Placing order…" : "Place order"}
      </Button>
      <p className="mt-3 text-center text-[0.7rem] leading-5 text-muted-foreground">No payment is collected here. You continue to secure PayMongo checkout from your order.</p>
    </aside>
  )
}
