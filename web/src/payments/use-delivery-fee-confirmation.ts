import { useCallback, useEffect, useState } from "react"

import { getDeliveryById } from "@/api/delivery"
import { getPaymentErrorMessage } from "@/payments/payment-errors"
import type { DeliveryRecord } from "@/types/delivery"

/**
 * Mirrors use-payment-confirmation.ts for the delivery-fee GCash checkout:
 * PayMongo confirms by webhook, which can land after the browser is already
 * back on PanelScan, so a PENDING fee is re-read on a bounded schedule. It
 * never resolves to "failed" on timeout - a late webhook is not a failed
 * payment. Polls the Delivery record itself (there is no standalone
 * "get delivery payment by id" endpoint - deliveryPayment comes attached,
 * see delivery.types.ts#deliveryInclude).
 */
const POLL_INTERVAL_MS = 3000
const MAX_WAIT_MS = 30000

export type DeliveryFeeConfirmationPhase = "resolving" | "settled" | "timedOut" | "error"

interface Options {
  deliveryId: string | null
  /** Success returns wait for the webhook; cancel returns just read current state. */
  poll: boolean
}

export function useDeliveryFeeConfirmation({ deliveryId, poll }: Options) {
  const [delivery, setDelivery] = useState<DeliveryRecord | null>(null)
  const [phase, setPhase] = useState<DeliveryFeeConfirmationPhase>(deliveryId ? "resolving" : "settled")
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!deliveryId) return

    const controller = new AbortController()
    const deadline = Date.now() + MAX_WAIT_MS
    let timeoutId = 0

    setPhase("resolving")
    setError(null)

    const read = async () => {
      try {
        const result = await getDeliveryById(deliveryId, controller.signal)
        if (controller.signal.aborted) return
        setDelivery(result.delivery)

        const feeStatus = result.delivery.deliveryPayment?.status ?? null
        if (!poll || feeStatus !== "PENDING") {
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
  }, [deliveryId, poll, attempt])

  const checkAgain = useCallback(() => setAttempt((value) => value + 1), [])

  return { delivery, phase, error, checkAgain }
}
