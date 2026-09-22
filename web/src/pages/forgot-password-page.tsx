import { CircleCheck, LoaderCircle } from "lucide-react"
import { useMemo, useState } from "react"
import type { FormEvent } from "react"
import { Link, useLocation } from "react-router-dom"

import { requestPasswordReset, resetPassword, verifyPasswordResetCode } from "@/api/auth"
import { ApiRequestError } from "@/api/client"
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
import { useCooldown } from "@/hooks/use-cooldown"
import { useDocumentTitle } from "@/hooks/use-document-title"

type Step = "email" | "code" | "password" | "done"

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Matches the API's resend cooldown so "Resend code" re-enables about when a new code is allowed.
const RESEND_COOLDOWN_SECONDS = 60

const STEP_COPY: Record<Step, { eyebrow: string; title: string; description: string }> = {
  email: {
    eyebrow: "Password recovery · Step 1 of 3",
    title: "Forgot your password?",
    description: "Enter the email address on your PanelScan account and we'll send you a 6-digit code to verify it's you.",
  },
  code: {
    eyebrow: "Password recovery · Step 2 of 3",
    title: "Check your email",
    description: "Enter the 6-digit code we sent. It expires in 10 minutes and can only be used once.",
  },
  password: {
    eyebrow: "Password recovery · Step 3 of 3",
    title: "Create a new password",
    description: "Choose a strong password you don't use anywhere else.",
  },
  done: {
    eyebrow: "Password recovery",
    title: "Password updated",
    description: "Your password has been reset and any signed-in devices were logged out.",
  },
}

/**
 * Three screens on one page (email, code, new password) plus a confirmation.
 * The screens never say whether an email has an account: the server answers
 * identically either way, and the wording here is deliberately conditional
 * ("if that address is verified...") to match.
 */
export function ForgotPasswordPage() {
  useDocumentTitle("Forgot password | PanelScan")
  const location = useLocation()
  const prefilledEmail = (location.state as { email?: unknown } | null)?.email
  const [step, setStep] = useState<Step>("email")
  const [email, setEmail] = useState(typeof prefilledEmail === "string" ? prefilledEmail : "")
  const [code, setCode] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [fieldError, setFieldError] = useState<{ email?: string; code?: string; newPassword?: string; confirmPassword?: string }>({})
  const [submissionError, setSubmissionError] = useState("")
  const [notice, setNotice] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPasswordFocused, setIsPasswordFocused] = useState(false)
  const { remaining, start } = useCooldown()

  const requirements = useMemo(() => checkPasswordRequirements(newPassword), [newPassword])
  const areRequirementsMet = useMemo(() => Object.values(requirements).every(Boolean), [requirements])
  const showRequirements = isPasswordFocused || (newPassword.length > 0 && !areRequirementsMet) || Boolean(fieldError.newPassword && !areRequirementsMet)
  const copy = STEP_COPY[step]
  const normalizedEmail = email.trim().toLowerCase()

  function goTo(nextStep: Step) {
    setStep(nextStep)
    setFieldError({})
    setSubmissionError("")
  }

  async function sendCode() {
    await requestPasswordReset(normalizedEmail)
    start(RESEND_COOLDOWN_SECONDS)
  }

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmissionError("")
    if (!normalizedEmail) return setFieldError({ email: "Email is required." })
    if (!emailPattern.test(normalizedEmail)) return setFieldError({ email: "Enter a valid email address." })
    setFieldError({})

    setIsSubmitting(true)
    try {
      await sendCode()
      setNotice("")
      setCode("")
      goTo("code")
    } catch (error) {
      setSubmissionError(getAccountErrorMessage(error, "We couldn't start password recovery. Please try again."))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleResend() {
    setSubmissionError("")
    setIsSubmitting(true)
    try {
      await sendCode()
      setNotice("If that address is verified, a new code is on its way.")
    } catch (error) {
      setSubmissionError(getAccountErrorMessage(error, "We couldn't send a new code. Please try again."))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmissionError("")
    if (!/^\d{6}$/.test(code)) return setFieldError({ code: "Enter the 6-digit code from your email." })
    setFieldError({})

    setIsSubmitting(true)
    try {
      await verifyPasswordResetCode(normalizedEmail, code)
      setNotice("")
      goTo("password")
    } catch (error) {
      setSubmissionError(getAccountErrorMessage(error, "We couldn't verify that code. Please try again."))
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handlePasswordSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmissionError("")
    const nextErrors: typeof fieldError = {}
    const policy = validatePasswordPolicy(newPassword)
    if (!policy.isValid && policy.error) nextErrors.newPassword = policy.error
    if (!confirmPassword) nextErrors.confirmPassword = "Confirm your new password."
    else if (confirmPassword !== newPassword) nextErrors.confirmPassword = "Passwords do not match."
    setFieldError(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setIsSubmitting(true)
    try {
      await resetPassword({ email: normalizedEmail, code, newPassword, confirmPassword })
      setNewPassword("")
      setConfirmPassword("")
      goTo("done")
    } catch (error) {
      // A 400 that isn't a validation problem means the code expired or was used up while the customer was choosing a password.
      if (error instanceof ApiRequestError && error.status === 400 && error.message !== "Validation failed.") {
        setCode("")
        setNotice("")
        goTo("code")
        setSubmissionError(`${error.message} Request a new code to continue.`)
      } else {
        setSubmissionError(getAccountErrorMessage(error, "We couldn't reset your password. Please try again."))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthShell eyebrow={copy.eyebrow} title={copy.title} description={copy.description} asideTitle="Get back into your account securely." asideDescription="We verify ownership of your email with a one-time code before any password can change.">
      {step === "email" && (
        <form onSubmit={handleEmailSubmit} noValidate className="space-y-5">
          {submissionError && <FormError message={submissionError} />}
          <div>
            <Label htmlFor="forgot-email">Email address</Label>
            <Input id="forgot-email" name="email" type="email" inputMode="email" autoComplete="email" autoFocus value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 h-11" aria-invalid={Boolean(fieldError.email)} aria-describedby={fieldError.email ? "forgot-email-error" : "forgot-email-hint"} required />
            {fieldError.email
              ? <p id="forgot-email-error" className="motion-swap mt-1.5 text-xs text-destructive">{fieldError.email}</p>
              : <p id="forgot-email-hint" className="mt-1.5 text-xs text-muted-foreground">Recovery is available for accounts whose email has been verified.</p>}
          </div>
          <Button type="submit" size="lg" className="h-11 w-full" disabled={isSubmitting}>
            {isSubmitting && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {isSubmitting ? "Sending…" : "Send verification code"}
          </Button>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={handleCodeSubmit} noValidate className="space-y-5">
          {submissionError && <FormError message={submissionError} />}
          <p className="rounded-lg border border-border bg-secondary/35 px-4 py-3 text-sm leading-6 text-muted-foreground" role="status">
            If <span className="break-all font-medium text-foreground">{normalizedEmail}</span> belongs to an account with a verified email, we&apos;ve sent it a 6-digit code.{notice && <span className="mt-1 block text-foreground">{notice}</span>}
          </p>
          <div>
            <Label htmlFor="forgot-code">6-digit code</Label>
            <Input id="forgot-code" name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={6} placeholder="123456" value={code} onChange={(event) => { setCode(event.target.value.replace(/\D/g, "").slice(0, 6)); setFieldError({}) }} className="mt-2 h-11 font-sans tracking-[0.3em]" aria-invalid={Boolean(fieldError.code)} aria-describedby={fieldError.code ? "forgot-code-error" : undefined} required />
            {fieldError.code && <p id="forgot-code-error" className="motion-swap mt-1.5 text-xs text-destructive">{fieldError.code}</p>}
          </div>
          <Button type="submit" size="lg" className="h-11 w-full" disabled={isSubmitting || code.length !== 6}>
            {isSubmitting && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {isSubmitting ? "Verifying…" : "Verify code"}
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <Button type="button" variant="ghost" size="sm" onClick={() => void handleResend()} disabled={isSubmitting || remaining > 0}>
              {remaining > 0 ? `Resend code in ${remaining}s` : "Resend code"}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => goTo("email")} disabled={isSubmitting}>Use a different email</Button>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">No email? Check your spam folder. Codes are only sent to verified email addresses.</p>
        </form>
      )}

      {step === "password" && (
        <form onSubmit={handlePasswordSubmit} noValidate className="space-y-5">
          {submissionError && <FormError message={submissionError} />}
          <PasswordInput id="forgot-new-password" name="newPassword" label="New password" value={newPassword} onChange={(value) => { setNewPassword(value); setFieldError((current) => ({ ...current, newPassword: undefined, confirmPassword: undefined })) }} onFocus={() => setIsPasswordFocused(true)} onBlur={() => setIsPasswordFocused(false)} autoComplete="new-password" error={fieldError.newPassword} minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH}>
            <PasswordRequirements requirements={requirements} visible={showRequirements} />
          </PasswordInput>
          <PasswordInput id="forgot-confirm-password" name="confirmPassword" label="Confirm new password" value={confirmPassword} onChange={(value) => { setConfirmPassword(value); setFieldError((current) => ({ ...current, confirmPassword: undefined })) }} autoComplete="new-password" error={fieldError.confirmPassword} minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} />
          <Button type="submit" size="lg" className="h-11 w-full" disabled={isSubmitting}>
            {isSubmitting && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {isSubmitting ? "Updating…" : "Reset password"}
          </Button>
        </form>
      )}

      {step === "done" && (
        <div className="space-y-6" role="status">
          <p className="flex items-start gap-3 rounded-lg border border-border bg-secondary/35 px-4 py-3 text-sm leading-6">
            <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            <span>You can now log in with your new password.</span>
          </p>
          <Button size="lg" className="h-11 w-full" asChild><Link to="/login">Log in</Link></Button>
        </div>
      )}

      {step !== "done" && (
        <p className="mt-7 text-center text-sm text-muted-foreground">
          Remembered it?{" "}
          <Link to="/login" className="font-semibold text-primary underline-offset-4 hover:underline">Back to log in</Link>
        </p>
      )}
    </AuthShell>
  )
}
