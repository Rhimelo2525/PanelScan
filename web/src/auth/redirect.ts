interface RedirectState {
  from?: unknown
}

export function getSafeRedirect(state: unknown, fallback: string): string {
  if (!state || typeof state !== "object") return fallback
  const from = (state as RedirectState).from
  if (typeof from !== "string" || !from.startsWith("/") || from.startsWith("//")) return fallback
  return from
}

