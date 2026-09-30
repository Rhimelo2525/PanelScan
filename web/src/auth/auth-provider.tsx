import { useCallback, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"

import { getCurrentUser, loginCustomer, logoutCustomer, registerCustomer } from "@/api/auth"
import { refreshAccessToken } from "@/api/client"
import { ActiveAccountConflictError, LEASE_RENEW_MS, claimActiveAccount, endActiveAccount, getActiveAccountId, releaseActiveAccountTab, watchActiveAccount } from "@/auth/active-account"
import { AuthContext } from "@/auth/auth-context"
import { clearSessionTokens, getSessionTokens, updateSessionTokens } from "@/auth/token-storage"
import { clearProfilePictureCache } from "@/hooks/use-profile-picture"
import { clearPaymentHandoff } from "@/payments/payment-handoff"
import type { AuthUser, LoginInput, LoginResponse, RegisterInput } from "@/types/auth"

/** Revokes this tab's refresh token (best effort) and forgets everything it held for the signed-in account. */
async function discardTabSession() {
  const tokens = getSessionTokens()
  try {
    if (tokens?.refreshToken) await logoutCustomer(tokens.refreshToken)
  } catch {
    // Already expired or revoked: nothing left to revoke server-side.
  } finally {
    clearSessionTokens()
    clearProfilePictureCache()
    clearPaymentHandoff()
    window.sessionStorage.removeItem("panelscan_direct_checkout")
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const restoreSession = useCallback(async () => {
    const tokens = getSessionTokens()
    if (!tokens) {
      setUser(null)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    try {
      const restoredUser = await getCurrentUser()
      // A different account signed in elsewhere in this browser after this tab's
      // session was stored (e.g. a restored tab): never bring the old one back.
      if (!claimActiveAccount(restoredUser.id)) {
        await discardTabSession()
        setUser(null)
        return
      }
      setUser(restoredUser)
    } catch {
      clearSessionTokens()
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void restoreSession()
    const handleSessionEnd = () => {
      clearProfilePictureCache()
      setUser(null)
    }
    window.addEventListener("panelscan:session-ended", handleSessionEnd)
    return () => window.removeEventListener("panelscan:session-ended", handleSessionEnd)
  }, [restoreSession])

  const userId = user?.id
  useEffect(() => {
    if (!userId) return

    const endSession = () => {
      void discardTabSession()
      setUser(null)
    }
    // Renewing also re-checks: if another account took the browser while this
    // tab's lease had lapsed (sleep, frozen tab), this tab signs itself out.
    const renew = () => {
      if (getSessionTokens() && !claimActiveAccount(userId)) endSession()
    }
    renew()
    const interval = window.setInterval(renew, LEASE_RENEW_MS)
    const handleVisibility = () => { if (document.visibilityState === "visible") renew() }
    const handlePageShow = (event: PageTransitionEvent) => { if (event.persisted) renew() }
    const handlePageHide = () => releaseActiveAccountTab()
    document.addEventListener("visibilitychange", handleVisibility)
    window.addEventListener("pageshow", handlePageShow)
    window.addEventListener("pagehide", handlePageHide)
    const unwatch = watchActiveAccount({
      onLeaseChange: (holderId) => { if (holderId && holderId !== userId) endSession() },
      onLogout: (loggedOutId) => { if (loggedOutId === userId) endSession() },
    })

    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", handleVisibility)
      window.removeEventListener("pageshow", handlePageShow)
      window.removeEventListener("pagehide", handlePageHide)
      unwatch()
      releaseActiveAccountTab()
    }
  }, [userId])

  /**
   * The single gate every sign-in passes through. A tab that already holds a
   * session, or a browser where a different account is signed in, never has its
   * session replaced: the new session is revoked unused and the caller is told
   * to log out first. Signing in again as the same account is allowed.
   */
  const applySession = useCallback((result: LoginResponse) => {
    const holderId = getActiveAccountId()
    if (getSessionTokens() || (holderId && holderId !== result.user.id)) {
      if (result.refreshToken) void logoutCustomer(result.refreshToken, undefined, result.token).catch(() => undefined)
      throw new ActiveAccountConflictError()
    }
    updateSessionTokens({ accessToken: result.token, refreshToken: result.refreshToken })
    claimActiveAccount(result.user.id)
    setUser(result.user)
    return result.user
  }, [])

  const login = useCallback(async (input: LoginInput) => {
    if (getSessionTokens()) throw new ActiveAccountConflictError()
    // Returned so the caller can route by role without waiting for a re-render.
    return applySession(await loginCustomer(input))
  }, [applySession])

  const register = useCallback(async (input: RegisterInput) => {
    // Checked up front: a new account is by definition a different account, and
    // registration hands back no refresh token that could be revoked afterwards.
    if (getSessionTokens() || getActiveAccountId()) throw new ActiveAccountConflictError()
    const result = await registerCustomer(input)
    updateSessionTokens({ accessToken: result.token })
    claimActiveAccount(result.user.id)
    setUser(result.user)
    return result.user
  }, [])

  const logout = useCallback(async () => {
    const signedOutId = user?.id
    try {
      await discardTabSession()
    } finally {
      // Ends the account in every tab of this browser, freeing it for another sign-in.
      if (signedOutId) endActiveAccount(signedOutId)
      setUser(null)
    }
  }, [user?.id])

  const refreshSession = useCallback(async () => {
    setIsLoading(true)
    try {
      const token = await refreshAccessToken()
      if (!token) throw new Error("Session refresh failed")
      setUser(await getCurrentUser())
    } catch {
      clearSessionTokens()
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  const updateUser = useCallback((nextUser: AuthUser) => setUser(nextUser), [])

  const value = useMemo(() => ({ user, isAuthenticated: Boolean(user), isLoading, login, applySession, register, logout, refreshSession, updateUser }), [applySession, isLoading, login, logout, refreshSession, register, updateUser, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
