import { AlertTriangle, ArrowRight } from "lucide-react"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { getCartProductWarning } from "@/cart/cart-utils"
import { calculateLineTotal, formatMinorUnits } from "@/lib/format-price"
import type { CartItem } from "@/types/cart"

export function CartSummary({ items, itemCount, cartError }: { items: CartItem[]; itemCount: number; cartError?: string | null }) {
  const subtotal = items.reduce<number | null>((total, item) => {
    const lineTotal = calculateLineTotal(item.product.price, item.quantity)
    if (total === null || lineTotal === null) return null
    return total + lineTotal
  }, 0)
  const checkoutWarning = items.map((item) => getCartProductWarning(item.product, item.quantity)).find(Boolean)
  const canCheckout = items.length > 0 && !cartError && !checkoutWarning && subtotal !== null

  return (
    <aside className="rounded-xl border border-border bg-secondary/45 p-6 lg:sticky lg:top-28" aria-labelledby="cart-summary-title">
      <h2 id="cart-summary-title" className="text-xl font-semibold tracking-[-0.025em]">Cart summary</h2>
      <dl className="mt-6 space-y-4 border-b border-border pb-5 text-sm">
        <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Item quantity</dt><dd className="font-medium tabular-nums">{itemCount}</dd></div>
        <div className="flex items-end justify-between gap-4"><dt className="text-muted-foreground">Subtotal</dt><dd className="text-xl font-semibold tabular-nums">{subtotal === null ? "Unavailable" : formatMinorUnits(subtotal)}</dd></div>
      </dl>
      {canCheckout ? <div className="mt-5 border-l-2 border-primary bg-background/70 px-4 py-3"><p className="text-sm font-semibold">Ready for checkout</p><p className="mt-1 text-xs leading-5 text-muted-foreground">You'll add delivery information and review the order before it is created.</p></div> : <div className="mt-5 flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-4 py-3 text-xs leading-5 text-destructive"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{checkoutWarning ?? cartError ?? "This cart cannot proceed to checkout."}</div>}
      {canCheckout ? <Button size="lg" className="mt-5 w-full" asChild><Link to="/checkout">Proceed to checkout <ArrowRight data-icon="inline-end" aria-hidden="true" /></Link></Button> : <Button size="lg" className="mt-5 w-full" disabled>Proceed to checkout</Button>}
      <Button variant="outline" size="lg" className="mt-3 w-full" asChild><Link to="/products">Continue shopping</Link></Button>
    </aside>
  )
}
