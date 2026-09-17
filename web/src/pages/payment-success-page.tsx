import { AlertCircle, ArrowRight, CheckCircle2, Clock3, HelpCircle, Loader2, RotateCcw, XCircle } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"

import { Container } from "@/components/layout/container"
import { PaymentResultCard } from "@/components/payments/payment-result-card"
import { PaymentSummaryList } from "@/components/payments/payment-summary-list"
import { Button } from "@/components/ui/button"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { readPaymentHandoff } from "@/payments/payment-handoff"
import { usePaymentConfirmation } from "@/payments/use-payment-confirmation"
import { useStartPayment } from "@/payments/use-start-payment"

/**
 * Return route for PAYMENT_SUCCESS_URL. Landing here proves only that PayMongo
 * redirected the browser back - it is never treated as proof of payment. The
 * page identifies the payment from the handoff this tab recorded before
 * leaving, then renders strictly what the backend reports for it.
 */
export function PaymentSuccessPage() {
  useDocumentTitle("Payment result | PanelScan")
  const [handoff] = useState(() => readPaymentHandoff())
  const { payment, order, phase, error, checkAgain } = usePaymentConfirmation({ paymentId: handoff?.paymentId ?? null, poll: true })
  const { startPayment, isStarting } = useStartPayment()
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (phase !== "resolving") headingRef.current?.focus()
  }, [phase])

  const orderId = payment?.orderId ?? handoff?.orderId ?? null
  const orderNumber = order?.orderNumber ?? handoff?.orderNumber ?? ""
  const canRetry = payment?.status === "FAILED" && order?.status !== "CANCELLED"

  const viewOrderButton = orderId ? <Button variant="outline" asChild><Link to={`/orders/${orderId}`}>View order</Link></Button> : <Button variant="outline" asChild><Link to="/orders">View your orders</Link></Button>

  return (
    <Container className="py-10 sm:py-14 lg:py-18">
      <div className="max-w-3xl">
        {!handoff ? (
          <PaymentResultCard tone="neutral" icon={HelpCircle} eyebrow="Payment" title="We couldn't identify this payment." description="This browser tab has no record of a payment started from PanelScan. Open the order to see its current payment status - your order and any payment against it are unaffected by this page." headingRef={headingRef}>
            <div className="mt-7 flex flex-wrap gap-3"><Button asChild><Link to="/orders">View your orders</Link></Button><Button variant="outline" asChild><Link to="/products">Continue shopping</Link></Button></div>
          </PaymentResultCard>
        ) : phase === "resolving" ? (
          <section className="rounded-lg border border-border bg-secondary/40 p-6 sm:p-9" role="status" aria-live="polite">
            <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
            <p className="mt-5 text-xs font-semibold tracking-[0.14em] uppercase text-muted-foreground">Payment</p>
            <h1 className="type-h2 mt-2">Confirming your payment</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">This usually takes only a few moments. PanelScan is waiting for the payment provider to confirm the result before showing it here.</p>
          </section>
        ) : phase === "error" ? (
          <PaymentResultCard tone="critical" icon={AlertCircle} eyebrow="Payment" title="Payment status could not be loaded." description={error ?? "PanelScan could not read this payment's status. Your order and any payment against it are unchanged."} headingRef={headingRef}>
            <div className="mt-7 flex flex-wrap gap-3"><Button onClick={checkAgain}>Check again</Button>{viewOrderButton}</div>
          </PaymentResultCard>
        ) : payment?.status === "PAID" ? (
          <PaymentResultCard tone="positive" icon={CheckCircle2} eyebrow="Payment confirmed" title="Your payment is confirmed." description="PanelScan received a confirmed successful payment from the payment provider for this order." headingRef={headingRef}>
            <PaymentSummaryList payment={payment} order={order} orderNumber={orderNumber} />
            <div className="mt-7 flex flex-wrap gap-3">{orderId && <Button asChild><Link to={`/orders/${orderId}`}>View order<ArrowRight data-icon="inline-end" aria-hidden="true" /></Link></Button>}<Button variant="outline" asChild><Link to="/products">Continue shopping</Link></Button></div>
          </PaymentResultCard>
        ) : payment?.status === "FAILED" ? (
          <PaymentResultCard tone="critical" icon={XCircle} eyebrow="Payment" title="This payment did not go through." description="The payment provider reported that the payment failed. Your order still exists and has not been paid." headingRef={headingRef}>
            <PaymentSummaryList payment={payment} order={order} orderNumber={orderNumber} />
            <div className="mt-7 flex flex-wrap gap-3">{canRetry && orderId && <Button onClick={() => void startPayment({ id: orderId, orderNumber })} disabled={isStarting}>{isStarting ? <><Loader2 className="animate-spin" aria-hidden="true" />Opening secure checkout</> : "Try payment again"}</Button>}{viewOrderButton}</div>
          </PaymentResultCard>
        ) : payment?.status === "REFUNDED" ? (
          <PaymentResultCard tone="neutral" icon={RotateCcw} eyebrow="Payment" title="This payment is recorded as refunded." description="PanelScan's record for this payment is refunded, so no further payment is due on it." headingRef={headingRef}>
            <PaymentSummaryList payment={payment} order={order} orderNumber={orderNumber} />
            <div className="mt-7 flex flex-wrap gap-3">{viewOrderButton}<Button variant="outline" asChild><Link to="/products">Continue shopping</Link></Button></div>
          </PaymentResultCard>
        ) : (
          <PaymentResultCard tone="neutral" icon={Clock3} eyebrow="Payment" title="We're still waiting for confirmation." description="The payment provider has not confirmed a result to PanelScan yet. This can simply be a delay - your payment has not been marked as failed." headingRef={headingRef}>
            {payment && <PaymentSummaryList payment={payment} order={order} orderNumber={orderNumber} />}
            <div className="mt-7 flex flex-wrap gap-3"><Button onClick={checkAgain}>Check again</Button>{viewOrderButton}</div>
          </PaymentResultCard>
        )}
      </div>
    </Container>
  )
}
