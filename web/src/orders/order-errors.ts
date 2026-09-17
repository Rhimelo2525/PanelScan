import { ApiRequestError } from "@/api/client"

export function getOrderErrorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError)) return "The order request could not be completed. Please try again."
  if (error.status === 0 || error.status === 503) return "Order services are unavailable right now. Check your connection and try again."
  if (error.status === 401) return "Your session ended. Please log in again."
  if (error.status === 403) return "Orders are available to customer accounts only."
  if (error.status === 400 || error.status === 404 || error.status === 409) return error.message
  return "The order request could not be completed. Please try again."
}
