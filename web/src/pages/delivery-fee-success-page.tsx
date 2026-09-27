import { AlertCircle, ArrowRight, CheckCircle2, Clock3, HelpCircle, Loader2, XCircle } from "lucide-react"
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
 * Return route for DELIVERY_PAYMENT_SUCCESS_URL. Landing here proves only
 * that PayMongo redirected the browser back - never treated as proof of
 * payment (see delivery.service.ts#handleDeliveryFeeWebhook). The Lalamove
 * booking itself was already placed by PanelScan staff before the fee could
 * be paid, so there is nothing left for the customer to book here.
 */
export function DeliveryFeeSuccessPage() {
  useDocumentTitle("Delivery fee payment result | PanelScan")
  const [handoff] = useState(() => readDeliveryFeeHandoff())
  const { delivery, phase, error, checkAgain } = useDeliveryFeeConfirmation({ deliveryId: handoff?.deliveryId ?? null, poll: true })
  const headingRef = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (phase !== "resolving") headingRef.current?.focus()
  }, [phase])

  const orderId = delivery?.orderId ?? handoff?.orderId ?? null
  const orderNumber = delivery?.order?.orderNumber ?? handoff?.orderNumber ?? ""
  const feePayment = delivery?.deliveryPayment ?? null

  const orderButton = orderId ? <Button variant="outline" asChild><Link to={`/orders/${orderId}`}>View order</Link></Button> : <Button variant="outline" asChild><Link to="/orders">View your orders</Link></Button>
  const orderSummary = delivery?.order ? { orderNumber: delivery.order.orderNumber, status: delivery.order.status as OrderStatus } : null

  return (
    <Container className="py-10 sm:py-14 lg:py-18">
      <div className="max-w-3xl">
        {!handoff ? (
          <PaymentResultCard tone="neutral" icon={HelpCircle} eyebrow="Delivery fee" title="We couldn't identify this delivery fee payment." description="This browser tab has no record of a delivery fee payment started from PanelScan. Open the order to see its current delivery status - nothing here is affected by this page." headingRef={headingRef}>
            <div className="mt-7 flex flex-wrap gap-3"><Button asChild><Link to="/orders">View your orders</Link></Button></div>
          </PaymentResultCard>
        ) : phase === "resolving" ? (
          <section className="rounded-lg border border-border bg-secondary/40 p-6 sm:p-9" role="status" aria-live="polite">
            <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
            <p className="mt-5 text-xs font-semibold tracking-[0.14em] uppercase text-muted-foreground">Delivery fee</p>
            <h1 className="type-h2 mt-2">Confirming your delivery fee payment</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">This usually takes only a few moments. PanelScan is waiting for the payment provider to confirm the result before showing it here.</p>
          </section>
        ) : phase === "error" ? (
          <PaymentResultCard tone="critical" icon={AlertCircle} eyebrow="Delivery fee" title="Delivery fee status could not be loaded." description={error ?? "PanelScan could not read this delivery fee's status."} headingRef={headingRef}>
            <div className="mt-7 flex flex-wrap gap-3"><Button onClick={checkAgain}>Check again</Button>{orderButton}</div>
          </PaymentResultCard>
        ) : feePayment?.status === "PAID" ? (
          <PaymentResultCard tone="positive" icon={CheckCircle2} eyebrow="Delivery fee confirmed" title="Your delivery fee is paid." description="PanelScan received a confirmed successful GCash payment for the delivery fee. You can follow your delivery from the order page." headingRef={headingRef}>
            <DeliveryFeeSummaryList feePayment={feePayment} order={orderSummary} orderNumber={orderNumber} />
            <div className="mt-7 flex flex-wrap gap-3">{orderId ? <Button asChild><Link to={`/orders/${orderId}`}>Track delivery<ArrowRight data-icon="inline-end" aria-hidden="true" /></Link></Button> : orderButton}</div>
          </PaymentResultCard>
        ) : feePayment?.status === "FAILED" ? (
          <PaymentResultCard tone="critical" icon={XCircle} eyebrow="Delivery fee" title="This delivery fee payment did not go through." description="The payment provider reported that the payment failed. You can go back to your order and try GCash again, or pay the fee in cash on delivery instead." headingRef={headingRef}>
            {feePayment && <DeliveryFeeSummaryList feePayment={feePayment} order={null} orderNumber={orderNumber} />}
            <div className="mt-7 flex flex-wrap gap-3">{orderButton}</div>
          </PaymentResultCard>
        ) : (
          <PaymentResultCard tone="neutral" icon={Clock3} eyebrow="Delivery fee" title="We're still waiting for confirmation." description="The payment provider has not confirmed a result to PanelScan yet. This can simply be a delay - your payment has not been marked as failed." headingRef={headingRef}>
            {feePayment && <DeliveryFeeSummaryList feePayment={feePayment} order={null} orderNumber={orderNumber} />}
            <div className="mt-7 flex flex-wrap gap-3"><Button onClick={checkAgain}>Check again</Button>{orderButton}</div>
          </PaymentResultCard>
        )}
      </div>
    </Container>
  )
}
