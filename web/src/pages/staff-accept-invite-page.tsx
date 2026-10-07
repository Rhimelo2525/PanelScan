import { CircleCheck, LoaderCircle } from "lucide-react"
import { useMemo, useState } from "react"
import type { FormEvent } from "react"
import { Link, useSearchParams } from "react-router-dom"

import { acceptStaffInvitation } from "@/api/auth"
import { getAccountErrorMessage } from "@/auth/errors"
import { checkPasswordRequirements, validatePasswordPolicy } from "@/auth/password-policy"
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "@/auth/registration-validation"
import { AuthShell } from "@/components/auth/auth-shell"
import { FormError } from "@/components/auth/form-error"
import { PasswordInput } from "@/components/auth/password-input"
import { PasswordRequirements } from "@/components/auth/password-requirements"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useDocumentTitle } from "@/hooks/use-document-title"

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/**
 * Where the owner's staff invitation email leads. The link carries the email
 * and the 6-digit code, so normally only the password is left to choose; both
 * can still be typed in by hand. Redeeming the code verifies the email and
 * activates the account - until then it cannot sign in at all.
 */
export function StaffAcceptInvitePage() {
  useDocumentTitle("Activate your staff account | PanelScan")
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState(searchParams.get("email") ?? "")
  const [code, setCode] = useState((searchParams.get("code") ?? "").replace(/\D/g, "").slice(0, 6))
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [fieldError, setFieldError] = useState<{ email?: string; code?: string; password?: string; confirmPassword?: string }>({})
  const [submissionError, setSubmissionError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPasswordFocused, setIsPasswordFocused] = useState(false)
  const [isDone, setIsDone] = useState(false)

  const requirements = useMemo(() => checkPasswordRequirements(password), [password])
  const allMet = Object.values(requirements).every(Boolean)
  const showRequirements = isPasswordFocused || (password.length > 0 && !allMet) || Boolean(fieldError.password && !allMet)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmissionError("")
    const normalizedEmail = email.trim().toLowerCase()
    const nextErrors: typeof fieldError = {}
    if (!emailPattern.test(normalizedEmail)) nextErrors.email = "Enter the email address the invitation was sent to."
    if (code.length !== 6) nextErrors.code = "Enter the 6-digit code from the invitation email."
    const policy = validatePasswordPolicy(password)
    if (!policy.isValid && policy.error) nextErrors.password = policy.error
    if (!confirmPassword) nextErrors.confirmPassword = "Confirm your password."
    else if (confirmPassword !== password) nextErrors.confirmPassword = "Passwords do not match."
    setFieldError(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setIsSubmitting(true)
    try {
      await acceptStaffInvitation({ email: normalizedEmail, code, password, confirmPassword })
      setPassword("")
      setConfirmPassword("")
      setIsDone(true)
    } catch (error) {
      setSubmissionError(getAccountErrorMessage(error, "We couldn't activate your account. Please try again."))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthShell
      eyebrow="PanelScan staff"
      title={isDone ? "Your account is active" : "Activate your staff account"}
      description={isDone
        ? "Your email is verified and your password is set. Log in to open the PanelScan admin."
        : "Confirm the 6-digit code from your invitation email and choose your password. Your account is activated once this is done."}
      asideTitle="Welcome to the PanelScan team."
      asideDescription="Your invitation code proves this email address is yours before the account can be used."
    >
      {isDone ? (
        <div className="space-y-6" role="status">
          <p className="flex items-start gap-3 rounded-lg border border-border bg-secondary/35 px-4 py-3 text-sm leading-6">
            <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <span>You can now log in with your email and new password.</span>
          </p>
          <Button size="lg" className="h-11 w-full" asChild><Link to="/login">Log in</Link></Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          {submissionError && <FormError message={submissionError} />}
          <div>
            <Label htmlFor="invite-email">Email address</Label>
            <Input id="invite-email" name="email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setFieldError((current) => ({ ...current, email: undefined })) }} className="mt-2 h-11" aria-invalid={Boolean(fieldError.email)} aria-describedby={fieldError.email ? "invite-email-error" : undefined} required />
            {fieldError.email && <p id="invite-email-error" className="motion-swap mt-1.5 text-xs text-destructive">{fieldError.email}</p>}
          </div>
          <div>
            <Label htmlFor="invite-code">6-digit code</Label>
            <Input id="invite-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" value={code} onChange={(event) => { setCode(event.target.value.replace(/\D/g, "").slice(0, 6)); setFieldError((current) => ({ ...current, code: undefined })) }} className="mt-2 h-11 font-sans tracking-[0.3em]" aria-invalid={Boolean(fieldError.code)} aria-describedby={fieldError.code ? "invite-code-error" : "invite-code-hint"} required />
            {fieldError.code
              ? <p id="invite-code-error" className="motion-swap mt-1.5 text-xs text-destructive">{fieldError.code}</p>
              : <p id="invite-code-hint" className="mt-1.5 text-xs text-muted-foreground">It expires 48 hours after it was sent. If it has expired, ask the owner to resend your invitation.</p>}
          </div>
          <PasswordInput id="invite-password" name="password" label="Choose a password" value={password} onChange={(value) => { setPassword(value); setFieldError((current) => ({ ...current, password: undefined, confirmPassword: undefined })) }} onFocus={() => setIsPasswordFocused(true)} onBlur={() => setIsPasswordFocused(false)} autoComplete="new-password" error={fieldError.password} minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH}>
            <PasswordRequirements requirements={requirements} visible={showRequirements} />
          </PasswordInput>
          <PasswordInput id="invite-confirm-password" name="confirmPassword" label="Confirm password" value={confirmPassword} onChange={(value) => { setConfirmPassword(value); setFieldError((current) => ({ ...current, confirmPassword: undefined })) }} autoComplete="new-password" error={fieldError.confirmPassword} minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} />
          <Button type="submit" size="lg" className="h-11 w-full" disabled={isSubmitting}>
            {isSubmitting && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {isSubmitting ? "Activating…" : "Verify and activate account"}
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
