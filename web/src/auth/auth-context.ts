import { createContext } from "react"

import type { AuthUser, LoginInput, RegisterInput } from "@/types/auth"

export interface AuthContextValue {
  user: AuthUser | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (input: LoginInput) => Promise<AuthUser>
  register: (input: RegisterInput) => Promise<AuthUser>
  logout: () => Promise<void>
  refreshSession: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

