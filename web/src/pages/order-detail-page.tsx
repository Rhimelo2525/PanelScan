import { AlertCircle, ArrowLeft, CalendarDays, CheckCircle2, Hammer, Loader2, MapPin } from "lucide-react"
import { useCallback, useEffect, useState } from "react"
import { Link, useLocation, useParams, useSearchParams } from "react-router-dom"
import { toast } from "sonner"

import { cancelOrder, getOrderById } from "@/api/orders"
import { findPaymentForOrder } from "@/api/payments"
import { Container } from "@/components/layout/container"
import { useSilentPolling } from "@/hooks/use-silent-polling"
import { OrderItems } from "@/components/orders/order-items"
import { OrderDeliveryPanel } from "@/components/orders/order-delivery-panel"
import { OrderFeedbackCard } from "@/components/orders/order-feedback-card"
import { OrderStatusBadge } from "@/components/orders/order-status-badge"
import { OrderPaymentPanel } from "@/components/payments/order-payment-panel"
import { PaymentStatusBadge } from "@/components/payments/payment-status-badge"
import { StatusBadge } from "@/components/admin/status-badge"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { formatProductPrice } from "@/lib/format-price"
import { getOrderErrorMessage } from "@/orders/order-errors"
import { formatOrderDate } from "@/orders/order-format"
import { getPaymentErrorMessage } from "@/payments/payment-errors"
import { hasOpenPaymentAttempt } from "@/payments/payment-format"
import type { Order } from "@/types/order"
import type { PaymentListItem } from "@/types/payment"

interface OrderLocationState { createdOrder?: Order }

export function OrderDetailPage() {
  const { id = "" } = useParams()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const locationOrder = (location.state as OrderLocationState | null)?.createdOrder
  const initialOrder = locationOrder?.id === id ? locationOrder : null
  const [order, setOrder] = useState<Order | null>(initialOrder)
  const [isLoading, setIsLoading] = useState(!initialOrder)
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const [isCancelling, setIsCancelling] = useState(false)
  const [payment, setPayment] = useState<PaymentListItem | null>(null)
  const [isPaymentLoading, setIsPaymentLoading] = useState(true)
  const [paymentError, setPaymentError] = useState<string | null>(null)
  const [paymentRetryKey, setPaymentRetryKey] = useState(0)
  const isConfirmation = searchParams.get("created") === "1"

  useDocumentTitle(order ? `${order.orderNumber} | PanelScan` : "Order details | PanelScan")

  useEffect(() => {
    const controller = new AbortController()
    setIsLoading(true)
    setError(null)
    getOrderById(id, controller.signal).then(setOrder).catch((caughtError) => {
      if (caughtError instanceof DOMException && caughtError.name === "AbortError") return
      setError(getOrderErrorMessage(caughtError))
    }).finally(() => {
      if (!controller.signal.aborted) setIsLoading(false)
    })
    return () => controller.abort()
  }, [id, retryKey])

  // The order response carries no payment, and there is no per-order payment
  // endpoint, so the customer's own payment list is searched for this order.
  useEffect(() => {
    const controller = new AbortController()
    setIsPaymentLoading(true)
    setPaymentError(null)
    findPaymentForOrder(id, controller.signal).then(setPayment).catch((caughtError) => {
      if (caughtError instanceof DOMException && caughtError.name === "AbortError") return
      setPaymentError(getPaymentErrorMessage(caughtError))
    }).finally(() => {
      if (!controller.signal.aborted) setIsPaymentLoading(false)
    })
    return () => controller.abort()
  }, [id, paymentRetryKey])

  const reloadPayment = useCallback(() => setPaymentRetryKey((value) => value + 1), [])

  // Moderator status/approval/delivery changes on this order should show up
  // in an already-open tab without a manual refresh. Polls the order alone
  // (not payment) and only ever applies a successful response, so a
  // transient failure never blanks out what's already on screen.
  useSilentPolling(
    useCallback(() => {
      if (!id) return Promise.resolve()
      return getOrderById(id).then(setOrder).catch(() => {})
    }, [id]),
    order ? 20_000 : false,
  )

  useEffect(() => {
    if (location.hash === "#feedback" && !isLoading && order) {
      const timer = setTimeout(() => {
        const el = document.getElementById("feedback")
        if (el) {
          el.scrollIntoView({ behavior: "smooth" })
        }
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [location.hash, isLoading, order])

  async function handleCancel() {
    setIsCancelling(true)
    try {
      const updatedOrder = await cancelOrder(id)
      setOrder(updatedOrder)
      toast.success(`Order ${updatedOrder.orderNumber} was cancelled.`)
    } catch (caughtError) {
      toast.error("Order not cancelled", { description: getOrderErrorMessage(caughtError) })
    } finally {
      setIsCancelling(false)
    }
  }

  if (isLoading && !order) return <OrderDetailSkeleton />
  if (error && !order) return <Container className="py-16"><div className="rounded-lg border border-destructive/25 bg-destructive/5 p-8 text-center"><AlertCircle className="mx-auto size-7 text-destructive" aria-hidden="true" /><h1 className="mt-4 text-2xl font-semibold">Order could not be loaded</h1><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{error}</p><div className="mt-6 flex justify-center gap-3"><Button variant="outline" asChild><Link to="/orders">Back to orders</Link></Button><Button onClick={() => setRetryKey((value) => value + 1)}>Try again</Button></div></div></Container>
  if (!order) return null

  return (
    <Container className="py-10 sm:py-14 lg:py-18">
      <Button variant="ghost" asChild><Link to="/orders"><ArrowLeft data-icon="inline-start" aria-hidden="true" />Back to orders</Link></Button>
      {isConfirmation && <section className="mt-7 rounded-lg border border-emerald-700/20 bg-emerald-50/70 p-6 sm:p-8" aria-labelledby="confirmation-title"><CheckCircle2 className="size-8 text-emerald-700" aria-hidden="true" /><p className="mt-5 text-xs font-semibold tracking-[0.14em] text-emerald-800 uppercase">Order created</p><h1 id="confirmation-title" className="type-h2 mt-2">Your order has been created.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-950/70">Your order has been submitted and is currently awaiting review by our team. Once approved by a moderator, secure PayMongo payment will become available in the payment panel below.</p></section>}

      <div className="mt-8 flex flex-wrap items-start justify-between gap-6 border-b border-border pb-7">
        <div><p className="section-eyebrow">Order details</p><h1 className="type-h2 mt-3">{order.orderNumber}</h1><p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground"><CalendarDays className="size-4" aria-hidden="true" />{formatOrderDate(order.createdAt)}</p></div>
        <div className="flex flex-wrap items-center gap-3">
          <OrderStatusBadge status={order.status} />
          {!order.moderatorApproved && order.status !== "CANCELLED" && (
            <StatusBadge status="PENDING" label="Awaiting Approval" />
          )}
          {order.moderatorApproved && !payment && order.status !== "CANCELLED" && (
            <StatusBadge status="APPROVED" label="Ready for Payment" />
          )}
          {payment && <PaymentStatusBadge status={payment.status} />}
          {order.status === "PENDING" && <AlertDialog><AlertDialogTrigger asChild><Button variant="outline">Cancel order</Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Cancel this order?</AlertDialogTitle><AlertDialogDescription>PanelScan will cancel {order.orderNumber} and return its item quantities to inventory. This cannot be undone.{hasOpenPaymentAttempt(order, payment) && " A payment attempt for this order is still open. Close any PayMongo checkout page for it and do not complete payment - cancelling this order does not close that checkout page or refund a payment made after cancellation."}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Keep order</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => void handleCancel()} disabled={isCancelling}>{isCancelling && <Loader2 className="animate-spin" aria-hidden="true" />}Cancel order</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>}
        </div>
      </div>

      <div className="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14">
        <div className="space-y-10">
          <section aria-labelledby="ordered-items-title">
            <h2 id="ordered-items-title" className="text-xl font-semibold tracking-[-0.025em]">Ordered materials</h2>
            <div className="mt-5"><OrderItems items={order.items} /></div>
          </section>

          {order.status === "DELIVERED" && (
            <OrderFeedbackCard
              order={order}
              onFeedbackSubmitted={(feedback) => {
                setOrder((prev) => (prev ? { ...prev, feedback } : prev))
              }}
            />
          )}
        </div>
        <aside className="space-y-5">
          <section className="rounded-xl border border-border bg-secondary/42 p-6" aria-labelledby="order-total-title"><h2 id="order-total-title" className="text-lg font-semibold">Order total</h2><dl className="mt-5 space-y-3 text-sm"><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Subtotal</dt><dd>{formatProductPrice(order.subtotal)}</dd></div><div className="flex justify-between gap-4"><dt className="text-muted-foreground">Shipping fee</dt><dd>{formatProductPrice(order.shippingFee)}</dd></div><div className="flex items-end justify-between gap-4 border-t border-border pt-4"><dt className="font-semibold">Total</dt><dd className="text-xl font-semibold">{formatProductPrice(order.totalAmount)}</dd></div></dl></section>
          <OrderPaymentPanel order={order} payment={payment} isLoading={isPaymentLoading} error={paymentError} onRetryLoad={reloadPayment} />
          <section className="surface-card p-6" aria-labelledby="shipping-address-title"><div className="flex items-center gap-2"><MapPin className="size-4 text-primary" aria-hidden="true" /><h2 id="shipping-address-title" className="font-semibold">Shipping address</h2></div><address className="mt-4 whitespace-pre-line text-sm leading-6 text-muted-foreground not-italic">{order.shippingAddress}</address>{order.notes && <><h3 className="mt-5 text-xs font-semibold uppercase">Order notes</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{order.notes}</p></>}</section>
          {order.booking && (
            <section className="surface-card p-6" aria-labelledby="installation-details-title">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Hammer className="size-4 text-primary" aria-hidden="true" />
                  <h2 id="installation-details-title" className="font-semibold">Installation</h2>
                </div>
                <StatusBadge
                  status={order.booking.status}
                  label={order.booking.status === "PENDING" ? "Pending confirmation" : undefined}
                />
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-xs font-semibold uppercase text-muted-foreground">Service</dt>
                  <dd className="mt-1 text-sm text-foreground">Installation requested</dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-muted-foreground">Preferred date</dt>
                  <dd className="mt-1 flex items-center gap-1.5 text-sm text-foreground">
                    <CalendarDays className="size-3.5 text-primary" aria-hidden="true" />
                    {formatOrderDate(order.booking.scheduledDate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-muted-foreground">Address</dt>
                  <dd className="mt-1 whitespace-pre-line text-sm leading-6 text-muted-foreground">{order.booking.address}</dd>
                </div>
                {order.booking.notes && (
                  <div>
                    <dt className="text-xs font-semibold uppercase text-muted-foreground">Notes</dt>
                    <dd className="mt-1 whitespace-pre-line text-sm leading-6 text-muted-foreground">{order.booking.notes}</dd>
                  </div>
                )}
                {order.booking.installer && (
                  <div className="border-t border-border pt-3">
                    <dt className="text-xs font-semibold uppercase text-muted-foreground">Installer assigned</dt>
                    <dd className="mt-1 text-sm text-foreground">
                      {order.booking.installer.firstName} {order.booking.installer.lastName}
                      {order.booking.installer.specialty && ` · ${order.booking.installer.specialty}`}
                    </dd>
                  </div>
                )}
              </dl>
            </section>
          )}
          {/* Delivery coordination card */}
          <OrderDeliveryPanel
            order={order}
            onDeliveryUpdated={(delivery) => {
              setOrder((prev) => (prev ? { ...prev, delivery } : prev))
            }}
          />
        </aside>
      </div>
    </Container>
  )
}

function OrderDetailSkeleton() {
  return <Container className="py-14" aria-label="Loading order details" aria-busy="true"><Skeleton className="h-8 w-36" /><Skeleton className="mt-8 h-12 w-80 max-w-full" /><div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]"><Skeleton className="h-96 w-full" /><Skeleton className="h-96 w-full" /></div></Container>
}
