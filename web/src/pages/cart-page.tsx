import { Loader2, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { useAuth } from "@/auth/use-auth"
import { getCartErrorMessage } from "@/cart/cart-errors"
import { useCart } from "@/cart/use-cart"
import { CartItem } from "@/components/cart/cart-item"
import { CartEmptyState, CartErrorState, CartPageSkeleton } from "@/components/cart/cart-states"
import { CartSummary } from "@/components/cart/cart-summary"
import { Container } from "@/components/layout/container"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { useDocumentTitle } from "@/hooks/use-document-title"

export function CartPage() {
  useDocumentTitle("Your cart | PanelScan")
  const { user } = useAuth()
  const { items, itemCount, isLoading, error, pendingProductIds, isClearing, refreshCart, updateItem, removeItem, clearCart } = useCart()

  async function handleUpdate(productId: string, quantity: number) {
    try {
      await updateItem(productId, quantity)
    } catch (caughtError) {
      toast.error("Quantity not updated", { description: getCartErrorMessage(caughtError) })
    }
  }

  async function handleRemove(productId: string, productName: string) {
    try {
      await removeItem(productId)
      toast.success(`${productName} removed from your cart.`)
    } catch (caughtError) {
      toast.error("Item not removed", { description: getCartErrorMessage(caughtError) })
    }
  }

  async function handleClear() {
    try {
      await clearCart()
      toast.success("Your cart is now empty.")
    } catch (caughtError) {
      toast.error("Cart not cleared", { description: getCartErrorMessage(caughtError) })
    }
  }

  if (user?.role !== "CUSTOMER") {
    return <Container className="py-16 sm:py-24"><CartErrorState message="Cart access is available to customer accounts only." /></Container>
  }

  return (
    <Container className="py-10 sm:py-14 lg:py-18">
      <div className="flex flex-wrap items-end justify-between gap-5 border-b border-border pb-7">
        <div><p className="section-eyebrow">Material selection</p><h1 className="type-h1 mt-4">Your cart</h1>{!isLoading && !error && <p className="mt-3 text-sm text-muted-foreground">{itemCount} {itemCount === 1 ? "item" : "items"} ready for review</p>}</div>
        {items.length > 0 && <AlertDialog><AlertDialogTrigger asChild><Button variant="outline" disabled={isClearing}><Trash2 data-icon="inline-start" aria-hidden="true" />Clear cart</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Clear your cart?</AlertDialogTitle><AlertDialogDescription>This will remove all items from your cart.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void handleClear()} disabled={isClearing}>{isClearing && <Loader2 className="animate-spin" aria-hidden="true" />}Clear cart</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
      </div>

      <div className="mt-10">
        {isLoading && !items.length ? <CartPageSkeleton /> : error && !items.length ? <CartErrorState message={error} onRetry={() => void refreshCart()} /> : items.length === 0 ? <CartEmptyState /> : (
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14">
            <section aria-label="Cart items">
              {items.map((item) => <CartItem key={item.id} item={item} isPending={pendingProductIds.has(item.productId)} onQuantityChange={(quantity) => void handleUpdate(item.productId, quantity)} onRemove={() => void handleRemove(item.productId, item.product.name)} />)}
            </section>
            <CartSummary items={items} itemCount={itemCount} cartError={error} />
          </div>
        )}
      </div>
    </Container>
  )
}
