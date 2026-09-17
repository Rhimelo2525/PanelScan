import { useCallback, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"

import { getCurrentUser, loginCustomer, logoutCustomer, registerCustomer } from "@/api/auth"
import { refreshAccessToken } from "@/api/client"
import { AuthContext } from "@/auth/auth-context"
import { clearSessionTokens, getSessionTokens, updateSessionTokens } from "@/auth/token-storage"
import type { AuthUser, LoginInput, LoginResponse, RegisterInput } from "@/types/auth"

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
      setUser(await getCurrentUser())
    } catch {
      clearSessionTokens()
      setUser(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void restoreSession()
    const handleSessionEnd = () => setUser(null)
    window.addEventListener("panelscan:session-ended", handleSessionEnd)
    return () => window.removeEventListener("panelscan:session-ended", handleSessionEnd)
  }, [restoreSession])

  const login = useCallback(async (input: LoginInput) => {
    const result = await loginCustomer(input)
    updateSessionTokens({ accessToken: result.token, refreshToken: result.refreshToken })
    setUser(result.user)
    // Returned so the caller can route by role without waiting for a re-render.
    return result.user
  }, [])

  const applySession = useCallback((result: LoginResponse) => {
    updateSessionTokens({ accessToken: result.token, refreshToken: result.refreshToken })
    setUser(result.user)
    return result.user
  }, [])

  const register = useCallback(async (input: RegisterInput) => {
    const result = await registerCustomer(input)
    updateSessionTokens({ accessToken: result.token })
    setUser(result.user)
    return result.user
  }, [])

  const logout = useCallback(async () => {
    const refreshToken = getSessionTokens()?.refreshToken
    try {
      if (refreshToken) await logoutCustomer(refreshToken)
    } finally {
      clearSessionTokens()
      setUser(null)
    }
  }, [])

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

  const value = useMemo(() => ({ user, isAuthenticated: Boolean(user), isLoading, login, applySession, register, logout, refreshSession }), [applySession, isLoading, login, logout, refreshSession, register, user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

