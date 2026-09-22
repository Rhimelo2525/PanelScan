import { LoaderCircle } from "lucide-react"
import { useMemo, useState } from "react"
import type { FormEvent } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"

import { changePassword } from "@/api/auth"
import { ApiRequestError } from "@/api/client"
import { getAccountErrorMessage } from "@/auth/errors"
import { checkPasswordRequirements } from "@/auth/password-policy"
import { validateChangePassword } from "@/auth/profile-validation"
import type { ChangePasswordErrors, ChangePasswordField, ChangePasswordValues } from "@/auth/profile-validation"
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/auth/registration-validation"
import { getSessionTokens } from "@/auth/token-storage"
import { FormError } from "@/components/auth/form-error"
import { PasswordInput } from "@/components/auth/password-input"
import { PasswordRequirements } from "@/components/auth/password-requirements"
import { Button } from "@/components/ui/button"
import type { AuthUser } from "@/types/auth"

const emptyValues: ChangePasswordValues = { currentPassword: "", newPassword: "", confirmPassword: "" }

export function ChangePasswordForm({ user }: { user: AuthUser }) {
  const [values, setValues] = useState<ChangePasswordValues>(emptyValues)
  const [errors, setErrors] = useState<ChangePasswordErrors>({})
  const [submissionError, setSubmissionError] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [isNewPasswordFocused, setIsNewPasswordFocused] = useState(false)

  const requirements = useMemo(() => checkPasswordRequirements(values.newPassword), [values.newPassword])
  const areRequirementsMet = useMemo(() => Object.values(requirements).every(Boolean), [requirements])
  const showRequirements = isNewPasswordFocused || (values.newPassword.length > 0 && !areRequirementsMet) || Boolean(errors.newPassword && !areRequirementsMet)

  // A Google-only account has no password to change; it can create one through password recovery.
  if (user.hasPassword === false) {
    return (
      <div>
        <h3 className="font-medium">Password</h3>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">You sign in with Google, so this account doesn&apos;t have a PanelScan password yet. You can create one if you&apos;d like to log in with your email too.</p>
        <Button variant="outline" className="mt-4" asChild><Link to="/forgot-password" state={{ email: user.email }}>Create a password</Link></Button>
      </div>
    )
  }

  function updateValue(field: ChangePasswordField, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => (current[field] || (field === "newPassword" && current.confirmPassword) ? { ...current, [field]: undefined, ...(field === "newPassword" ? { confirmPassword: undefined } : {}) } : current))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = validateChangePassword(values)
    setErrors(nextErrors)
    setSubmissionError("")
    if (Object.keys(nextErrors).length > 0) return

    setIsSaving(true)
    try {
      const refreshToken = getSessionTokens()?.refreshToken
      await changePassword({ ...values, ...(refreshToken ? { refreshToken } : {}) })
      setValues(emptyValues)
      toast.success("Password updated", { description: "Your other signed-in devices have been logged out." })
    } catch (caught) {
      const message = getAccountErrorMessage(caught, "We couldn't change your password. Please try again.")
      // Point a wrong-current-password reply at the field it belongs to.
      if (caught instanceof ApiRequestError && caught.status === 400 && /current password/i.test(message)) setErrors({ currentPassword: message })
      else setSubmissionError(message)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      <h3 className="font-medium">Change password</h3>
      {submissionError && <FormError message={submissionError} />}
      <PasswordInput id="change-current-password" name="currentPassword" label="Current password" value={values.currentPassword} onChange={(value) => updateValue("currentPassword", value)} autoComplete="current-password" error={errors.currentPassword} />
      <PasswordInput
        id="change-new-password"
        name="newPassword"
        label="New password"
        value={values.newPassword}
        onChange={(value) => updateValue("newPassword", value)}
        onFocus={() => setIsNewPasswordFocused(true)}
        onBlur={() => setIsNewPasswordFocused(false)}
        autoComplete="new-password"
        error={errors.newPassword}
        minLength={PASSWORD_MIN_LENGTH}
        maxLength={PASSWORD_MAX_LENGTH}
      >
        <PasswordRequirements requirements={requirements} visible={showRequirements} />
      </PasswordInput>
      <PasswordInput id="change-confirm-password" name="confirmPassword" label="Confirm new password" value={values.confirmPassword} onChange={(value) => updateValue("confirmPassword", value)} autoComplete="new-password" error={errors.confirmPassword} minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} />
      <Button type="submit" size="lg" className="h-11 w-full sm:w-auto" disabled={isSaving}>
        {isSaving && <LoaderCircle className="animate-spin" aria-hidden="true" />}
        {isSaving ? "Updating…" : "Update password"}
      </Button>
    </form>
  )
}
