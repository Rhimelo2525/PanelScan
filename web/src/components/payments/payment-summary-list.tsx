import { OrderStatusBadge } from "@/components/orders/order-status-badge"
import { PaymentStatusBadge } from "@/components/payments/payment-status-badge"
import { formatProductPrice } from "@/lib/format-price"
import { formatOrderDate } from "@/orders/order-format"
import type { Order } from "@/types/order"
import type { Payment } from "@/types/payment"

/**
 * Payment state and order fulfilment state are two different things and are
 * always shown as two separate rows - an order can be Pending while its payment
 * is Paid, and collapsing them would misrepresent both.
 */
export function PaymentSummaryList({ payment, order, orderNumber }: { payment: Payment; order: Order | null; orderNumber: string }) {
  return (
    <dl className="mt-7 grid gap-4 border-t border-border/70 pt-6 text-sm sm:max-w-lg">
      <div className="flex flex-wrap items-center justify-between gap-2"><dt className="text-muted-foreground">Order</dt><dd className="font-medium">{order?.orderNumber ?? orderNumber}</dd></div>
      <div className="flex flex-wrap items-center justify-between gap-2"><dt className="text-muted-foreground">Amount</dt><dd className="font-semibold tabular-nums">{formatProductPrice(payment.amount)}</dd></div>
      <div className="flex flex-wrap items-center justify-between gap-2"><dt className="text-muted-foreground">Payment status</dt><dd><PaymentStatusBadge status={payment.status} /></dd></div>
      {order && <div className="flex flex-wrap items-center justify-between gap-2"><dt className="text-muted-foreground">Order status</dt><dd><OrderStatusBadge status={order.status} /></dd></div>}
      {payment.paidAt && <div className="flex flex-wrap items-center justify-between gap-2"><dt className="text-muted-foreground">Paid</dt><dd>{formatOrderDate(payment.paidAt)}</dd></div>}
    </dl>
  )
}
