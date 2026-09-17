import { LoaderCircle } from "lucide-react"
import { useState } from "react"
import type { FormEvent } from "react"
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom"

import { getRegisterErrorMessage } from "@/auth/errors"
import { getSafeRedirect } from "@/auth/redirect"
import { calculateAge, dateInputValue, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, validateRegistration } from "@/auth/registration-validation"
import type { RegisterErrors, RegisterField, RegisterValues } from "@/auth/registration-validation"
import { useAuth } from "@/auth/use-auth"
import { AuthShell } from "@/components/auth/auth-shell"
import { FormError } from "@/components/auth/form-error"
import { PasswordInput } from "@/components/auth/password-input"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { useDocumentTitle } from "@/hooks/use-document-title"

interface RegisterTextFieldProps {
  field: "firstName" | "lastName" | "email" | "phone"
  label: string
  value: string
  error?: string
  onChange: (field: RegisterField, value: string) => void
  type?: "text" | "email" | "tel"
  autoComplete: string
  inputMode?: "email" | "tel"
  maxLength?: number
}

function RegisterTextField({ field, label, value, error, onChange, type = "text", autoComplete, inputMode, maxLength }: RegisterTextFieldProps) {
  const errorId = `register-${field}-error`
  return (
    <div>
      <Label htmlFor={`register-${field}`}>{label}</Label>
      <Input id={`register-${field}`} name={field} type={type} inputMode={inputMode} autoComplete={autoComplete} value={value} onChange={(event) => onChange(field, event.target.value)} className="mt-2 h-11" aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} maxLength={maxLength} required />
      {error && <p id={errorId} className="motion-swap mt-1.5 text-xs text-destructive">{error}</p>}
    </div>
  )
}

export function RegisterPage() {
  useDocumentTitle("Create account | PanelScan")
  const { isAuthenticated, isLoading: isRestoring, register } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const destination = getSafeRedirect(location.state, "/dashboard")
  const [values, setValues] = useState<RegisterValues>({ firstName: "", lastName: "", birthdate: "", email: "", phone: "", password: "", confirmPassword: "" })
  const [errors, setErrors] = useState<RegisterErrors>({})
  const [submissionError, setSubmissionError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (isRestoring) {
    return <AuthShell eyebrow="Customer registration" title="Create your account" description="Checking for an existing PanelScan session." asideTitle="A clearer material journey starts here." asideDescription="Create one customer account for pricing, ordering, and organized project results."><div className="grid gap-5 sm:grid-cols-2" aria-label="Restoring your session" aria-busy="true">{Array.from({ length: 8 }, (_, index) => <Skeleton key={index} className="h-16 w-full" />)}</div></AuthShell>
  }

  if (isAuthenticated) return <Navigate to={destination} replace />

  function updateValue(field: RegisterField, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => {
      if (!current[field] && !(field === "password" && current.confirmPassword)) return current
      return { ...current, [field]: undefined, ...(field === "password" ? { confirmPassword: undefined } : {}) }
    })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = validateRegistration(values)
    setErrors(nextErrors)
    setSubmissionError("")
    if (Object.keys(nextErrors).length > 0) return

    setIsSubmitting(true)
    try {
      await register({ firstName: values.firstName.trim(), lastName: values.lastName.trim(), email: values.email.trim().toLowerCase(), password: values.password, ...(values.phone.trim() ? { phone: values.phone.trim() } : {}) })
      navigate(destination, { replace: true })
    } catch (error) {
      setSubmissionError(getRegisterErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  const today = dateInputValue(new Date())
  const age = calculateAge(values.birthdate)

  return (
    <AuthShell eyebrow="Customer registration" title="Create your account" description="Register as a PanelScan customer to access current product pricing." asideTitle="A clearer material journey starts here." asideDescription="Your customer account opens pricing access now and creates the foundation for future purchasing and project coordination.">
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {submissionError && <FormError message={submissionError} />}
        <div className="grid gap-5 sm:grid-cols-2"><RegisterTextField field="firstName" label="First name" value={values.firstName} error={errors.firstName} onChange={updateValue} autoComplete="given-name" maxLength={50} /><RegisterTextField field="lastName" label="Last name" value={values.lastName} error={errors.lastName} onChange={updateValue} autoComplete="family-name" maxLength={50} /></div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="register-birthdate">Birthdate</Label>
            <Input id="register-birthdate" name="birthdate" type="date" autoComplete="bday" value={values.birthdate} onChange={(event) => updateValue("birthdate", event.target.value)} max={today} className="mt-2 h-11" aria-invalid={Boolean(errors.birthdate)} aria-describedby={errors.birthdate ? "register-birthdate-error" : "register-age"} required />
            {errors.birthdate && <p id="register-birthdate-error" className="motion-swap mt-1.5 text-xs text-destructive">{errors.birthdate}</p>}
          </div>
          <div>
            <Label htmlFor="register-age">Age</Label>
            <output id="register-age" htmlFor="register-birthdate" aria-live="polite" className="mt-2 flex h-11 items-center rounded-md border border-input bg-secondary/35 px-2.5 text-sm text-foreground">
              {age === null ? "Calculated from birthdate" : `${age} years old`}
            </output>
          </div>
        </div>
        <RegisterTextField field="email" label="Email address" value={values.email} error={errors.email} onChange={updateValue} type="email" inputMode="email" autoComplete="email" maxLength={254} />
        <RegisterTextField field="phone" label="Contact number" value={values.phone} error={errors.phone} onChange={updateValue} type="tel" inputMode="tel" autoComplete="tel" maxLength={20} />
        <PasswordInput id="register-password" name="password" label="Password" value={values.password} onChange={(value) => updateValue("password", value)} autoComplete="new-password" error={errors.password} description="8–16 characters" minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} />
        <PasswordInput id="register-confirm-password" name="confirmPassword" label="Confirm password" value={values.confirmPassword} onChange={(value) => updateValue("confirmPassword", value)} autoComplete="new-password" error={errors.confirmPassword} minLength={PASSWORD_MIN_LENGTH} maxLength={PASSWORD_MAX_LENGTH} />
        <Button type="submit" size="lg" className="h-11 w-full" disabled={isSubmitting}>{isSubmitting && <LoaderCircle className="animate-spin" aria-hidden="true" />}{isSubmitting ? "Creating account…" : "Create customer account"}</Button>
      </form>
      <p className="mt-7 text-center text-sm text-muted-foreground">Already registered? <Link to="/login" state={{ from: destination }} className="font-semibold text-primary underline-offset-4 hover:underline">Log in</Link></p>
    </AuthShell>
  )
}
