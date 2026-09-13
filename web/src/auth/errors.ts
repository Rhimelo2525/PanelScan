import { ApiRequestError } from "@/api/client"

export function getLoginErrorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError)) return "We couldn't sign you in. Please try again."
  if (error.status === 401) return "The email or password you entered is incorrect."
  if (error.status === 403) return "This account is currently unavailable. Please contact support."
  if (error.status === 0) return error.message
  if (error.status === 503) return "PanelScan authentication is not configured in this environment."
  if (error.status === 429) return "Too many attempts were made. Please wait a moment and try again."
  return "We couldn't sign you in right now. Please try again."
}

export function getRegisterErrorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError)) return "We couldn't create your account. Please try again."
  if (error.status === 409) return "An account with this email already exists."
  if (error.status === 0) return error.message
  if (error.status === 503) return "PanelScan registration is not configured in this environment."
  if (error.status === 429) return "Too many attempts were made. Please wait a moment and try again."
  return "We couldn't create your account right now. Please review your details and try again."
}

