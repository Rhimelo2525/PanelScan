export type UserRole = "OWNER" | "MODERATOR" | "CUSTOMER"

export interface AuthUser {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  googleId?: string | null
  role: UserRole
  isActive: boolean
  termsAcceptedAt?: string | null
  createdAt: string
  updatedAt: string
}

export interface LoginInput {
  email: string
  password: string
}

export interface RegisterInput {
  firstName: string
  lastName: string
  email: string
  password: string
  phone?: string
  acceptedTerms: boolean
}

export interface LoginResponse {
  user: AuthUser
  token: string
  refreshToken: string
}

export interface RegisterResponse {
  user: AuthUser
  token: string
}

