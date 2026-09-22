import { LoaderCircle } from "lucide-react"
import { useState } from "react"
import type { FormEvent } from "react"
import { toast } from "sonner"

import { updateProfile } from "@/api/auth"
import { getAccountErrorMessage } from "@/auth/errors"
import { ADDRESS_MAX_LENGTH, validateProfile } from "@/auth/profile-validation"
import type { ProfileErrors, ProfileField, ProfileValues } from "@/auth/profile-validation"
import { calculateAge, dateInputValue } from "@/auth/registration-validation"
import { useAuth } from "@/auth/use-auth"
import { BirthdateInput } from "@/components/auth/birthdate-input"
import { FormError } from "@/components/auth/form-error"
import { EmailStatusBadge } from "@/components/profile/email-status-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { AuthUser } from "@/types/auth"

function toValues(user: AuthUser): ProfileValues {
  return {
    firstName: user.firstName,
    lastName: user.lastName,
    birthdate: user.birthdate ?? "",
    phone: user.phone ?? "",
    address: user.address ?? "",
  }
}

interface TextFieldProps {
  field: "firstName" | "lastName" | "phone"
  label: string
  value: string
  error?: string
  onChange: (field: ProfileField, value: string) => void
  autoComplete: string
  type?: "text" | "tel"
  inputMode?: "tel"
  maxLength: number
}

function TextField({ field, label, value, error, onChange, autoComplete, type = "text", inputMode, maxLength }: TextFieldProps) {
  const errorId = `profile-${field}-error`
  return (
    <div>
      <Label htmlFor={`profile-${field}`}>{label}</Label>
      <Input id={`profile-${field}`} name={field} type={type} inputMode={inputMode} autoComplete={autoComplete} value={value} onChange={(event) => onChange(field, event.target.value)} className="mt-2 h-11" aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} maxLength={maxLength} />
      {error && <p id={errorId} className="motion-swap mt-1.5 text-xs text-destructive">{error}</p>}
    </div>
  )
}

/**
 * Edits the customer's own details. Email is shown but not editable: it is the
 * login identity and the address verification and recovery codes are sent to,
 * so changing it needs its own re-verification rather than a plain field edit.
 */
export function PersonalInformationForm({ user }: { user: AuthUser }) {
  const { updateUser } = useAuth()
  const saved = toValues(user)
  const savedKey = JSON.stringify(saved)
  const [values, setValues] = useState<ProfileValues>(saved)
  const [errors, setErrors] = useState<ProfileErrors>({})
  const [submissionError, setSubmissionError] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  // Adopt the saved values whenever the stored profile itself changes (after a
  // save). Keyed on the profile fields only, so unrelated account changes -
  // such as verifying the email - never wipe edits that are still in progress.
  const [syncedKey, setSyncedKey] = useState(savedKey)
  if (savedKey !== syncedKey) {
    setSyncedKey(savedKey)
    setValues(saved)
    setErrors({})
  }

  const isDirty = (Object.keys(values) as ProfileField[]).some((field) => values[field].trim() !== saved[field].trim())
  const age = calculateAge(values.birthdate)

  function updateValue(field: ProfileField, value: string) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => (current[field] ? { ...current, [field]: undefined } : current))
  }

  function handleDiscard() {
    setValues(saved)
    setErrors({})
    setSubmissionError("")
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = validateProfile(values, { hadPhone: Boolean(user.phone), hadBirthdate: Boolean(user.birthdate) })
    setErrors(nextErrors)
    setSubmissionError("")
    if (Object.keys(nextErrors).length > 0) return

    setIsSaving(true)
    try {
      const phone = values.phone.trim()
      const updated = await updateProfile({
        firstName: values.firstName.trim(),
        lastName: values.lastName.trim(),
        ...(phone ? { phone } : {}),
        birthdate: values.birthdate || null,
        address: values.address.trim() || null,
      })
      updateUser(updated)
      toast.success("Profile updated", { description: "Your account information has been saved." })
    } catch (error) {
      setSubmissionError(getAccountErrorMessage(error, "We couldn't save your changes. Please try again."))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {submissionError && <FormError message={submissionError} />}
      <div className="grid gap-5 sm:grid-cols-2">
        <TextField field="firstName" label="First name" value={values.firstName} error={errors.firstName} onChange={updateValue} autoComplete="given-name" maxLength={50} />
        <TextField field="lastName" label="Last name" value={values.lastName} error={errors.lastName} onChange={updateValue} autoComplete="family-name" maxLength={50} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="profile-birthdate">Birthday</Label>
          <BirthdateInput
            id="profile-birthdate"
            name="birthdate"
            value={values.birthdate}
            onChange={(value) => updateValue("birthdate", value)}
            max={dateInputValue(new Date())}
            error={errors.birthdate}
            describedBy={errors.birthdate ? "profile-birthdate-error" : "profile-age"}
            className="mt-2"
          />
          {errors.birthdate && <p id="profile-birthdate-error" className="motion-swap mt-1.5 text-xs text-destructive">{errors.birthdate}</p>}
        </div>
        <div>
          <Label htmlFor="profile-age">Age</Label>
          <output id="profile-age" htmlFor="profile-birthdate" aria-live="polite" className="mt-2 flex h-11 items-center rounded-md border border-input bg-secondary/35 px-2.5 text-sm text-foreground">
            {age === null ? "Calculated from birthday" : `${age} years old`}
          </output>
        </div>
      </div>

      <TextField field="phone" label="Contact number" value={values.phone} error={errors.phone} onChange={updateValue} type="tel" inputMode="tel" autoComplete="tel" maxLength={20} />

      <div>
        <Label htmlFor="profile-address">Address</Label>
        <Textarea id="profile-address" name="address" autoComplete="street-address" rows={3} value={values.address} onChange={(event) => updateValue("address", event.target.value)} className="mt-2" maxLength={ADDRESS_MAX_LENGTH} aria-invalid={Boolean(errors.address)} aria-describedby={errors.address ? "profile-address-error" : "profile-address-hint"} placeholder="House/unit, street, barangay, city, province" />
        {errors.address
          ? <p id="profile-address-error" className="motion-swap mt-1.5 text-xs text-destructive">{errors.address}</p>
          : <p id="profile-address-hint" className="mt-1.5 text-xs text-muted-foreground">The address saved on your account.</p>}
      </div>

      <div>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="profile-email">Email address</Label>
          <EmailStatusBadge verified={user.emailVerified} />
        </div>
        <Input id="profile-email" name="email" type="email" value={user.email} readOnly disabled className="mt-2 h-11" aria-describedby="profile-email-hint" />
        <p id="profile-email-hint" className="mt-1.5 text-xs text-muted-foreground">Your email is your login and where security codes are sent, so it can&apos;t be changed here.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button type="submit" size="lg" className="h-11" disabled={isSaving || !isDirty}>
          {isSaving && <LoaderCircle className="animate-spin" aria-hidden="true" />}
          {isSaving ? "Saving…" : "Save changes"}
        </Button>
        <Button type="button" variant="ghost" size="lg" className="h-11" onClick={handleDiscard} disabled={isSaving || !isDirty}>Discard changes</Button>
      </div>
    </form>
  )
}
