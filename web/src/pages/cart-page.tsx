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
import { Checkbox } from "@/components/ui/checkbox"
import { useDocumentTitle } from "@/hooks/use-document-title"

export function CartPage() {
  useDocumentTitle("Your cart | PanelScan")
  const { user } = useAuth()
  const {
    items,
    itemCount,
    isLoading,
    error,
    pendingProductIds,
    isClearing,
    refreshCart,
    updateItem,
    removeSelectedItems,
    selectedProductIds,
    toggleSelectProduct,
    selectAllProducts,
    isProductSelected,
    selectedItems,
    selectedItemCount,
  } = useCart()

  const isAllSelected = items.length > 0 && items.every((item) => selectedProductIds.has(item.productId))
  const isNoneSelected = items.length === 0 || selectedItems.length === 0
  const isIndeterminate = !isAllSelected && !isNoneSelected

  async function handleUpdate(productId: string, quantity: number, productName: string) {
    try {
      await updateItem(productId, quantity)
      if (quantity <= 0) {
        toast.success(`${productName} removed from your cart.`)
      }
    } catch (caughtError) {
      toast.error("Quantity not updated", { description: getCartErrorMessage(caughtError) })
    }
  }

  async function handleDeleteSelected() {
    try {
      await removeSelectedItems()
      toast.success("Selected items removed from your cart.")
    } catch (caughtError) {
      toast.error("Items not removed", { description: getCartErrorMessage(caughtError) })
    }
  }

  if (user?.role !== "CUSTOMER") {
    return <Container className="py-16 sm:py-24"><CartErrorState message="Cart access is available to customer accounts only." /></Container>
  }

  return (
    <Container className="py-10 sm:py-14 lg:py-18">
      <div className="flex flex-wrap items-end justify-between gap-5 border-b border-border pb-7">
        <div>
          <p className="section-eyebrow">Material selection</p>
          <h1 className="type-h1 mt-4">Your cart</h1>
          {!isLoading && !error && (
            <p className="mt-3 text-sm text-muted-foreground">{itemCount} {itemCount === 1 ? "item" : "items"} ready for review</p>
          )}
        </div>
      </div>

      <div className="mt-10">
        {isLoading && !items.length ? (
          <CartPageSkeleton />
        ) : error && !items.length ? (
          <CartErrorState message={error} onRetry={() => void refreshCart()} />
        ) : items.length === 0 ? (
          <CartEmptyState />
        ) : (
          <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14">
            <section aria-label="Cart items">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4 mb-4">
                <div className="flex items-center gap-4">
                  <label
                    htmlFor="select-all-cart-items"
                    className="flex items-center gap-3 text-sm font-medium text-foreground cursor-pointer select-none transition-colors hover:text-primary"
                  >
                    <Checkbox
                      id="select-all-cart-items"
                      checked={isAllSelected ? true : isIndeterminate ? "indeterminate" : false}
                      onCheckedChange={(checked) => selectAllProducts(checked === true || checked === "indeterminate")}
                      aria-label="Select all items in cart"
                    />
                    <span>Select all items</span>
                  </label>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {selectedItems.length} of {items.length} selected
                  </span>
                </div>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={selectedItems.length === 0 || isClearing}
                      className="text-muted-foreground hover:text-destructive text-xs h-8 px-2.5"
                      aria-label="Delete selected items from cart"
                    >
                      <Trash2 className="size-3.5" data-icon="inline-start" aria-hidden="true" />
                      Delete Selected Items
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remove selected items?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Are you sure you want to remove the selected items from your cart?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        onClick={() => void handleDeleteSelected()}
                        disabled={isClearing}
                      >
                        {isClearing && <Loader2 className="animate-spin" aria-hidden="true" />}
                        Confirm Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
              {items.map((item) => (
                <CartItem
                  key={item.id}
                  item={item}
                  isSelected={isProductSelected(item.productId)}
                  onSelectChange={() => toggleSelectProduct(item.productId)}
                  isPending={pendingProductIds.has(item.productId)}
                  onQuantityChange={(quantity) => void handleUpdate(item.productId, quantity, item.product.name)}
                />
              ))}
            </section>
            <CartSummary
              selectedItems={selectedItems}
              selectedItemCount={selectedItemCount}
              cartError={error}
            />
          </div>
        )}
      </div>
    </Container>
  )
}
