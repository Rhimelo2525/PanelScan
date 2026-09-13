export type UserRole = "OWNER" | "MODERATOR" | "CUSTOMER"

export interface AuthUser {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  role: UserRole
  isActive: boolean
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

