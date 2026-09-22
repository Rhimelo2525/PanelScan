import { BadgeCheck, LoaderCircle } from "lucide-react"
import { useState } from "react"
import type { FormEvent } from "react"
import { toast } from "sonner"

import { getCurrentUser, sendVerificationEmail, verifyEmail } from "@/api/auth"
import { ApiRequestError } from "@/api/client"
import { getAccountErrorMessage } from "@/auth/errors"
import { useAuth } from "@/auth/use-auth"
import { EmailStatusBadge } from "@/components/profile/email-status-badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useCooldown } from "@/hooks/use-cooldown"
import type { AuthUser } from "@/types/auth"

// Matches the API's resend cooldown so the button re-enables about when a new code is allowed.
const RESEND_COOLDOWN_SECONDS = 60

/**
 * Proves the customer owns their email address. Password recovery is only
 * offered to verified addresses, so an unverified one is called out here with
 * the way to fix it. New accounts are emailed a code automatically at sign-up,
 * so the code box is shown straight away rather than behind a button.
 */
export function EmailVerificationCard({ user }: { user: AuthUser }) {
  const { updateUser } = useAuth()
  const [code, setCode] = useState("")
  const [error, setError] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const { remaining, start } = useCooldown()

  async function handleSend() {
    setIsSending(true)
    setError("")
    try {
      const result = await sendVerificationEmail()
      if (result.alreadyVerified) {
        updateUser(await getCurrentUser())
        return
      }
      start(RESEND_COOLDOWN_SECONDS)
      toast.success("Verification code sent", { description: `Check ${user.email} for a 6-digit code.` })
    } catch (caught) {
      // A cooldown reply means a code went out moments ago (e.g. at sign-up) and is still usable.
      if (caught instanceof ApiRequestError && caught.status === 429) start(RESEND_COOLDOWN_SECONDS)
      setError(getAccountErrorMessage(caught, "We couldn't send the verification email. Please try again shortly."))
    } finally {
      setIsSending(false)
    }
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your email.")
      return
    }

    setIsVerifying(true)
    setError("")
    try {
      updateUser(await verifyEmail(code))
      setCode("")
      toast.success("Email verified", { description: "You can now use it to recover your password." })
    } catch (caught) {
      setError(getAccountErrorMessage(caught, "We couldn't verify that code. Please try again."))
    } finally {
      setIsVerifying(false)
    }
  }

  if (user.emailVerified) {
    return (
      <div>
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-medium">Email verification</h3>
          <EmailStatusBadge verified />
        </div>
        <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-muted-foreground">
          <BadgeCheck className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <span><span className="break-all font-medium text-foreground">{user.email}</span> is verified. It can be used to recover your password.</span>
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium">Email verification</h3>
        <EmailStatusBadge verified={false} />
      </div>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Verify <span className="break-all font-medium text-foreground">{user.email}</span> to prove it&apos;s yours. Password recovery only works for verified emails.
      </p>
      <form onSubmit={handleVerify} noValidate className="mt-4 space-y-3">
        <div>
          <Label htmlFor="verify-email-code">6-digit code</Label>
          <Input
            id="verify-email-code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            value={code}
            onChange={(event) => { setCode(event.target.value.replace(/\D/g, "").slice(0, 6)); setError("") }}
            className="mt-2 h-11 font-sans tracking-[0.3em]"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "verify-email-code-error" : undefined}
          />
          {error && <p id="verify-email-code-error" role="alert" className="motion-swap mt-1.5 text-xs text-destructive">{error}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" className="h-10" disabled={isVerifying || code.length !== 6}>
            {isVerifying && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {isVerifying ? "Verifying…" : "Verify email"}
          </Button>
          <Button type="button" variant="outline" className="h-10" onClick={() => void handleSend()} disabled={isSending || remaining > 0}>
            {isSending && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            {isSending ? "Sending…" : remaining > 0 ? `Send a new code (${remaining}s)` : "Send a new code"}
          </Button>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">Codes expire after 10 minutes. Nothing arrived? Check your spam folder, then send a new code.</p>
      </form>
    </div>
  )
}
