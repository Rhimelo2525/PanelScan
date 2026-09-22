import { createContext } from "react"

import type { AuthUser, LoginInput, LoginResponse, RegisterInput } from "@/types/auth"

export interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (input: LoginInput) => Promise<AuthUser>
  applySession: (session: LoginResponse) => AuthUser
  register: (input: RegisterInput) => Promise<AuthUser>
  logout: () => Promise<void>
  refreshSession: () => Promise<void>
  /** Replaces the signed-in user in place (e.g. after a profile edit) without reloading the session. */
  updateUser: (user: AuthUser) => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

