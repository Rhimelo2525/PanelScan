import { Check, Loader2, LockKeyhole, PhilippinePeso, ShoppingCart } from "lucide-react"
import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { toast } from "sonner"

import { useAuth } from "@/auth/use-auth"
import { getCartErrorMessage } from "@/cart/cart-errors"
import { useCart } from "@/cart/use-cart"
import { QuantityControl } from "@/components/cart/quantity-control"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { formatProductPrice } from "@/lib/format-price"
import type { Product } from "@/types/product"
import { isManagedPreviewProduct } from "@/preview/product-store"

interface ProductPricingPanelProps {
  product: Product
  returnTo: string
}

export function ProductPricingPanel({ product, returnTo }: ProductPricingPanelProps) {
  const { user, isAuthenticated, isLoading } = useAuth()
  const { addItem, getItemQuantity, pendingProductIds } = useCart()
  const navigate = useNavigate()
  const existingQuantity = getItemQuantity(product.id)
  const availableQuantity = product.inventory ? Math.max(0, product.inventory.quantity - product.inventory.reservedQty) : 0
  const remainingQuantity = Math.max(0, availableQuantity - existingQuantity)
  const [quantity, setQuantity] = useState(1)
  const isPending = pendingProductIds.has(product.id)
  // Brief success confirmation on the button itself. It always returns to rest,
  // so the control never sits in a state that misreports what it will do next.
  const [justAdded, setJustAdded] = useState(false)
  useEffect(() => {
    if (!justAdded) return
    const timeoutId = window.setTimeout(() => setJustAdded(false), 1600)
    return () => window.clearTimeout(timeoutId)
  }, [justAdded])
  const canAdd = user?.role === "CUSTOMER" && product.isActive && !product.deletedAt && remainingQuantity > 0

  useEffect(() => setQuantity(1), [product.id])
  useEffect(() => {
    if (remainingQuantity > 0) setQuantity((current) => Math.min(current, remainingQuantity))
  }, [remainingQuantity])

  async function handleAddToCart() {
    if (isManagedPreviewProduct(product.id)) return
    try {
      await addItem(product.id, quantity)
      toast.success(`${product.name} added to your cart.`, {
        description: `${quantity} × ${product.unit}`,
        action: { label: "View cart", onClick: () => navigate("/cart") },
      })
      setQuantity(1)
      setJustAdded(true)
    } catch (caughtError) {
      toast.error("Item not added", { description: getCartErrorMessage(caughtError) })
    }
  }

  if (isManagedPreviewProduct(product.id)) {
    return <aside className="rounded-lg border border-border bg-secondary/55 p-5 sm:p-6" aria-label="Preview product pricing"><p className="text-xs font-semibold uppercase text-muted-foreground">Session preview product</p><p className="type-metric mt-2">{formatProductPrice(product.price)}</p><p className="mt-3 text-sm leading-6 text-muted-foreground">Price per {product.unit}. This local listing is available to explore, but is not synced to checkout. It clears when you reload the page.</p></aside>
  }

  if (isLoading) {
    return <aside className="rounded-lg border border-border bg-secondary/55 p-5 sm:p-6" aria-label="Checking price access" aria-busy="true"><div className="flex gap-3"><Skeleton className="size-9 shrink-0 rounded-full" /><div className="w-full space-y-3"><Skeleton className="h-6 w-44" /><Skeleton className="h-4 w-full" /></div></div><Skeleton className="mt-5 h-11 w-full" /></aside>
  }

  if (isAuthenticated) {
    return (
      <aside className="rounded-lg border border-border bg-secondary/55 p-5 sm:p-6" aria-labelledby="authenticated-pricing-title">
        <div className="flex gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><PhilippinePeso className="size-4" aria-hidden="true" /></div>
          <div>
            <p className="text-xs font-semibold tracking-[0.13em] text-muted-foreground uppercase">Customer pricing</p>
            <h2 id="authenticated-pricing-title" className="type-metric mt-1">{formatProductPrice(product.price)}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">Price per {product.unit}. Cart quantities are checked against current available inventory.</p>
          </div>
        </div>

        {user?.role === "CUSTOMER" ? (
          <div className="mt-6 border-t border-border pt-5">
            {existingQuantity > 0 && <p className="mb-4 text-sm font-medium">{existingQuantity} currently in your cart</p>}
            <div className="flex flex-col gap-3 sm:flex-row">
              <QuantityControl value={quantity} max={Math.max(1, remainingQuantity)} disabled={!canAdd || isPending} productName={product.name} onChange={setQuantity} />
              <Button size="lg" className="min-w-40 flex-1" disabled={!canAdd || isPending} onClick={() => void handleAddToCart()}>
                {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : justAdded ? <Check data-icon="inline-start" aria-hidden="true" /> : <ShoppingCart data-icon="inline-start" aria-hidden="true" />}
                <span key={isPending ? "pending" : justAdded ? "added" : "idle"} className="motion-fade">{isPending ? "Adding…" : justAdded ? "Added" : "Add to cart"}</span>
              </Button>
            </div>
            {!canAdd && <p className="mt-3 text-xs leading-5 text-muted-foreground">{remainingQuantity === 0 && existingQuantity > 0 ? "All currently available stock is already in your cart." : "This product cannot be added to the cart right now."}</p>}
          </div>
        ) : <p className="mt-5 border-t border-border pt-4 text-xs text-muted-foreground">Cart access is available to customer accounts only.</p>}
      </aside>
    )
  }

  return (
    <aside className="rounded-lg border border-border bg-secondary/55 p-5 sm:p-6" aria-labelledby="guest-pricing-title">
      <div className="flex gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground"><LockKeyhole className="size-4" aria-hidden="true" /></div>
        <div>
          <h2 id="guest-pricing-title" className="text-lg font-semibold tracking-[-0.02em]">Sign in to view pricing</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Registered customers can access current catalog pricing and build a cart.</p>
        </div>
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <Button size="lg" asChild><Link to="/login" state={{ from: returnTo }}>Log in to view price</Link></Button>
        <Button size="lg" variant="outline" asChild><Link to="/register" state={{ from: returnTo }}>Create account</Link></Button>
      </div>
    </aside>
  )
}
