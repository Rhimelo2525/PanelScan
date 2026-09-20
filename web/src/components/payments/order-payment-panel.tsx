import { AlertCircle, ArrowRight, CreditCard, Loader2, ShieldCheck } from "lucide-react"

import { StatusBadge } from "@/components/admin/status-badge"
import { PaymentStatusBadge } from "@/components/payments/payment-status-badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { formatProductPrice } from "@/lib/format-price"
import { formatOrderDate } from "@/orders/order-format"
import { canStartPayment, describePaymentStatus, paymentActionLabel } from "@/payments/payment-format"
import { useStartPayment } from "@/payments/use-start-payment"
import type { Order } from "@/types/order"
import type { Payment } from "@/types/payment"

interface OrderPaymentPanelProps {
  order: Order
  payment: Payment | null
  isLoading: boolean
  error: string | null
  onRetryLoad: () => void
}

export function OrderPaymentPanel({ order, payment, isLoading, error, onRetryLoad }: OrderPaymentPanelProps) {
  const { startPayment, isStarting } = useStartPayment()
  const isApproved = Boolean(order.moderatorApproved)
  const isPayable = !isLoading && !error && isApproved && canStartPayment(order.status, payment, isApproved)

  return (
    <section className="surface-card p-6" aria-labelledby="payment-title">
      <div className="flex items-center gap-2"><CreditCard className="size-4 text-primary" aria-hidden="true" /><h2 id="payment-title" className="font-semibold">Payment</h2></div>

      {isLoading ? (
        <div className="mt-4 space-y-3" aria-label="Loading payment status" aria-busy="true"><Skeleton className="h-6 w-40" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></div>
      ) : error ? (
        <div className="mt-4"><p className="flex items-start gap-2 text-sm leading-6 text-muted-foreground"><AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />{error}</p><Button variant="outline" size="sm" className="mt-4" onClick={onRetryLoad}>Check payment status</Button></div>
      ) : !isApproved && order.status !== "CANCELLED" ? (
        <>
          <div className="mt-4"><StatusBadge status="PENDING" label="Awaiting Approval" /></div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Your order is currently being reviewed. Payment will become available once your order has been approved.
          </p>
          <dl className="mt-5 space-y-3 border-t border-border pt-4 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Amount due</dt><dd className="font-medium tabular-nums">{formatProductPrice(order.totalAmount)}</dd></div>
          </dl>
        </>
      ) : payment ? (
        <>
          <div className="mt-4"><PaymentStatusBadge status={payment.status} /></div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{describePaymentStatus(payment.status)}</p>
          <dl className="mt-5 space-y-3 border-t border-border pt-4 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Amount</dt><dd className="font-medium tabular-nums">{formatProductPrice(payment.amount)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Method</dt><dd>{payment.method}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Started</dt><dd>{formatOrderDate(payment.createdAt)}</dd></div>
            {payment.paidAt && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Paid</dt><dd>{formatOrderDate(payment.paidAt)}</dd></div>}
          </dl>
        </>
      ) : (
        <>
          <div className="mt-4"><StatusBadge status="APPROVED" label="Ready for Payment" /></div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Your order has been approved. You can now proceed to payment.</p>
          <dl className="mt-5 space-y-3 border-t border-border pt-4 text-sm"><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Amount due</dt><dd className="font-medium tabular-nums">{formatProductPrice(order.totalAmount)}</dd></div></dl>
        </>
      )}

      {isPayable && (
        <div className="mt-6 border-t border-border pt-5">
          <Button className="w-full" onClick={() => void startPayment(order)} disabled={isStarting}>
            {isStarting ? <><Loader2 className="animate-spin" aria-hidden="true" />Opening secure checkout</> : <>{paymentActionLabel(payment)}<ArrowRight data-icon="inline-end" aria-hidden="true" /></>}
          </Button>
          <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />You will leave PanelScan for PayMongo's secure hosted checkout, which shows the available payment methods. PanelScan never receives your card or wallet details.</p>
        </div>
      )}

      {!isLoading && !error && order.status === "CANCELLED" && <p className="mt-5 border-t border-border pt-5 text-sm leading-6 text-muted-foreground">This order is cancelled, so it can no longer be paid.</p>}
    </section>
  )
}
