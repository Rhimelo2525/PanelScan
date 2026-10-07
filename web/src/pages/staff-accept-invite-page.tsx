import { CircleCheck, LoaderCircle } from "lucide-react"
import { useMemo, useState } from "react"
import type { FormEvent } from "react"
import { Link, useSearchParams } from "react-router-dom"

import { acceptStaffInvitation, resetStaffPassword } from "@/api/auth"
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

/** Everything that differs between activating an invitation and an owner-sent password reset. */
const COPY = {
  invite: {
    documentTitle: "Activate your staff account | PanelScan",
    title: "Activate your staff account",
    doneTitle: "Your account is active",
    description: "Confirm the 6-digit code from your invitation email and choose your password. Your account is activated once this is done.",
    doneDescription: "Your email is verified and your password is set. Log in to open the PanelScan admin.",
    asideTitle: "Welcome to the PanelScan team.",
    asideDescription: "Your invitation code proves this email address is yours before the account can be used.",
    codeHint: "It expires 48 hours after it was sent. If it has expired, ask the owner to resend your invitation.",
    submit: "Verify and activate account",
    submitting: "Activating…",
    failure: "We couldn't activate your account. Please try again.",
    done: "You can now log in with your email and new password.",
  },
  reset: {
    documentTitle: "Reset your staff password | PanelScan",
    title: "Reset your staff password",
    doneTitle: "Password changed",
    description: "Enter the 6-digit code from the password reset email the owner sent you, then choose a new password.",
    doneDescription: "Your new password is set and every device was signed out. Log in again to open the PanelScan admin.",
    asideTitle: "Back into PanelScan, securely.",
    asideDescription: "Only you choose your password: the owner sends the code, but never sees or sets the password itself.",
    codeHint: "It expires 24 hours after it was sent. If it has expired, ask the owner to send a new password reset.",
    submit: "Set new password",
    submitting: "Saving…",
    failure: "We couldn't change your password. Please try again.",
    done: "You can now log in with your email and new password.",
  },
} as const

/**
 * Where the owner's staff emails lead: an invitation (`mode="invite"`, at
 * /staff/accept-invite) or a password reset (`mode="reset"`, at
 * /staff/reset-password). The link carries the email and the 6-digit code, so
 * normally only the password is left to choose; both can still be typed in by
 * hand. Redeeming an invitation verifies the email and activates the account;
 * a reset replaces the password and signs out every device.
 */
export function StaffAcceptInvitePage({ mode = "invite" }: { mode?: "invite" | "reset" }) {
  const copy = COPY[mode]
  useDocumentTitle(copy.documentTitle)
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
      const input = { email: normalizedEmail, code, password, confirmPassword }
      await (mode === "reset" ? resetStaffPassword(input) : acceptStaffInvitation(input))
      setPassword("")
      setConfirmPassword("")
      setIsDone(true)
    } catch (error) {
      setSubmissionError(getAccountErrorMessage(error, copy.failure))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthShell
      eyebrow="PanelScan staff"
      title={isDone ? copy.doneTitle : copy.title}
      description={isDone ? copy.doneDescription : copy.description}
      asideTitle={copy.asideTitle}
      asideDescription={copy.asideDescription}
    >
      {isDone ? (
        <div className="space-y-6" role="status">
          <p className="flex items-start gap-3 rounded-lg border border-border bg-secondary/35 px-4 py-3 text-sm leading-6">
            <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <span>{copy.done}</span>
          </p>
          <Button size="lg" className="h-11 w-full" asChild><Link to="/login/admin" state={{ email: email.trim().toLowerCase() }}>Log in</Link></Button>
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
              : <p id="invite-code-hint" className="mt-1.5 text-xs text-muted-foreground">{copy.codeHint}</p>}
          </div>
          <PasswordInput id="invite-password" name="password" label={mode === "reset" ? "New password" : "Choose a password"} value={password} onChange={(value) => { setPassword(value); setFieldError((current) => ({ ...current, password: undefined, confirmPassword: undefined })) }} onFocus={() => setIsPasswordFocused(true)} onBlur={() => setIsPasswordFocused(false)} autoComplete="new-password" error={fieldError.password} minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH}>
            <PasswordRequirements requirements={requirements} visible={showRequirements} />
          </PasswordInput>
          <PasswordInput id="invite-confirm-password" name="confirmPassword" label="Confirm password" value={confirmPassword} onChange={(value) => { setConfirmPassword(value); setFieldError((current) => ({ ...current, confirmPassword: undefined })) }} autoComplete="new-password" error={fieldError.confirmPassword} minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} />
          <Button type="submit" size="lg" className="h-11 w-full" disabled={isSubmitting}>
            {isSubmitting && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {isSubmitting ? copy.submitting : copy.submit}
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
