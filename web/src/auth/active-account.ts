/**
 * One signed-in PanelScan account per browser.
 *
 * Tokens stay per-tab in sessionStorage (the refresh token must never be written
 * to localStorage), so without coordination every tab is an independent login
 * and two accounts could be signed in side by side. The customer site and the
 * /admin portal share one login page, one token slot and one API session, so the
 * restriction is browser-wide rather than per role.
 *
 * This module keeps a small, non-secret marker in localStorage: the id of the
 * account that holds the browser plus a lease for each tab signed in to it. Every
 * sign-in path checks it before accepting a session. Tabs renew their lease while
 * signed in and drop it on unload, and leases expire, so a crashed or closed
 * browser can never lock sign-in for good.
 */
const STORAGE_KEY = "panelscan.active-account"
const CHANNEL_NAME = "panelscan.auth"
const LEASE_MS = 2 * 60 * 1000
/** Well inside LEASE_MS even with background-tab timer throttling (~1/minute). */
export const LEASE_RENEW_MS = 30 * 1000

export const ACTIVE_ACCOUNT_CONFLICT_MESSAGE = "An account is already logged in on this portal. Please log out first before signing in with another account."

export class ActiveAccountConflictError extends Error {
  constructor() {
    super(ACTIVE_ACCOUNT_CONFLICT_MESSAGE)
    this.name = "ActiveAccountConflictError"
  }
}

interface ActiveAccount {
  userId: string
  /** tab id -> lease expiry (epoch ms) */
  tabs: Record<string, number>
}

const tabId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

function readActiveAccount(): ActiveAccount | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (!stored) return null
    const parsed = JSON.parse(stored) as Partial<ActiveAccount>
    if (typeof parsed.userId !== "string" || !parsed.userId || !parsed.tabs || typeof parsed.tabs !== "object") return null

    const now = Date.now()
    const tabs = Object.fromEntries(Object.entries(parsed.tabs).filter(([, expiresAt]) => typeof expiresAt === "number" && expiresAt > now))
    return Object.keys(tabs).length > 0 ? { userId: parsed.userId, tabs } : null
  } catch {
    return null
  }
}

function writeActiveAccount(account: ActiveAccount | null) {
  try {
    if (account && Object.keys(account.tabs).length > 0) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(account))
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage blocked (e.g. some private modes): tabs cannot coordinate, sign-in still works per tab.
  }
}

/** The account currently signed in somewhere in this browser, if any tab still holds a live lease. */
export function getActiveAccountId(): string | null {
  return readActiveAccount()?.userId ?? null
}

/** Claims or renews this tab's lease for `userId`. Returns false when a different account holds the browser. */
export function claimActiveAccount(userId: string): boolean {
  const current = readActiveAccount()
  if (current && current.userId !== userId) return false
  writeActiveAccount({ userId, tabs: { ...current?.tabs, [tabId]: Date.now() + LEASE_MS } })
  return true
}

/** Drops this tab's lease only; other tabs signed in to the same account keep theirs. */
export function releaseActiveAccountTab() {
  const current = readActiveAccount()
  if (!current || !(tabId in current.tabs)) return
  const tabs = { ...current.tabs }
  delete tabs[tabId]
  writeActiveAccount({ userId: current.userId, tabs })
}

/** Logout: frees the browser for another account and tells every other tab signed in as `userId` to end its session. */
export function endActiveAccount(userId: string) {
  if (readActiveAccount()?.userId === userId) writeActiveAccount(null)
  if (typeof BroadcastChannel === "undefined") return
  const channel = new BroadcastChannel(CHANNEL_NAME)
  channel.postMessage({ type: "logout", userId })
  channel.close()
}

/** Subscribes to lease changes and logout broadcasts from other tabs. */
export function watchActiveAccount(handlers: { onLeaseChange: (holderId: string | null) => void; onLogout: (userId: string) => void }) {
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) handlers.onLeaseChange(getActiveAccountId())
  }
  window.addEventListener("storage", handleStorage)

  const channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL_NAME)
  if (channel) {
    channel.onmessage = (event: MessageEvent<{ type?: unknown; userId?: unknown }>) => {
      if (event.data?.type === "logout" && typeof event.data.userId === "string") handlers.onLogout(event.data.userId)
    }
  }

  return () => {
    window.removeEventListener("storage", handleStorage)
    channel?.close()
  }
}
