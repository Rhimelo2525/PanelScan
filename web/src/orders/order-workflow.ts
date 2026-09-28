import type { Order } from "@/types/order"
import type { Payment } from "@/types/payment"

/**
 * Where the customer's order stands in the order -> shipping quote ->
 * payment -> delivery workflow, from the order, its delivery record and its
 * payment. The backend enforces every step; this only decides what to show.
 *
 *   awaiting_approval  placed, waiting for a moderator
 *   awaiting_quote     approved, PanelScan is calculating the delivery fee
 *   awaiting_payment   shipping fee quoted - products + shipping payable in one GCash payment
 *   paid               payment confirmed by PayMongo (delivery is prepared, then booked)
 *   cancelled
 */
export type OrderStage = "awaiting_approval" | "awaiting_quote" | "awaiting_payment" | "paid" | "cancelled"

export function isShippingQuoted(order: Order): boolean {
  return Boolean(order.delivery?.quotedAt)
}

export function getOrderStage(order: Order, payment: Payment | null): OrderStage {
  if (payment?.status === "PAID" || payment?.status === "REFUNDED") return "paid"
  if (order.status === "CANCELLED") return "cancelled"
  if (!order.moderatorApproved) return "awaiting_approval"
  if (!isShippingQuoted(order)) return "awaiting_quote"
  return "awaiting_payment"
}
