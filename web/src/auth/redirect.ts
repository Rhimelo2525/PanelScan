import { landingPathForRole } from "../admin/admin-nav"
import type { UserRole } from "../types/auth"

interface RedirectState {
  from?: unknown
}

export function getSafeRedirect(state: unknown, fallback: string): string {
  if (!state || typeof state !== "object") return fallback
  const from = (state as RedirectState).from
  if (typeof from !== "string" || !from.startsWith("/") || from.startsWith("//")) return fallback
  return from
}

/**
 * Resolves post-login redirection based on the authenticated user's role.
 *
 * Rules:
 * - CUSTOMER: automatically redirected to the customer-facing home page (/)
 * - MODERATOR: preserves existing moderator redirect (requested guarded path || /admin)
 * - OWNER: preserves existing owner redirect (requested guarded path || /admin)
 * - Fallback / other: requested path || landingPathForRole
 */
export function resolveLoginDestination(role: UserRole | undefined, requestedPath: string = ""): string {
  if (role === "CUSTOMER") {
    return requestedPath || "/"
  } else if (role === "MODERATOR") {
    return requestedPath || landingPathForRole("MODERATOR")
  } else if (role === "OWNER") {
    return requestedPath || landingPathForRole("OWNER")
  } else {
    return requestedPath || (role ? landingPathForRole(role) : "/")
  }
}

