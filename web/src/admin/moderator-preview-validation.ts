export const MODERATOR_PASSWORD_MIN_LENGTH = 8
export const MODERATOR_PASSWORD_MAX_LENGTH = 16

export interface ModeratorFormValues {
  firstName: string
  lastName: string
  email: string
  contactNumber: string
  temporaryPassword: string
  confirmTemporaryPassword: string
}

export type ModeratorFormErrors = Partial<Record<keyof ModeratorFormValues, string>>

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateModeratorForm(values: ModeratorFormValues): ModeratorFormErrors {
  const errors: ModeratorFormErrors = {}

  if (!values.firstName.trim()) errors.firstName = "First name is required."
  else if (values.firstName.trim().length > 50) errors.firstName = "Use 50 characters or fewer."

  if (!values.lastName.trim()) errors.lastName = "Last name is required."
  else if (values.lastName.trim().length > 50) errors.lastName = "Use 50 characters or fewer."

  if (!values.email.trim()) errors.email = "Email address is required."
  else if (!emailPattern.test(values.email.trim())) errors.email = "Enter a valid email address."

  if (!values.contactNumber.trim()) errors.contactNumber = "Contact number is required."

  if (!values.temporaryPassword) errors.temporaryPassword = "Temporary password is required."
  else if (values.temporaryPassword.length < MODERATOR_PASSWORD_MIN_LENGTH) errors.temporaryPassword = "Use at least 8 characters."
  else if (values.temporaryPassword.length > MODERATOR_PASSWORD_MAX_LENGTH) errors.temporaryPassword = "Use no more than 16 characters."

  if (!values.confirmTemporaryPassword) errors.confirmTemporaryPassword = "Confirm the temporary password."
  else if (values.confirmTemporaryPassword !== values.temporaryPassword) errors.confirmTemporaryPassword = "Passwords do not match."

  return errors
}
