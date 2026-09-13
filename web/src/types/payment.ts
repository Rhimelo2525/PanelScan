import type { OrderStatus } from "@/types/order"

export type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED"

/**
 * Shape returned by GET /api/payments/:id. The backend deliberately projects a
 * narrow set of columns here, so this is the smallest payment record the
 * website can rely on.
 */
export interface Payment {
  id: string
  orderId: string
  status: PaymentStatus
  amount: string
  method: string
  transactionRef: string | null
  paidAt: string | null
  createdAt: string
}

/** Lean order summary the backend includes with every payment in GET /api/payments. */
export interface PaymentOrderSummary {
  id: string
  orderNumber: string
  customerId: string
  status: OrderStatus
  totalAmount: string
}

/** Rows returned by GET /api/payments carry the full record plus its order summary. */
export interface PaymentListItem extends Payment {
  updatedAt: string
  order: PaymentOrderSummary
}

export interface PaymentPagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface PaginatedPayments {
  payments: PaymentListItem[]
  pagination: PaymentPagination
}

/** POST /api/payments/create response. The checkout URL is PayMongo-hosted. */
export interface CreatePaymentResult {
  paymentId: string
  status: PaymentStatus
  checkoutUrl: string
}

export interface PaymentQuery {
  page?: number
  limit?: number
}
