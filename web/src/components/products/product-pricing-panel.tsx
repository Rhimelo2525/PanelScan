import { ArrowRight, Check, Loader2, LockKeyhole, PhilippinePeso, ShoppingCart } from "lucide-react"
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
import type { CartItem } from "@/types/cart"
import type { Product } from "@/types/product"

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
  const canAdd = user?.role === "CUSTOMER" && product.isActive && !product.deletedAt && remainingQuantity > 0 && quantity <= remainingQuantity
  const canDirectCheckout = user?.role === "CUSTOMER" && product.isActive && !product.deletedAt && availableQuantity > 0 && quantity <= availableQuantity

  useEffect(() => setQuantity(1), [product.id])
  useEffect(() => {
    if (availableQuantity > 0) setQuantity((current) => Math.min(current, availableQuantity))
  }, [availableQuantity])

  async function handleAddToCart() {
    if (quantity > remainingQuantity) {
      toast.error(
        existingQuantity > 0
          ? `Only ${remainingQuantity} more can be added to your cart (you already have ${existingQuantity} in your cart).`
          : `Only ${availableQuantity} items are available.`
      )
      return
    }
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

  function handleProceedToCheckout() {
    if (!product.isActive || product.deletedAt || availableQuantity <= 0) {
      toast.error("This product is currently out of stock.")
      return
    }
    if (quantity > availableQuantity) {
      toast.error(`Only ${availableQuantity} items are available.`)
      return
    }

    const directItem: CartItem = {
      id: `direct-${product.id}`,
      cartId: "direct",
      productId: product.id,
      quantity,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      product: {
        id: product.id,
        name: product.name,
        slug: product.slug,
        sku: product.sku,
        price: product.price ?? "0.00",
        unit: product.unit,
        isActive: product.isActive,
        deletedAt: product.deletedAt,
        images: product.images,
        inventory: product.inventory,
      },
    }

    sessionStorage.setItem("panelscan_direct_checkout", JSON.stringify(directItem))
    navigate("/checkout?direct=1", {
      state: { directCheckout: directItem },
    })
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
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <div className="sm:self-start">
                <QuantityControl
                  value={quantity}
                  min={1}
                  max={Math.max(1, availableQuantity)}
                  disabled={availableQuantity <= 0 || isPending}
                  productName={product.name}
                  onChange={setQuantity}
                  onMaxReached={() => toast.warning(`Only ${availableQuantity} items are available.`)}
                />
              </div>
              <div className="flex flex-1 flex-col gap-2.5">
                <Button size="lg" className="w-full" disabled={!canAdd || isPending} onClick={() => void handleAddToCart()}>
                  {isPending ? <Loader2 className="animate-spin" aria-hidden="true" /> : justAdded ? <Check data-icon="inline-start" aria-hidden="true" /> : <ShoppingCart data-icon="inline-start" aria-hidden="true" />}
                  <span key={isPending ? "pending" : justAdded ? "added" : "idle"} className="motion-fade">{isPending ? "Adding…" : justAdded ? "Added" : "Add to cart"}</span>
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full"
                  disabled={!canDirectCheckout || isPending}
                  onClick={handleProceedToCheckout}
                >
                  Proceed to Checkout
                  <ArrowRight data-icon="inline-end" aria-hidden="true" />
                </Button>
              </div>
            </div>
            {availableQuantity <= 0 ? (
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                This product is currently out of stock.
              </p>
            ) : !canAdd && remainingQuantity === 0 && existingQuantity > 0 ? (
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                All currently available stock is already in your cart. You can proceed to checkout directly or review your cart.
              </p>
            ) : null}
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
