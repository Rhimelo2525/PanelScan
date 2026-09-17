import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"

import { createPayment } from "@/api/payments"
import { resolveCheckoutUrl } from "@/payments/checkout-url"
import { getPaymentErrorMessage } from "@/payments/payment-errors"
import { storePaymentHandoff } from "@/payments/payment-handoff"

interface PayableOrder {
  id: string
  orderNumber: string
}

/**
 * Starts a hosted PayMongo checkout for an order and hands the browser over to
 * it. The synchronous ref lock closes the gap between a click and the disabled
 * state React renders a tick later, so a double click cannot fire two
 * create-payment requests. It is a usability guard, not a security boundary -
 * duplicate protection has to exist on the backend.
 */
export function useStartPayment() {
  const [isStarting, setIsStarting] = useState(false)
  const lockRef = useRef(false)

  const startPayment = useCallback(async (order: PayableOrder) => {
    if (lockRef.current) return
    lockRef.current = true
    setIsStarting(true)

    try {
      const result = await createPayment(order.id)
      const checkoutUrl = resolveCheckoutUrl(result.checkoutUrl)

      if (!checkoutUrl) {
        toast.error("Payment could not be started", {
          description: "PanelScan did not receive a valid PayMongo checkout address for this order.",
        })
        lockRef.current = false
        setIsStarting(false)
        return
      }

      storePaymentHandoff({
        paymentId: result.paymentId,
        orderId: order.id,
        orderNumber: order.orderNumber,
        startedAt: Date.now(),
      })

      // Same tab on purpose: a popup would break the return trip back into this
      // session, and the tab-scoped auth tokens survive the round trip.
      window.location.assign(checkoutUrl)
    } catch (caughtError) {
      toast.error("Payment could not be started", { description: getPaymentErrorMessage(caughtError) })
      lockRef.current = false
      setIsStarting(false)
    }
  }, [])

  return { startPayment, isStarting }
}
