/**
 * Keeps a customer signed in after every PanelScan tab is closed.
 *
 * Tab sessions live in sessionStorage, which the browser forgets when the tab
 * closes. So while signed in, the site keeps one extra session of the account,
 * minted for this purpose and used by no open tab, in localStorage. A tab that
 * opens with no session (and no open tab to hand it one) takes it over:
 *
 * - "Remember me" on: always, until that session itself expires on the server.
 * - "Remember me" off: only within an hour of the last moment a PanelScan tab
 *   was open; after that it is revoked and the visitor signs in again.
 *
 * A saved session is never shared with an open tab (each takes it out of
 * storage before using it and a fresh one is minted for the next time), so two
 * tabs never rotate the same refresh token.
 */
const STORAGE_KEY = "panelscan.saved-session"
const REMEMBER_KEY = "panelscan.remember-me"

/** How long after the last tab closed a session not marked "Remember me" can still be picked up. */
export const UNREMEMBERED_GRACE_MS = 60 * 60 * 1000

export interface SavedSession {
  userId: string
  accessToken: string
  refreshToken: string
  remember: boolean
  /** The last time a tab signed in to this account was open (epoch ms). */
  lastSeen: number
}

function read(): SavedSession | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    const parsed = JSON.parse(stored) as Partial<SavedSession>
    if (typeof parsed.userId !== "string" || typeof parsed.accessToken !== "string" || typeof parsed.refreshToken !== "string" || !parsed.refreshToken) return null
    return {
      userId: parsed.userId,
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      remember: parsed.remember === true,
      lastSeen: typeof parsed.lastSeen === "number" ? parsed.lastSeen : 0,
    }
  } catch {
    return null
  }
}

function write(session: SavedSession | null) {
  try {
    if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage blocked (some private modes): the session simply ends with the tab, as before.
  }
}

/** The "Remember me" choice last made on the sign-in page (off by default). */
export function getRememberMe(): boolean {
  try {
    return window.localStorage.getItem(REMEMBER_KEY) === "true"
  } catch {
    return false
  }
}

export function setRememberMe(remember: boolean) {
  try {
    window.localStorage.setItem(REMEMBER_KEY, String(remember))
  } catch {
    // Not saved; the default (off) applies next time.
  }
}

/** Whether a saved session for `userId` is already waiting. */
export function hasSavedSession(userId: string): boolean {
  return read()?.userId === userId
}

/**
 * Stores a freshly minted session for `userId`. Returns the session it
 * replaced, if any, so the caller can revoke it (another account's, or a
 * duplicate minted by a second tab at the same moment).
 */
export function storeSavedSession(session: Omit<SavedSession, "lastSeen">): SavedSession | null {
  const previous = read()
  write({ ...session, lastSeen: Date.now() })
  return previous && previous.refreshToken !== session.refreshToken ? previous : null
}

/** Marks the account as still in use (called while a tab is open and as it closes). */
export function touchSavedSession(userId: string) {
  const current = read()
  if (current?.userId === userId) write({ ...current, lastSeen: Date.now() })
}

/**
 * Takes the saved session out of storage for this tab to use. Returns it when
 * it may still be used, or `{ expired }` with a session too old to use (not
 * remembered and unused for over an hour) so the caller can revoke it.
 */
export function takeSavedSession(now = Date.now()): { session: SavedSession } | { expired: SavedSession } | null {
  const current = read()
  if (!current) return null
  write(null)
  if (!current.remember && now - current.lastSeen > UNREMEMBERED_GRACE_MS) return { expired: current }
  return { session: current }
}

/** Removes the saved session (sign-out); returns it so its refresh token can be revoked. */
export function clearSavedSession(): SavedSession | null {
  const current = read()
  write(null)
  return current
}
