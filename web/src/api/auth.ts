import { apiRequest } from "@/api/client"
import type { AuthUser, ChangePasswordInput, LoginInput, LoginResponse, RegisterInput, RegisterResponse, ResetPasswordInput, UpdateProfileInput } from "@/types/auth"

export function loginCustomer(input: LoginInput, signal?: AbortSignal) {
  return apiRequest<LoginResponse>("/auth/login", { method: "POST", body: input, signal })
}

export function registerCustomer(input: RegisterInput, signal?: AbortSignal) {
  return apiRequest<RegisterResponse>("/auth/register", { method: "POST", body: input, signal })
}

export async function getCurrentUser(signal?: AbortSignal): Promise<AuthUser> {
  const data = await apiRequest<{ user: AuthUser }>("/auth/me", { authenticated: true, signal })
  return data.user
}

export async function updateProfile(input: UpdateProfileInput, signal?: AbortSignal): Promise<AuthUser> {
  const data = await apiRequest<{ user: AuthUser }>("/auth/me", { method: "PATCH", body: input, authenticated: true, signal })
  return data.user
}

/** `image` is the already cropped/compressed picture. The server re-validates and re-encodes it regardless. */
export async function uploadProfilePicture(image: Blob, signal?: AbortSignal): Promise<AuthUser> {
  const body = new FormData()
  // The extension must be one the server accepts and should match the real type.
  body.append("image", image, image.type === "image/jpeg" ? "profile.jpg" : image.type === "image/png" ? "profile.png" : "profile.webp")
  const data = await apiRequest<{ user: AuthUser }>("/auth/me/profile-picture", { method: "PUT", body, authenticated: true, signal })
  return data.user
}

export async function removeProfilePicture(signal?: AbortSignal): Promise<AuthUser> {
  const data = await apiRequest<{ user: AuthUser }>("/auth/me/profile-picture", { method: "DELETE", authenticated: true, signal })
  return data.user
}

/** `path` is AuthUser.profilePictureUrl. The image is access-controlled, so it is fetched with the login token rather than loaded by an <img> tag directly. */
export function fetchProfilePicture(path: string, signal?: AbortSignal) {
  return apiRequest<Blob>(path, { authenticated: true, responseType: "blob", signal })
}

export function changePassword(input: ChangePasswordInput, signal?: AbortSignal) {
  return apiRequest<void>("/auth/change-password", { method: "POST", body: input, authenticated: true, signal })
}

export function sendVerificationEmail(signal?: AbortSignal) {
  return apiRequest<{ alreadyVerified: boolean }>("/auth/send-verification-email", { method: "POST", authenticated: true, signal })
}

export async function verifyEmail(code: string, signal?: AbortSignal): Promise<AuthUser> {
  const data = await apiRequest<{ user: AuthUser }>("/auth/verify-email", { method: "POST", body: { code }, authenticated: true, signal })
  return data.user
}

// Password recovery is public: the customer is signed out when they need it.
export function requestPasswordReset(email: string, signal?: AbortSignal) {
  return apiRequest<void>("/auth/forgot-password", { method: "POST", body: { email }, signal })
}

export function verifyPasswordResetCode(email: string, code: string, signal?: AbortSignal) {
  return apiRequest<void>("/auth/verify-reset-code", { method: "POST", body: { email, code }, signal })
}

export function resetPassword(input: ResetPasswordInput, signal?: AbortSignal) {
  return apiRequest<void>("/auth/reset-password", { method: "POST", body: input, signal })
}

export function logoutCustomer(refreshToken: string, signal?: AbortSignal) {
  return apiRequest<void>("/auth/logout", { method: "POST", body: { refreshToken }, authenticated: true, retryAfterRefresh: false, signal })
}

export function exchangeGoogleTicket(ticket: string, signal?: AbortSignal) {
  return apiRequest<LoginResponse>("/auth/google/exchange", { method: "POST", body: { ticket }, signal })
}

export function loginWithGoogle(body: { credential?: string; code?: string }, signal?: AbortSignal) {
  return apiRequest<LoginResponse>("/auth/google", { method: "POST", body, signal })
}

