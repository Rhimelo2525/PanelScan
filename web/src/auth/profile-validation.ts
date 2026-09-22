import { validatePasswordPolicy } from "./password-policy"
import { calculateAge } from "./registration-validation"

export interface ProfileValues {
  firstName: string
  lastName: string
  birthdate: string
  phone: string
  address: string
}

export type ProfileField = keyof ProfileValues
export type ProfileErrors = Partial<Record<ProfileField, string>>

export interface ChangePasswordValues {
  currentPassword: string
  newPassword: string
  confirmPassword: string
}

export type ChangePasswordField = keyof ChangePasswordValues
export type ChangePasswordErrors = Partial<Record<ChangePasswordField, string>>

export const ADDRESS_MAX_LENGTH = 255

// Same rules the API enforces (auth.validation.ts), so a save that passes here is not rejected there.
const phonePattern = /^\+?[0-9\s\-()]{7,20}$/

/**
 * `hadPhone` / `hadBirthdate`: a saved contact number or birthday can be
 * corrected but not removed, while an account that never had one may leave it
 * blank. For the birthday this is also a safeguard, not just a rule -
 * BirthdateInput reports a half-typed date as "", which would otherwise be
 * indistinguishable from deliberately clearing it and silently erase it on save.
 */
export function validateProfile(values: ProfileValues, options: { hadPhone: boolean; hadBirthdate: boolean }): ProfileErrors {
  const errors: ProfileErrors = {}

  const firstName = values.firstName.trim()
  if (!firstName) errors.firstName = "First name is required."
  else if (firstName.length < 2) errors.firstName = "First name must be at least 2 characters."
  else if (firstName.length > 50) errors.firstName = "First name must not exceed 50 characters."

  const lastName = values.lastName.trim()
  if (!lastName) errors.lastName = "Last name is required."
  else if (lastName.length < 2) errors.lastName = "Last name must be at least 2 characters."
  else if (lastName.length > 50) errors.lastName = "Last name must not exceed 50 characters."

  // calculateAge is null for an unparseable, impossible or future date.
  if (!values.birthdate) {
    if (options.hadBirthdate) errors.birthdate = "Enter your complete birthday (MM / DD / YYYY)."
  } else if (calculateAge(values.birthdate) === null) {
    errors.birthdate = "Enter a valid birthday that is not in the future."
  }

  const phone = values.phone.trim()
  if (!phone) {
    if (options.hadPhone) errors.phone = "Contact number is required."
  } else if (!phonePattern.test(phone)) {
    errors.phone = "Enter a valid contact number."
  }

  if (values.address.trim().length > ADDRESS_MAX_LENGTH) errors.address = `Address must not exceed ${ADDRESS_MAX_LENGTH} characters.`

  return errors
}

export function validateChangePassword(values: ChangePasswordValues): ChangePasswordErrors {
  const errors: ChangePasswordErrors = {}

  if (!values.currentPassword) errors.currentPassword = "Current password is required."

  const policy = validatePasswordPolicy(values.newPassword)
  if (!policy.isValid && policy.error) errors.newPassword = policy.error
  else if (values.newPassword === values.currentPassword) errors.newPassword = "Your new password must be different from your current password."

  if (!values.confirmPassword) errors.confirmPassword = "Confirm your new password."
  else if (values.confirmPassword !== values.newPassword) errors.confirmPassword = "Passwords do not match."

  return errors
}
