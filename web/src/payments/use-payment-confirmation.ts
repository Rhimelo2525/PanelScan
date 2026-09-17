import { useCallback, useEffect, useState } from "react"

import { getOrderById } from "@/api/orders"
import { getPaymentById } from "@/api/payments"
import { getPaymentErrorMessage } from "@/payments/payment-errors"
import { isPaymentSettled } from "@/payments/payment-format"
import type { Order } from "@/types/order"
import type { Payment } from "@/types/payment"

/**
 * PayMongo confirms a payment to the backend by webhook, which can land after
 * the customer's browser is already back on PanelScan, so a PENDING payment is
 * re-read on a bounded schedule. It never resolves to "failed" on timeout - a
 * late webhook is not a failed payment.
 */
const POLL_INTERVAL_MS = 3000
const MAX_WAIT_MS = 30000

export type ConfirmationPhase = "resolving" | "settled" | "timedOut" | "error"

interface Options {
  paymentId: string | null
  /** Success returns wait for the webhook; cancel returns just read current state. */
  poll: boolean
}

export function usePaymentConfirmation({ paymentId, poll }: Options) {
  const [payment, setPayment] = useState<Payment | null>(null)
  const [order, setOrder] = useState<Order | null>(null)
  const [phase, setPhase] = useState<ConfirmationPhase>(paymentId ? "resolving" : "settled")
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!paymentId) return

    const controller = new AbortController()
    const deadline = Date.now() + MAX_WAIT_MS
    let timeoutId = 0

    setPhase("resolving")
    setError(null)

    const read = async () => {
      try {
        const result = await getPaymentById(paymentId, controller.signal)
        if (controller.signal.aborted) return
        setPayment(result)

        if (!poll || isPaymentSettled(result)) {
          setPhase("settled")
          return
        }
        if (Date.now() + POLL_INTERVAL_MS >= deadline) {
          setPhase("timedOut")
          return
        }
        timeoutId = window.setTimeout(() => void read(), POLL_INTERVAL_MS)
      } catch (caughtError) {
        if (controller.signal.aborted) return
        if (caughtError instanceof DOMException && caughtError.name === "AbortError") return
        setError(getPaymentErrorMessage(caughtError))
        setPhase("error")
      }
    }

    void read()

    return () => {
      controller.abort()
      window.clearTimeout(timeoutId)
    }
  }, [paymentId, poll, attempt])

  // The payment record carries only an order id, so the order itself is read
  // separately for its number and its own (separate) fulfilment status. A
  // confirmed payment also advances the order, so the order is re-read whenever
  // the payment status changes rather than only once.
  const orderId = payment?.orderId ?? null
  const paymentStatus = payment?.status ?? null
  useEffect(() => {
    if (!orderId) return
    const controller = new AbortController()
    getOrderById(orderId, controller.signal)
      .then(setOrder)
      .catch(() => {
        // Supplementary detail only - the payment result stands without it.
      })
    return () => controller.abort()
  }, [orderId, paymentStatus])

  const checkAgain = useCallback(() => setAttempt((value) => value + 1), [])

  return { payment, order, phase, error, checkAgain }
}
