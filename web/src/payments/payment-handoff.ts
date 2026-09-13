/**
 * PayMongo's success/cancel URLs are fixed backend configuration - they carry no
 * order or payment identifier - so the website records which payment it is
 * waiting on before it leaves for the hosted checkout page, and reads it back
 * when the customer returns to the same tab.
 *
 * This is an identifier hint only, never evidence of payment: the return pages
 * still ask the backend for the authoritative status, and the backend still
 * enforces ownership, so a tampered id simply resolves to a 404.
 */
const STORAGE_KEY = "panelscan.payment-handoff"
const MAX_AGE_MS = 6 * 60 * 60 * 1000

export interface PaymentHandoff {
  paymentId: string
  orderId: string
  orderNumber: string
  startedAt: number
}

export function storePaymentHandoff(handoff: PaymentHandoff) {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(handoff))
}

export function readPaymentHandoff(): PaymentHandoff | null {
  const stored = window.sessionStorage.getItem(STORAGE_KEY)
  if (!stored) return null

  try {
    const parsed = JSON.parse(stored) as Partial<PaymentHandoff>
    const isComplete =
      typeof parsed.paymentId === "string" && parsed.paymentId.length > 0 &&
      typeof parsed.orderId === "string" && parsed.orderId.length > 0 &&
      typeof parsed.orderNumber === "string" &&
      typeof parsed.startedAt === "number"

    if (!isComplete) {
      clearPaymentHandoff()
      return null
    }

    if (Date.now() - (parsed.startedAt as number) > MAX_AGE_MS) {
      clearPaymentHandoff()
      return null
    }

    return parsed as PaymentHandoff
  } catch {
    clearPaymentHandoff()
    return null
  }
}

export function clearPaymentHandoff() {
  window.sessionStorage.removeItem(STORAGE_KEY)
}
