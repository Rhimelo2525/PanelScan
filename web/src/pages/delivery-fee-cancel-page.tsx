import { AlertCircle, CheckCircle2, HelpCircle, Loader2, XCircle } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { Link } from "react-router-dom"

import { Container } from "@/components/layout/container"
import { DeliveryFeeSummaryList } from "@/components/payments/delivery-fee-summary-list"
import { PaymentResultCard } from "@/components/payments/payment-result-card"
import { Button } from "@/components/ui/button"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { readDeliveryFeeHandoff } from "@/payments/delivery-fee-handoff"
import { useDeliveryFeeConfirmation } from "@/payments/use-delivery-fee-confirmation"
import type { OrderStatus } from "@/types/order"

/**
 * Return route for DELIVERY_PAYMENT_CANCEL_URL. Cancelling a checkout
 * cancels the fee-payment attempt only - the delivery request and its
 * quotation are left exactly as the backend leaves them, and the customer
 * can go back to the order and choose GCash again or switch to Cash.
 */
export function DeliveryFeeCancelPage() {
  useDocumentTitle("Delivery fee payment cancelled | PanelScan")
  const [handoff] = useState(() => readDeliveryFeeHandoff())
  const { delivery, phase, error, checkAgain } = useDeliveryFeeConfirmation({ deliveryId: handoff?.deliveryId ?? null, poll: false })
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (phase !== "resolving") headingRef.current?.focus()
  }, [phase])

  const orderId = delivery?.orderId ?? handoff?.orderId ?? null
  const orderNumber = delivery?.order?.orderNumber ?? handoff?.orderNumber ?? ""
  const feePayment = delivery?.deliveryPayment ?? null
  const orderSummary = delivery?.order ? { orderNumber: delivery.order.orderNumber, status: delivery.order.status as OrderStatus } : null

  const orderButton = orderId ? <Button variant="outline" asChild><Link to={`/orders/${orderId}`}>Return to order</Link></Button> : <Button variant="outline" asChild><Link to="/orders">View your orders</Link></Button>

  return (
    <Container className="py-10 sm:py-14 lg:py-18">
      <div className="max-w-3xl">
        {!handoff ? (
          <PaymentResultCard tone="neutral" icon={HelpCircle} eyebrow="Delivery fee cancelled" title="Delivery fee payment cancelled." description="This browser tab has no record of which delivery fee payment was started, so PanelScan cannot show its status here. Nothing was booked - open your order to continue." headingRef={headingRef}>
            <div className="mt-7 flex flex-wrap gap-3"><Button asChild><Link to="/orders">View your orders</Link></Button></div>
          </PaymentResultCard>
        ) : phase === "resolving" ? (
          <section className="rounded-lg border border-border bg-secondary/40 p-6 sm:p-9" role="status" aria-live="polite">
            <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
            <p className="mt-5 text-xs font-semibold tracking-[0.14em] uppercase text-muted-foreground">Delivery fee cancelled</p>
            <h1 className="type-h2 mt-2">Checking your delivery fee status</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">PanelScan is reading the current delivery fee status for this order.</p>
          </section>
        ) : phase === "error" ? (
          <PaymentResultCard tone="critical" icon={AlertCircle} eyebrow="Delivery fee cancelled" title="Delivery fee payment cancelled." description={`Nothing has been booked. PanelScan could not read the delivery fee status just now: ${error ?? "the status is unavailable."}`} headingRef={headingRef}>
            <div className="mt-7 flex flex-wrap gap-3"><Button onClick={checkAgain}>Check again</Button>{orderButton}</div>
          </PaymentResultCard>
        ) : feePayment?.status === "PAID" ? (
          <PaymentResultCard tone="positive" icon={CheckCircle2} eyebrow="Delivery fee" title="This delivery fee is already paid." description="Although you returned from a cancelled checkout, PanelScan has a confirmed successful payment on record for this delivery fee. Return to your order to book the vehicle." headingRef={headingRef}>
            <DeliveryFeeSummaryList feePayment={feePayment} order={orderSummary} orderNumber={orderNumber} />
            <div className="mt-7 flex flex-wrap gap-3">{orderButton}</div>
          </PaymentResultCard>
        ) : (
          <PaymentResultCard tone="neutral" icon={XCircle} eyebrow="Delivery fee cancelled" title="Delivery fee payment cancelled." description="Nothing has been booked and nothing was charged. Return to your order to try GCash again, or choose Cash on Delivery instead." headingRef={headingRef}>
            {feePayment && <DeliveryFeeSummaryList feePayment={feePayment} order={orderSummary} orderNumber={orderNumber} />}
            <div className="mt-7 flex flex-wrap gap-3">{orderButton}</div>
          </PaymentResultCard>
        )}
      </div>
    </Container>
  )
}
