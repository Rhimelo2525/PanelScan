import { apiRequest } from "@/api/client"
import type { CreatePaymentResult, PaginatedPayments, Payment, PaymentListItem, PaymentQuery } from "@/types/payment"

/**
 * The backend has no per-order payment endpoint and GET /api/orders/:id does not
 * include the payment, so an order's payment can only be located by walking the
 * customer's own payment list. Bounded so a long payment history can never turn
 * one order view into an unbounded request loop.
 */
const LOOKUP_PAGE_SIZE = 50
const LOOKUP_MAX_PAGES = 5

/**
 * Starts a payment for an order. Only the order id is sent - the backend reads
 * the authoritative amount from the order itself, so the browser never asserts
 * what an order costs.
 */
export function createPayment(orderId: string): Promise<CreatePaymentResult> {
  return apiRequest<CreatePaymentResult>("/payments/create", { method: "POST", authenticated: true, body: { orderId } })
}

export async function getPaymentById(paymentId: string, signal?: AbortSignal): Promise<Payment> {
  const response = await apiRequest<{ payment: Payment }>(`/payments/${paymentId}`, { authenticated: true, signal })
  return response.payment
}

export function getPayments(query: PaymentQuery = {}, signal?: AbortSignal): Promise<PaginatedPayments> {
  const search = new URLSearchParams()
  if (query.page) search.set("page", String(query.page))
  if (query.limit) search.set("limit", String(query.limit))
  const suffix = search.size ? `?${search.toString()}` : ""
  return apiRequest<PaginatedPayments>(`/payments${suffix}`, { authenticated: true, signal })
}

/** Returns the customer's payment for an order, or null when none has been started. */
export async function findPaymentForOrder(orderId: string, signal?: AbortSignal): Promise<PaymentListItem | null> {
  for (let page = 1; page <= LOOKUP_MAX_PAGES; page += 1) {
    const result = await getPayments({ page, limit: LOOKUP_PAGE_SIZE }, signal)
    const match = result.payments.find((payment) => payment.orderId === orderId)
    if (match) return match
    if (page >= result.pagination.totalPages) break
  }
  return null
}
