import { AlertCircle, CreditCard, Loader2, ShieldCheck } from "lucide-react"

import { StatusBadge } from "@/components/admin/status-badge"
import { PaymentStatusBadge } from "@/components/payments/payment-status-badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { formatProductPrice } from "@/lib/format-price"
import { formatOrderDate } from "@/orders/order-format"
import { getOrderStage } from "@/orders/order-workflow"
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

/**
 * The customer pays products + shipping fee together, in ONE GCash payment
 * through PayMongo - and only once PanelScan has quoted the shipping fee, so
 * the amount shown is always the real total. The amount itself is computed
 * by the backend from the order; the browser only names the order.
 */
export function OrderPaymentPanel({ order, payment, isLoading, error, onRetryLoad }: OrderPaymentPanelProps) {
  const { startPayment, isStarting } = useStartPayment()
  const stage = getOrderStage(order, payment)
  const isPayable = !isLoading && !error && stage === "awaiting_payment"

  return (
    <section className="surface-card p-6" aria-labelledby="payment-title">
      <div className="flex items-center gap-2"><CreditCard className="size-4 text-primary" aria-hidden="true" /><h2 id="payment-title" className="font-semibold">Payment</h2></div>

      {isLoading ? (
        <div className="mt-4 space-y-3" aria-label="Loading payment status" aria-busy="true"><Skeleton className="h-6 w-40" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-3/4" /></div>
      ) : error ? (
        <div className="mt-4"><p className="flex items-start gap-2 text-sm leading-6 text-muted-foreground"><AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />{error}</p><Button variant="outline" size="sm" className="mt-4" onClick={onRetryLoad}>Check payment status</Button></div>
      ) : stage === "awaiting_approval" ? (
        <>
          <div className="mt-4"><StatusBadge status="PENDING" label="Awaiting Approval" /></div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Your order is being reviewed. Once it is approved, we will calculate your delivery fee and payment will become available.</p>
        </>
      ) : stage === "awaiting_quote" ? (
        <>
          <div className="mt-4"><StatusBadge status="PENDING" label="Awaiting Shipping Fee" /></div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Your order has been approved. We are calculating your delivery fee. Payment will be available once the estimated shipping fee is ready.</p>
        </>
      ) : stage === "paid" && payment ? (
        <>
          <div className="mt-4"><PaymentStatusBadge status={payment.status} /></div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {payment.status === "REFUNDED" ? "This payment is recorded as refunded." : "Payment successful. Your delivery is being prepared."}
          </p>
          <dl className="mt-5 space-y-3 border-t border-border pt-4 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Amount paid</dt><dd className="font-medium tabular-nums">{formatProductPrice(payment.amount)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Method</dt><dd>GCash via PayMongo</dd></div>
            {payment.paidAt && <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Paid</dt><dd>{formatOrderDate(payment.paidAt)}</dd></div>}
          </dl>
        </>
      ) : stage === "awaiting_payment" ? (
        <>
          <div className="mt-4">{payment?.status === "FAILED" ? <PaymentStatusBadge status="FAILED" /> : <StatusBadge status="PENDING" label="Awaiting Payment" />}</div>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {payment?.status === "FAILED"
              ? "Your last payment did not go through. You can try again below."
              : "Your delivery fee is ready. Pay your products and shipping together in one GCash payment."}
          </p>
          <dl className="mt-5 space-y-3 border-t border-border pt-4 text-sm">
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Products</dt><dd className="tabular-nums">{formatProductPrice(order.subtotal)}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted-foreground">Estimated shipping fee</dt><dd className="tabular-nums">{formatProductPrice(order.shippingFee)}</dd></div>
            <div className="flex justify-between gap-4 border-t border-border pt-3"><dt className="font-semibold">Total amount due</dt><dd className="font-semibold tabular-nums">{formatProductPrice(order.totalAmount)}</dd></div>
          </dl>
          {payment?.status === "PENDING" && (
            <p className="mt-4 text-xs leading-5 text-muted-foreground">A payment was started for this order but has not been confirmed yet. If you already completed it in GCash, this page updates once PayMongo confirms it.</p>
          )}
        </>
      ) : null}

      {isPayable && (
        <div className="mt-6 border-t border-border pt-5">
          <Button className="w-full" onClick={() => void startPayment(order)} disabled={isStarting}>
            {isStarting ? <><Loader2 className="animate-spin" aria-hidden="true" />Opening secure checkout</> : <>Pay {formatProductPrice(order.totalAmount)} with GCash</>}
          </Button>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">One payment covers your order and the delivery fee.</p>
          <p className="mt-2 flex items-start gap-2 text-xs leading-5 text-muted-foreground"><ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />You will leave PanelScan for PayMongo's secure GCash checkout. PanelScan never receives your wallet details.</p>
        </div>
      )}

      {!isLoading && !error && stage === "cancelled" && <p className="mt-5 border-t border-border pt-5 text-sm leading-6 text-muted-foreground">This order is cancelled, so it can no longer be paid.</p>}
    </section>
  )
}
