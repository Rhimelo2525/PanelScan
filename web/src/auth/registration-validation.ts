import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  validatePasswordPolicy,
} from "./password-policy"

export { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH }

export type RegisterField = "firstName" | "lastName" | "birthdate" | "email" | "phone" | "password" | "confirmPassword" | "acceptedTerms"

export interface RegisterValues {
  firstName: string
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
const phonePattern = /^\+?[0-9\s\-()]{7,20}$/

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
  if (!values.firstName.trim()) errors.firstName = "First name is required."
  else if (values.firstName.trim().length > 50) errors.firstName = "First name must not exceed 50 characters."
  if (!values.lastName.trim()) errors.lastName = "Last name is required."
  else if (values.lastName.trim().length > 50) errors.lastName = "Last name must not exceed 50 characters."

  const parsedBirthdate = parseBirthdate(values.birthdate)
  if (!values.birthdate) errors.birthdate = "Birthdate is required."
  else if (!parsedBirthdate) errors.birthdate = "Enter a valid birthdate."
  else if (values.birthdate > dateInputValue(today)) errors.birthdate = "Birthdate cannot be in the future."

  if (!values.email.trim()) errors.email = "Email is required."
  else if (!emailPattern.test(values.email.trim())) errors.email = "Enter a valid email address."
  if (!values.phone.trim()) errors.phone = "Contact number is required."
  else if (!phonePattern.test(values.phone.trim())) errors.phone = "Enter a valid contact number."

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
