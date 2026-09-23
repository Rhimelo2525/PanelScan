import { useCallback, useRef, useState } from "react"
import { toast } from "sonner"

import { payDeliveryFeeWithGcash } from "@/api/delivery"
import { resolveCheckoutUrl } from "@/payments/checkout-url"
import { storeDeliveryFeeHandoff } from "@/payments/delivery-fee-handoff"
import { getPaymentErrorMessage } from "@/payments/payment-errors"

interface PayableDelivery {
  deliveryId: string
  orderId: string
  orderNumber: string
}

/**
 * Mirrors use-start-payment.ts for the delivery-fee GCash checkout. Same
 * synchronous double-click guard, same "hand the browser over to PayMongo,
 * same tab" behaviour.
 */
export function useStartDeliveryFeePayment() {
  const [isStarting, setIsStarting] = useState(false)
  const lockRef = useRef(false)

  const startPayment = useCallback(async (delivery: PayableDelivery) => {
    if (lockRef.current) return
    lockRef.current = true
    setIsStarting(true)

    try {
      const result = await payDeliveryFeeWithGcash(delivery.orderId)
      const checkoutUrl = resolveCheckoutUrl(result.checkoutUrl)

      if (!checkoutUrl) {
        toast.error("Delivery fee payment could not be started", {
          description: "PanelScan did not receive a valid PayMongo checkout address for the delivery fee.",
        })
        lockRef.current = false
        setIsStarting(false)
        return
      }

      storeDeliveryFeeHandoff({
        deliveryId: delivery.deliveryId,
        orderId: delivery.orderId,
        orderNumber: delivery.orderNumber,
        startedAt: Date.now(),
      })

      window.location.assign(checkoutUrl)
    } catch (caughtError) {
      toast.error("Delivery fee payment could not be started", { description: getPaymentErrorMessage(caughtError) })
      lockRef.current = false
      setIsStarting(false)
    }
  }, [])

  return { startPayment, isStarting }
}
