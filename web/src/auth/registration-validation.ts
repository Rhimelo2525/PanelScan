import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  validatePasswordPolicy,
} from "./password-policy"
import { PHILIPPINE_PHONE_MESSAGE, isValidPhilippinePhone } from "@/lib/phone"

export { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH }

export type RegisterField = "firstName" | "middleInitial" | "lastName" | "birthdate" | "email" | "phone" | "password" | "confirmPassword" | "acceptedTerms"

export interface RegisterValues {
  firstName: string
  middleInitial: string
  lastName: string
  birthdate: string
  email: string
  phone: string
  password: string
  confirmPassword: string
  acceptedTerms: boolean
}

export type RegisterErrors = Partial<Record<RegisterField, string>>

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Same rule as the API (utils/nameSchema.ts): letters (ñ and accents included)
// plus spaces, hyphens, apostrophes and periods - "Ma. Cristina", "Dela Cruz",
// "O'Neil". No numbers or other symbols; must start with a letter.
const personNamePattern = /^\p{L}[\p{L}\p{M} .'-]*$/u

export function isValidPersonName(value: string): boolean {
  return personNamePattern.test(value.trim())
}

export function personNameMessage(label: "First name" | "Last name"): string {
  return `${label} can only contain letters, spaces, hyphens, apostrophes and periods (no numbers).`
}

/**
 * Drops characters a name field can never hold (numbers, symbols) as they are
 * typed, pasted or autofilled, so they never appear in the field at all.
 */
export function sanitizeNameInput(field: string, value: string): string {
  if (field === "firstName" || field === "lastName") return value.replace(/[^\p{L}\p{M} .'-]/gu, "")
  if (field === "middleInitial") return value.replace(/[^\p{L}\p{M} .]/gu, "")
  return value
}

// Same rule as the API (auth.validation.ts): "M", "M.", "D. C." - 1-3 letters,
// periods/spaces only as separators. Stored as the bare letters ("M", "DC").
const middleInitialPattern = /^(\p{L}\.?\s?){1,3}$/u
export const MIDDLE_INITIAL_MESSAGE = "Enter a middle initial using letters only (e.g. M or M.)."

export function isValidMiddleInitial(value: string): boolean {
  return middleInitialPattern.test(value.trim())
}

/** "M." / "d c" -> "M" / "DC", the form the API stores. */
export function normalizeMiddleInitial(value: string): string {
  return value.replace(/[.\s]/g, "").toUpperCase()
}

/** Stored "M" / "DC" -> "M." / "D.C." for display and form fields. */
export function formatMiddleInitial(value: string | null | undefined): string {
  return value ? [...value].map((letter) => `${letter}.`).join("") : ""
}
interface BirthdateParts {
  year: number
  month: number
  day: number
}

function parseBirthdate(value: string): BirthdateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1 || month < 1 || month > 12) return null

  const monthEnd = new Date(0)
  monthEnd.setUTCFullYear(year, month, 0)
  const daysInMonth = monthEnd.getUTCDate()
  if (day < 1 || day > daysInMonth) return null
  return { year, month, day }
}

export function dateInputValue(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-")
}

export function calculateAge(value: string, today = new Date()): number | null {
  const birthdate = parseBirthdate(value)
  if (!birthdate) return null

  let age = today.getFullYear() - birthdate.year
  const birthdayHasPassed = today.getMonth() + 1 > birthdate.month
    || (today.getMonth() + 1 === birthdate.month && today.getDate() >= birthdate.day)
  if (!birthdayHasPassed) age -= 1
  return age >= 0 ? age : null
}

export function validateRegistration(values: RegisterValues, today = new Date()): RegisterErrors {
  const errors: RegisterErrors = {}
  // Minimum lengths match the API, so a form that passes here isn't rejected there.
  if (!values.firstName.trim()) errors.firstName = "First name is required."
  else if (values.firstName.trim().length < 2) errors.firstName = "First name must be at least 2 characters."
  else if (values.firstName.trim().length > 50) errors.firstName = "First name must not exceed 50 characters."
  else if (!isValidPersonName(values.firstName)) errors.firstName = personNameMessage("First name")
  if (values.middleInitial.trim() && !isValidMiddleInitial(values.middleInitial)) errors.middleInitial = MIDDLE_INITIAL_MESSAGE
  if (!values.lastName.trim()) errors.lastName = "Last name is required."
  else if (values.lastName.trim().length < 2) errors.lastName = "Last name must be at least 2 characters."
  else if (values.lastName.trim().length > 50) errors.lastName = "Last name must not exceed 50 characters."
  else if (!isValidPersonName(values.lastName)) errors.lastName = personNameMessage("Last name")

  const parsedBirthdate = parseBirthdate(values.birthdate)
  if (!values.birthdate) errors.birthdate = "Birthdate is required."
  else if (!parsedBirthdate) errors.birthdate = "Enter a valid birthdate."
  else if (values.birthdate > dateInputValue(today)) errors.birthdate = "Birthdate cannot be in the future."

  if (!values.email.trim()) errors.email = "Email is required."
  else if (!emailPattern.test(values.email.trim())) errors.email = "Enter a valid email address."
  if (!values.phone.trim()) errors.phone = "Contact number is required."
  else if (!isValidPhilippinePhone(values.phone)) errors.phone = PHILIPPINE_PHONE_MESSAGE

  const passwordResult = validatePasswordPolicy(values.password)
  if (!passwordResult.isValid && passwordResult.error) {
    errors.password = passwordResult.error
  }

  if (!values.confirmPassword) {
    errors.confirmPassword = "Confirm your password."
  } else if (values.confirmPassword !== values.password) {
    errors.confirmPassword = "Passwords do not match."
  }

  if (!values.acceptedTerms) {
    errors.acceptedTerms = "You must agree to the Terms of Use and Privacy Policy before creating an account."
  }

  return errors
}
