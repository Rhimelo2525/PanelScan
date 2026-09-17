interface SessionTokens {
  accessToken: string
  refreshToken?: string
}

const STORAGE_KEY = "panelscan.session"

export function getSessionTokens(): SessionTokens | null {
  const stored = window.sessionStorage.getItem(STORAGE_KEY)
  if (!stored) return null

  try {
    const parsed = JSON.parse(stored) as Partial<SessionTokens>
    if (typeof parsed.accessToken !== "string" || !parsed.accessToken) return null
    return {
      accessToken: parsed.accessToken,
      ...(typeof parsed.refreshToken === "string" && parsed.refreshToken ? { refreshToken: parsed.refreshToken } : {}),
    }
  } catch {
    window.sessionStorage.removeItem(STORAGE_KEY)
    return null
  }
}

export function updateSessionTokens(tokens: SessionTokens) {
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tokens))
}

export function clearSessionTokens() {
  window.sessionStorage.removeItem(STORAGE_KEY)
}

