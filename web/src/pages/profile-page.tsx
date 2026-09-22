import { ArrowLeft } from "lucide-react"
import { Link } from "react-router-dom"

import { useAuth } from "@/auth/use-auth"
import { Container } from "@/components/layout/container"
import { ChangePasswordForm } from "@/components/profile/change-password-form"
import { EmailStatusBadge } from "@/components/profile/email-status-badge"
import { CustomerAvatar } from "@/components/profile/customer-avatar"
import { EmailVerificationCard } from "@/components/profile/email-verification-card"
import { PersonalInformationForm } from "@/components/profile/personal-information-form"
import { ProfilePictureSection } from "@/components/profile/profile-picture-section"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { formatOrderDate } from "@/orders/order-format"
import type { AuthUser } from "@/types/auth"

function signInMethod(user: AuthUser): string {
  if (user.googleId && user.hasPassword === false) return "Google"
  if (user.googleId) return "Email and password, Google"
  return "Email and password"
}

/** The customer's own account: personal details, read-only account facts, and security (email verification, password). */
export function ProfilePage() {
  useDocumentTitle("Your profile | PanelScan")
  const { user } = useAuth()

  if (!user) return null

  return (
    <>
      <section className="border-b border-border bg-secondary/35 py-12 sm:py-16">
        <Container>
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-5">
              <CustomerAvatar user={user} className="size-14" fallbackClassName="text-lg" />
              <div>
                <p className="section-eyebrow">Your PanelScan</p>
                <h1 className="type-h2 mt-2">Profile</h1>
                <p className="mt-2 text-sm text-muted-foreground">Manage your personal information and account security.</p>
              </div>
            </div>
            <Button variant="outline" asChild><Link to="/dashboard"><ArrowLeft data-icon="inline-start" aria-hidden="true" />Back to dashboard</Link></Button>
          </div>
        </Container>
      </section>

      <Container className="py-10 sm:py-14">
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <div className="space-y-8">
            <ProfilePictureSection user={user} />

            <section className="surface-card p-6 sm:p-8" aria-labelledby="personal-information-title">
              <h2 id="personal-information-title" className="text-xl font-semibold tracking-[-0.025em]">Personal information</h2>
              <p className="mt-2 mb-6 text-sm leading-6 text-muted-foreground">Keep your details up to date so the team can reach you about orders and installations.</p>
              <PersonalInformationForm user={user} />
            </section>

            <section className="surface-card p-6 sm:p-8" aria-labelledby="account-details-title">
              <h2 id="account-details-title" className="text-xl font-semibold tracking-[-0.025em]">Account details</h2>
              <dl className="mt-5 grid gap-x-8 gap-y-5 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-muted-foreground">Email</dt><dd className="mt-1 break-all">{user.email}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Email status</dt><dd className="mt-1"><EmailStatusBadge verified={user.emailVerified} /></dd></div>
                <div><dt className="text-xs text-muted-foreground">Account type</dt><dd className="mt-1">Customer</dd></div>
                <div><dt className="text-xs text-muted-foreground">Sign-in method</dt><dd className="mt-1">{signInMethod(user)}</dd></div>
                <div><dt className="text-xs text-muted-foreground">Member since</dt><dd className="mt-1">{formatOrderDate(user.createdAt)}</dd></div>
              </dl>
            </section>
          </div>

          <section className="surface-card p-6 sm:p-8" aria-labelledby="security-settings-title">
            <h2 id="security-settings-title" className="text-xl font-semibold tracking-[-0.025em]">Security settings</h2>
            <div className="mt-6 space-y-6">
              <EmailVerificationCard user={user} />
              <Separator />
              <ChangePasswordForm user={user} />
            </div>
          </section>
        </div>
      </Container>
    </>
  )
}
