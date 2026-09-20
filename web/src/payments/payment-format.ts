import type { Order, OrderStatus } from "@/types/order"
import type { Payment, PaymentStatus } from "@/types/payment"

/**
 * Backend PaymentStatus values mapped to customer-facing wording. PENDING covers
 * both "checkout started, not completed" and "paid, awaiting the provider's
 * confirmation webhook" - the backend does not distinguish the two, so the label
 * stays honest about what is actually known.
 */
const paymentStatusLabels: Record<PaymentStatus, string> = {
  PENDING: "Awaiting payment",
  PAID: "Paid",
  FAILED: "Failed",
  REFUNDED: "Refunded",
}

const paymentStatusDescriptions: Record<PaymentStatus, string> = {
  PENDING: "A payment was started for this order but PanelScan has not received a confirmed result yet.",
  PAID: "PanelScan received a confirmed successful payment for this order.",
  FAILED: "The payment provider reported that this payment did not go through.",
  REFUNDED: "This payment is recorded as refunded.",
}

export function formatPaymentStatus(status: PaymentStatus): string {
  return paymentStatusLabels[status]
}

export function describePaymentStatus(status: PaymentStatus): string {
  return paymentStatusDescriptions[status]
}

/**
 * Mirrors the backend's own eligibility checks in payment.service.ts: a
 * cancelled order cannot be paid, and an order whose payment is already PAID or
 * REFUNDED cannot be paid again. Everything else is accepted by the backend,
 * including retrying a PENDING or FAILED attempt (the payment row is reused).
 */
export function canStartPayment(orderStatus: OrderStatus, payment: Payment | null, moderatorApproved?: boolean): boolean {
  if (orderStatus === "CANCELLED") return false
  if (moderatorApproved === false) return false
  if (payment && (payment.status === "PAID" || payment.status === "REFUNDED")) return false
  return true
}

/** Terminal from the website's point of view: no further webhook is expected. */
export function isPaymentSettled(payment: Payment | null): boolean {
  return payment !== null && payment.status !== "PENDING"
}

export function paymentActionLabel(payment: Payment | null): string {
  return payment?.status === "FAILED" ? "Try payment again" : "Continue to payment"
}

/** True when cancelling the order could strand an already-open checkout session. */
export function hasOpenPaymentAttempt(order: Order, payment: Payment | null): boolean {
  return order.status === "PENDING" && payment?.status === "PENDING"
}
