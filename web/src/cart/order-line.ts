import type { NavigateFunction } from "react-router-dom"

import { formatMinorUnits, formatProductPrice, parsePriceToMinorUnits } from "@/lib/format-price"
import type { CartItem } from "@/types/cart"
import type { Product } from "@/types/product"

/** Stock that can still be ordered: on hand minus what other orders have reserved. */
export function availableQuantity(product: Product): number {
  return product.inventory ? Math.max(0, product.inventory.quantity - product.inventory.reservedQty) : 0
}

/** Product, quantity and subtotal shown before adding to the cart or checking out. */
export function orderLineDetails(product: Product, quantity: number) {
  const unitPrice = parsePriceToMinorUnits(product.price)
  return [
    { label: "Product", value: product.name },
    { label: "Quantity", value: `${quantity} × ${product.unit}` },
    { label: "Subtotal", value: unitPrice === null ? formatProductPrice(product.price) : formatMinorUnits(unitPrice * quantity) },
  ]
}

/** Checks out this one product without touching the cart; the checkout page reads it back from the route state or the session. */
export function beginDirectCheckout(product: Product, quantity: number, navigate: NavigateFunction) {
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
