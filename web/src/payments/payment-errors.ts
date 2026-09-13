import { ApiRequestError } from "@/api/client"

/**
 * Backend 400/403/404 payment messages are written for customers ("This order
 * has already been paid.") so they are surfaced as-is. 5xx messages can carry
 * provider or configuration detail, so those are replaced with a generic line.
 */
export function getPaymentErrorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError)) return "The payment request could not be completed. Please try again."
  if (error.status === 0 || error.status === 503) return "Payment services are unavailable right now. Check your connection and try again."
  if (error.status === 401) return "Your session ended. Please log in again and reopen the order."
  if (error.status === 429) return "Too many payment requests were made. Please wait a moment and try again."
  if (error.status === 400 || error.status === 403 || error.status === 404) return error.message
  return "Payment could not be started right now. Please try again in a moment."
}
