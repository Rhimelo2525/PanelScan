import { apiRequest } from "@/api/client"
import type { AuthUser, LoginInput, LoginResponse, RegisterInput, RegisterResponse } from "@/types/auth"

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

export function logoutCustomer(refreshToken: string, signal?: AbortSignal) {
  return apiRequest<void>("/auth/logout", { method: "POST", body: { refreshToken }, authenticated: true, retryAfterRefresh: false, signal })
}

export function exchangeGoogleTicket(ticket: string, signal?: AbortSignal) {
  return apiRequest<LoginResponse>("/auth/google/exchange", { method: "POST", body: { ticket }, signal })
}

export function loginWithGoogle(body: { credential?: string; code?: string }, signal?: AbortSignal) {
  return apiRequest<LoginResponse>("/auth/google", { method: "POST", body, signal })
}

