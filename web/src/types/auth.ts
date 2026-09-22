export type UserRole = "OWNER" | "MODERATOR" | "CUSTOMER"

export interface AuthUser {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  /** Calendar date as "YYYY-MM-DD"; null until the customer provides it. */
  birthdate?: string | null
  address?: string | null
  /** Path of the customer's profile picture, relative to the API base URL (null = none). Fetch it with fetchProfilePicture - it needs the login token, so it can't be a plain <img src>. */
  profilePictureUrl?: string | null
  profilePictureUpdatedAt?: string | null
  googleId?: string | null
  role: UserRole
  isActive: boolean
  emailVerified?: boolean
  /** False for Google-only accounts that have never set a password. */
  hasPassword?: boolean
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
  birthdate?: string
  acceptedTerms: boolean
}

export interface UpdateProfileInput {
  firstName?: string
  lastName?: string
  phone?: string
  birthdate?: string | null
  address?: string | null
}

export interface ChangePasswordInput {
  currentPassword: string
  newPassword: string
  confirmPassword: string
  /** This device's refresh token, so its own session survives the change. */
  refreshToken?: string
}

export interface ResetPasswordInput {
  email: string
  code: string
  newPassword: string
  confirmPassword: string
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

