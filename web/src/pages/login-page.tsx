import { LoaderCircle } from "lucide-react"
import { useEffect, useState } from "react"
import type { FormEvent } from "react"
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom"

import { exchangeGoogleTicket } from "@/api/auth"
import { apiBaseUrl } from "@/api/client"
import { getLoginErrorMessage } from "@/auth/errors"
import { getSafeRedirect, resolveLoginDestination } from "@/auth/redirect"
import { useAuth } from "@/auth/use-auth"
import { AuthShell } from "@/components/auth/auth-shell"
import { FormError } from "@/components/auth/form-error"
import { PasswordInput } from "@/components/auth/password-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { useDocumentTitle } from "@/hooks/use-document-title"

interface LoginErrors {
  email?: string
  password?: string
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  )
}

export function LoginPage() {
  useDocumentTitle("Log in | PanelScan")
  const { user, isAuthenticated, isLoading: isRestoring, login, applySession } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  // An explicit "from" (a guarded page the visitor was sent away from) is preserved
  // for staff roles; customers are always routed to their dashboard.
  const requestedPath = getSafeRedirect(location.state, "")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [errors, setErrors] = useState<LoginErrors>({})
  const [submissionError, setSubmissionError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false)

  // Handle redirect return from Google OAuth
  useEffect(() => {
    const searchParams = new URLSearchParams(location.search)
    const ticket = searchParams.get("ticket")
    const errorParam = searchParams.get("error")

    if (errorParam) {
      if (errorParam === "cancelled") {
        setSubmissionError("Google sign-in was cancelled.")
      } else if (errorParam === "invalid_state") {
        setSubmissionError("Google sign-in session expired or was invalid. Please try again.")
      } else if (errorParam === "deactivated") {
        setSubmissionError("This account has been deactivated. Please contact support.")
      } else if (errorParam === "unverified_email") {
        setSubmissionError("Your Google account email is not verified. Please verify your email with Google.")
      } else {
        setSubmissionError("We could not complete Google sign-in. Please try again or use your password.")
      }
      navigate(location.pathname, { replace: true, state: location.state })
      return
    }

    if (ticket) {
      setIsSubmitting(true)
      exchangeGoogleTicket(ticket)
        .then((result) => {
          const signedInUser = applySession(result)
          const redirectFrom = searchParams.get("from") || requestedPath
          navigate(resolveLoginDestination(signedInUser.role, redirectFrom), { replace: true })
        })
        .catch((error) => {
          setSubmissionError(getLoginErrorMessage(error))
          navigate(location.pathname, { replace: true, state: location.state })
        })
        .finally(() => {
          setIsSubmitting(false)
        })
    }
  }, [location.pathname, location.search, location.state, requestedPath, applySession, navigate])

  if (isRestoring) {
    return (
      <AuthShell
        eyebrow="Account access"
        title="Welcome back"
        description="Checking for an existing PanelScan session."
        asideTitle="Continue planning with clarity."
        asideDescription="Your account connects product pricing, cart, orders, and project results in one place."
      >
        <div className="space-y-5" aria-label="Restoring your session" aria-busy="true">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      </AuthShell>
    )
  }

  if (isAuthenticated) return <Navigate to={resolveLoginDestination(user?.role, requestedPath)} replace />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors: LoginErrors = {}
    if (!email.trim()) nextErrors.email = "Email is required."
    else if (!emailPattern.test(email.trim())) nextErrors.email = "Enter a valid email address."
    if (!password) nextErrors.password = "Password is required."
    setErrors(nextErrors)
    setSubmissionError("")
    if (Object.keys(nextErrors).length > 0) return

    setIsSubmitting(true)
    try {
      const signedInUser = await login({ email: email.trim().toLowerCase(), password })
      navigate(resolveLoginDestination(signedInUser.role, requestedPath), { replace: true })
    } catch (error) {
      setSubmissionError(getLoginErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleGoogleLogin() {
    setIsGoogleSubmitting(true)
    setSubmissionError("")
    const returnParam = requestedPath ? `?returnTo=${encodeURIComponent(requestedPath)}` : ""
    window.location.href = `${apiBaseUrl}/auth/google${returnParam}`
  }

  return (
    <AuthShell
      eyebrow="Account access"
      title="Welcome back"
      description="Log in to reveal product pricing and continue to your PanelScan account."
      asideTitle="Return to the materials that shaped your plan."
      asideDescription="Authenticated customers can review current pricing, manage their cart, and follow orders from one account."
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {submissionError && <FormError message={submissionError} />}
        <div>
          <Label htmlFor="login-email">Email address</Label>
          <Input
            id="login-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 h-11"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? "login-email-error" : undefined}
            required
          />
          {errors.email && (
            <p id="login-email-error" className="motion-swap mt-1.5 text-xs text-destructive">
              {errors.email}
            </p>
          )}
        </div>
        <PasswordInput
          id="login-password"
          name="password"
          label="Password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
          error={errors.password}
        />
        <Button type="submit" size="lg" className="h-11 w-full" disabled={isSubmitting || isGoogleSubmitting}>
          {isSubmitting && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {isSubmitting ? "Signing in…" : "Log in"}
        </Button>
      </form>

      <div className="relative my-6 text-center text-xs">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <span className="relative bg-card px-2 text-muted-foreground uppercase font-medium">
          Or
        </span>
      </div>

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="h-11 w-full gap-2.5 font-medium"
        onClick={handleGoogleLogin}
        disabled={isSubmitting || isGoogleSubmitting}
        aria-label="Continue with Google"
      >
        {isGoogleSubmitting ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <GoogleIcon className="size-4 shrink-0" />
        )}
        <span>{isGoogleSubmitting ? "Connecting to Google…" : "Continue with Google"}</span>
      </Button>

      <p className="mt-7 text-center text-sm text-muted-foreground">
        New to PanelScan?{" "}
        <Link to="/register" state={{ from: requestedPath }} className="font-semibold text-primary underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </AuthShell>
  )
}
