export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 16

export const PASSWORD_UPPERCASE_REGEX = /[A-Z]/
export const PASSWORD_LOWERCASE_REGEX = /[a-z]/
export const PASSWORD_NUMBER_REGEX = /[0-9]/
export const PASSWORD_SPECIAL_REGEX = /[!@#$%^&*()_+\-=[\]{}|;:,.<>?/~`\\]/

const COMMON_WEAK_PASSWORDS = new Set([
  "password1!",
  "password123!",
  "qwerty123!",
  "admin123!",
  "welcome1!",
  "welcome123!",
  "pass1234!",
  "letmein1!",
  "iloveyou1!",
  "changeme1!",
  "testing123!",
  "default123!",
  "monkey123!",
  "dragon123!",
  "master123!",
  "sunshine1!",
  "princess1!",
  "football1!",
  "baseball1!",
  "shadow123!",
  "panelscan1!",
  "panelscan123!",
])

const COMMON_ROOTS = [
  "password",
  "passcode",
  "qwerty",
  "admin",
  "administrator",
  "welcome",
  "letmein",
  "changeme",
  "default",
  "panelscan",
  "testing",
]

export function isCommonPassword(password: string): boolean {
  const normalized = password.toLowerCase().trim()
  if (COMMON_WEAK_PASSWORDS.has(normalized)) return true

  const alphaRoot = normalized.replace(/[^a-z]/g, "")
  if (alphaRoot && COMMON_ROOTS.includes(alphaRoot)) return true

  return false
}

export interface PasswordRequirementsState {
  length: boolean
  uppercase: boolean
  lowercase: boolean
  number: boolean
  special: boolean
  noSpaces: boolean
}

export function checkPasswordRequirements(password: string): PasswordRequirementsState {
  return {
    length: password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH,
    uppercase: PASSWORD_UPPERCASE_REGEX.test(password),
    lowercase: PASSWORD_LOWERCASE_REGEX.test(password),
    number: PASSWORD_NUMBER_REGEX.test(password),
    special: PASSWORD_SPECIAL_REGEX.test(password),
    noSpaces: !/\s/.test(password) && password.length > 0,
  }
}

export interface PasswordValidationResult {
  isValid: boolean
  error?: string
  requirements: PasswordRequirementsState
}

export function validatePasswordPolicy(password: string): PasswordValidationResult {
  const requirements = checkPasswordRequirements(password)

  if (!password) {
    return {
      isValid: false,
      error: "Password is required.",
      requirements,
    }
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      isValid: false,
      error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
      requirements,
    }
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    return {
      isValid: false,
      error: `Password cannot exceed ${PASSWORD_MAX_LENGTH} characters.`,
      requirements,
    }
  }

  if (/\s/.test(password)) {
    return {
      isValid: false,
      error: "Password must not contain spaces.",
      requirements,
    }
  }

  if (!requirements.uppercase) {
    return {
      isValid: false,
      error: "Password must contain at least one uppercase letter.",
      requirements,
    }
  }

  if (!requirements.lowercase) {
    return {
      isValid: false,
      error: "Password must contain at least one lowercase letter.",
      requirements,
    }
  }

  if (!requirements.number) {
    return {
      isValid: false,
      error: "Password must contain at least one number.",
      requirements,
    }
  }

  if (!requirements.special) {
    return {
      isValid: false,
      error: "Password must contain at least one special character.",
      requirements,
    }
  }

  if (isCommonPassword(password)) {
    return {
      isValid: false,
      error: "This password is too common or easily guessed. Please choose a stronger password.",
      requirements,
    }
  }

  return {
    isValid: true,
    requirements,
  }
}
