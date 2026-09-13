import type { CartProduct } from "@/types/cart"

export function getAvailableQuantity(product: Pick<CartProduct, "inventory">): number {
  if (!product.inventory) return 0
  return Math.max(0, product.inventory.quantity - product.inventory.reservedQty)
}

export function isCartProductAvailable(product: CartProduct): boolean {
  return product.isActive && product.deletedAt === null && getAvailableQuantity(product) > 0
}

export function getCartProductWarning(product: CartProduct, quantity: number): string | null {
  if (product.deletedAt || !product.isActive) return "This product is no longer available. Remove it to continue."
  if (!product.inventory || getAvailableQuantity(product) === 0) return "This product is currently out of stock. Remove it to continue."
  if (quantity > getAvailableQuantity(product)) return `Only ${getAvailableQuantity(product)} ${product.unit} currently available. Reduce the quantity or remove this item.`
  return null
}
