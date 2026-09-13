import { AlertCircle, CheckCircle2, HelpCircle, Loader2, XCircle } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"

import { Container } from "@/components/layout/container"
import { PaymentResultCard } from "@/components/payments/payment-result-card"
import { PaymentSummaryList } from "@/components/payments/payment-summary-list"
import { Button } from "@/components/ui/button"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { readPaymentHandoff } from "@/payments/payment-handoff"
import { canStartPayment } from "@/payments/payment-format"
import { usePaymentConfirmation } from "@/payments/use-payment-confirmation"
import { useStartPayment } from "@/payments/use-start-payment"

/**
 * Return route for PAYMENT_CANCEL_URL. Cancelling a checkout cancels the
 * payment attempt only - the order is deliberately left alone, exactly as the
 * backend leaves it, and the customer can start a new attempt.
 */
export function PaymentCancelPage() {
  useDocumentTitle("Payment cancelled | PanelScan")
  const [handoff] = useState(() => readPaymentHandoff())
  const { payment, order, phase, error, checkAgain } = usePaymentConfirmation({ paymentId: handoff?.paymentId ?? null, poll: false })
  const { startPayment, isStarting } = useStartPayment()
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (phase !== "resolving") headingRef.current?.focus()
  }, [phase])

  const orderId = payment?.orderId ?? handoff?.orderId ?? null
  const orderNumber = order?.orderNumber ?? handoff?.orderNumber ?? ""
  const canRetry = Boolean(orderId) && canStartPayment(order?.status ?? "PENDING", payment)

  const retryButton = canRetry && orderId ? <Button onClick={() => void startPayment({ id: orderId, orderNumber })} disabled={isStarting}>{isStarting ? <><Loader2 className="animate-spin" aria-hidden="true" />Opening secure checkout</> : "Retry payment"}</Button> : null
  const orderButton = orderId ? <Button variant="outline" asChild><Link to={`/orders/${orderId}`}>Return to order</Link></Button> : <Button variant="outline" asChild><Link to="/orders">View your orders</Link></Button>

  return (
    <Container className="py-10 sm:py-14 lg:py-18">
      <div className="max-w-3xl">
        {!handoff ? (
          <PaymentResultCard tone="neutral" icon={HelpCircle} eyebrow="Payment cancelled" title="Payment cancelled." description="This browser tab has no record of which payment was started, so PanelScan cannot show its status here. No order was cancelled - open your orders to continue." headingRef={headingRef}>
            <div className="mt-7 flex flex-wrap gap-3"><Button asChild><Link to="/orders">View your orders</Link></Button><Button variant="outline" asChild><Link to="/products">Continue shopping</Link></Button></div>
          </PaymentResultCard>
        ) : phase === "resolving" ? (
          <section className="rounded-lg border border-border bg-secondary/40 p-6 sm:p-9" role="status" aria-live="polite">
            <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
            <p className="mt-5 text-xs font-semibold tracking-[0.14em] uppercase text-muted-foreground">Payment cancelled</p>
            <h1 className="type-h2 mt-2">Checking your order</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">PanelScan is reading the current payment status for this order.</p>
          </section>
        ) : phase === "error" ? (
          <PaymentResultCard tone="critical" icon={AlertCircle} eyebrow="Payment cancelled" title="Payment cancelled." description={`Your order still exists and has not been paid. PanelScan could not read the payment record just now: ${error ?? "the status is unavailable."}`} headingRef={headingRef}>
            <div className="mt-7 flex flex-wrap gap-3"><Button onClick={checkAgain}>Check again</Button>{orderButton}</div>
          </PaymentResultCard>
        ) : payment?.status === "PAID" ? (
          <PaymentResultCard tone="positive" icon={CheckCircle2} eyebrow="Payment" title="This order is already paid." description="Although you returned from a cancelled checkout, PanelScan has a confirmed successful payment on record for this order. No further payment is due." headingRef={headingRef}>
            <PaymentSummaryList payment={payment} order={order} orderNumber={orderNumber} />
            <div className="mt-7 flex flex-wrap gap-3">{orderButton}<Button variant="outline" asChild><Link to="/products">Continue shopping</Link></Button></div>
          </PaymentResultCard>
        ) : (
          <PaymentResultCard tone="neutral" icon={XCircle} eyebrow="Payment cancelled" title="Payment cancelled." description="Your order still exists and has not been paid. Cancelling the checkout page does not cancel the order, and nothing has been charged." headingRef={headingRef}>
            {payment && <PaymentSummaryList payment={payment} order={order} orderNumber={orderNumber} />}
            <div className="mt-7 flex flex-wrap gap-3">{retryButton}{orderButton}</div>
            <p className="mt-5 text-xs leading-5 text-muted-foreground">Starting payment again opens a new PayMongo checkout for the same order and the same amount.</p>
          </PaymentResultCard>
        )}
      </div>
    </Container>
  )
}
