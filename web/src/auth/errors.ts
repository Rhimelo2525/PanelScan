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

/**
 * Shared by the profile, change-password, email-verification and password
 * recovery screens. The API's own messages for these (wrong current password,
 * invalid or expired code, resend cooldown, ...) are written for customers
 * and safe to show as-is; only failures that carry no useful message are
 * replaced by the screen's fallback.
 */
export function getAccountErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ApiRequestError)) return fallback
  if (error.status === 401) return "Your session has expired. Please log in again."
  if (error.status === 400 && error.message === "Validation failed.") return "Please check the details you entered and try again."
  if (error.status === 0 || (error.status >= 400 && error.status < 500) || error.status === 503) return error.message || fallback
  return fallback
}

/** Upload / remove failures for the profile picture; the API's own messages for bad files are written for customers and shown as-is. */
export function getProfilePictureErrorMessage(error: unknown, fallback = "We couldn't save your photo right now. Please try again."): string {
  if (error instanceof ApiRequestError) {
    if (error.status === 413) return "Image size must be less than 5MB."
    if (error.status === 429) return "You've changed your photo a lot recently. Please wait a few minutes and try again."
    if (error.status === 403) return "This account can't change a profile picture."
  }
  return getAccountErrorMessage(error, fallback)
}

export function getRegisterErrorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError)) return "We couldn't create your account. Please try again."
  if (error.status === 409) return "An account with this email already exists."
  if (error.status === 0) return error.message
  if (error.status === 503) return "PanelScan registration is not configured in this environment."
  if (error.status === 429) return "Too many attempts were made. Please wait a moment and try again."
  return "We couldn't create your account right now. Please review your details and try again."
}

