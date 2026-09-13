import { fallbackProducts } from "@/data/catalog-fallback"
import type { RatingPurchase } from "@/preview/rating-policy"

export interface CustomerPreviewOrder extends RatingPurchase {
  orderNumber: string
  date: string
  items: { productId: string; name: string; price: string; quantity: number }[]
}

// Explicitly fictional purchases. These never enter cart, payment, or order APIs.
const ceiling = fallbackProducts.find((product) => product.sku === "CP-PVC-001")!
export const customerPreviewOrders: CustomerPreviewOrder[] = ["DELIVERED", "COMPLETED", "PENDING", "PROCESSING", "PREPARING", "SHIPPED", "IN_TRANSIT"].map((status, index) => ({
  id: `customer-preview-order-${index + 1}`,
  orderNumber: `PREVIEW-${1047 - index}`,
  date: `2026-08-${String(27 - index).padStart(2, "0")}`,
  status,
  items: [{ productId: ceiling.id, name: ceiling.name, price: ceiling.price, quantity: 4 + index }],
}))
