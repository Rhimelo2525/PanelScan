import { availableQuantity } from "@/lib/stock-status"
import type { CartProduct } from "@/types/cart"

export function getAvailableQuantity(product: Pick<CartProduct, "inventory">): number {
  return availableQuantity(product.inventory)
}

export function isCartProductAvailable(product: CartProduct): boolean {
  return product.isActive && product.deletedAt === null && getAvailableQuantity(product) > 0
}

export function getCartProductWarning(product: CartProduct, quantity: number): string | null {
  if (product.deletedAt || !product.isActive) return "This product is no longer available. Remove it to continue."
  if (!product.inventory || getAvailableQuantity(product) === 0) return "This product is currently out of stock. Remove it to continue."
  if (quantity > getAvailableQuantity(product)) return "Some items in your cart have limited availability. Please update your quantity before checkout."
  return null
}
