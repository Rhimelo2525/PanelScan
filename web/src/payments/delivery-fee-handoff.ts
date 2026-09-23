/**
 * Same pattern as payment-handoff.ts, for the separate delivery-fee GCash
 * checkout (see delivery.service.ts's createFeeGcashCheckout /
 * DELIVERY_PAYMENT_SUCCESS_URL). A different sessionStorage key so a
 * product-payment handoff and a delivery-fee handoff never collide if a
 * customer somehow has both in flight in the same tab.
 *
 * An identifier hint only, never evidence of payment: the return pages still
 * ask the backend for the authoritative status via GET /api/delivery/:id.
 */
const STORAGE_KEY = "panelscan.delivery-fee-handoff"
const MAX_AGE_MS = 6 * 60 * 60 * 1000

export interface DeliveryFeeHandoff {
  deliveryId: string
  orderId: string
  orderNumber: string
  startedAt: number
}

export function storeDeliveryFeeHandoff(handoff: DeliveryFeeHandoff) {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(handoff))
}

export function readDeliveryFeeHandoff(): DeliveryFeeHandoff | null {
  const stored = window.sessionStorage.getItem(STORAGE_KEY)
  if (!stored) return null

  try {
    const parsed = JSON.parse(stored) as Partial<DeliveryFeeHandoff>
    const isComplete =
      typeof parsed.deliveryId === "string" && parsed.deliveryId.length > 0 &&
      typeof parsed.orderId === "string" && parsed.orderId.length > 0 &&
      typeof parsed.orderNumber === "string" &&
      typeof parsed.startedAt === "number"

    if (!isComplete) {
      clearDeliveryFeeHandoff()
      return null
    }

    if (Date.now() - (parsed.startedAt as number) > MAX_AGE_MS) {
      clearDeliveryFeeHandoff()
      return null
    }

    return parsed as DeliveryFeeHandoff
  } catch {
    clearDeliveryFeeHandoff()
    return null
  }
}

export function clearDeliveryFeeHandoff() {
  window.sessionStorage.removeItem(STORAGE_KEY)
}
