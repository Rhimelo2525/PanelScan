import { LoaderCircle } from "lucide-react"
import { useState } from "react"
import type { FormEvent } from "react"
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom"

import { getLoginErrorMessage } from "@/auth/errors"
import { landingPathForRole } from "@/admin/admin-nav"
import { getSafeRedirect } from "@/auth/redirect"
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

export function LoginPage() {
  useDocumentTitle("Log in | PanelScan")
  const { user, isAuthenticated, isLoading: isRestoring, login } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  // An explicit "from" (a guarded page the visitor was sent away from) always
  // wins; otherwise each role lands on its own home - staff in Admin, customers
  // on their dashboard.
  const requestedPath = getSafeRedirect(location.state, "")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [errors, setErrors] = useState<LoginErrors>({})
  const [submissionError, setSubmissionError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (isRestoring) {
    return <AuthShell eyebrow="Account access" title="Welcome back" description="Checking for an existing PanelScan session." asideTitle="Continue planning with clarity." asideDescription="Your account connects product pricing, cart, orders, and project results in one place."><div className="space-y-5" aria-label="Restoring your session" aria-busy="true"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-11 w-full" /></div></AuthShell>
  }

  if (isAuthenticated) return <Navigate to={requestedPath || landingPathForRole(user?.role ?? "CUSTOMER")} replace />

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
      navigate(requestedPath || landingPathForRole(signedInUser.role), { replace: true })
    } catch (error) {
      setSubmissionError(getLoginErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AuthShell eyebrow="Account access" title="Welcome back" description="Log in to reveal product pricing and continue to your PanelScan account." asideTitle="Return to the materials that shaped your plan." asideDescription="Authenticated customers can review current pricing, manage their cart, and follow orders from one account.">
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {submissionError && <FormError message={submissionError} />}
        <div>
          <Label htmlFor="login-email">Email address</Label>
          <Input id="login-email" name="email" type="email" inputMode="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-2 h-11" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "login-email-error" : undefined} required />
          {errors.email && <p id="login-email-error" className="motion-swap mt-1.5 text-xs text-destructive">{errors.email}</p>}
        </div>
        <PasswordInput id="login-password" name="password" label="Password" value={password} onChange={setPassword} autoComplete="current-password" error={errors.password} />
        <Button type="submit" size="lg" className="h-11 w-full" disabled={isSubmitting}>{isSubmitting && <LoaderCircle className="animate-spin" aria-hidden="true" />}{isSubmitting ? "Signing in…" : "Log in"}</Button>
      </form>
      <p className="mt-7 text-center text-sm text-muted-foreground">New to PanelScan? <Link to="/register" state={{ from: requestedPath }} className="font-semibold text-primary underline-offset-4 hover:underline">Create an account</Link></p>
      <div className="mt-5 rounded-lg border border-border bg-secondary/45 p-4 text-center"><p className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">Client review</p><p className="mt-1.5 text-sm text-muted-foreground">Need to review the interface without backend access?</p><Link to="/admin-preview" className="mt-2 inline-block text-sm font-semibold text-primary underline-offset-4 hover:underline">Open read-only Demo Admin</Link></div>
    </AuthShell>
  )
}
