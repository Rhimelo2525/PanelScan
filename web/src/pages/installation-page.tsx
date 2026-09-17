import { AlertCircle, CalendarDays, HardHat, Loader2, MapPin } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"

import { cancelBooking, getMyBookings, requestInstallation } from "@/api/support"
import type { Booking } from "@/api/support"
import { Container } from "@/components/layout/container"
import { StatusBadge } from "@/components/admin/status-badge"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { formatOrderDate } from "@/orders/order-format"

/** Tomorrow, as the earliest date the backend will accept (it requires a future date). */
function minimumDate(): string {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  return date.toISOString().slice(0, 10)
}

/**
 * Installation requests use the real bookings contract: a preferred date, the
 * installation address, and optional notes. Scheduling and installer assignment
 * are done by the PanelScan team afterwards - nothing here is triggered by
 * payment, and no installer's private details are shown before assignment.
 */
export function InstallationPage() {
  useDocumentTitle("Installation | PanelScan")
  const [bookings, setBookings] = useState<Booking[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [scheduledDate, setScheduledDate] = useState("")
  const [address, setAddress] = useState("")
  const [notes, setNotes] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [cancelling, setCancelling] = useState<Booking | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setIsLoading(true)
    getMyBookings(controller.signal)
      .then((result) => { setBookings(result); setError(null) })
      .catch((caughtError) => {
        if (caughtError instanceof DOMException && caughtError.name === "AbortError") return
        setError("Your installation requests could not be loaded. Please try again.")
      })
      .finally(() => { if (!controller.signal.aborted) setIsLoading(false) })
    return () => controller.abort()
  }, [reloadKey])

  async function handleSubmit() {
    if (!scheduledDate) {
      toast.error("Choose a preferred installation date.")
      return
    }
    if (address.trim().length < 10) {
      toast.error("Enter the full installation address (at least 10 characters).")
      return
    }
    setIsSaving(true)
    try {
      await requestInstallation({ scheduledDate: new Date(`${scheduledDate}T09:00:00`).toISOString(), address: address.trim(), notes: notes.trim() || undefined })
      toast.success("Installation request submitted. The team will confirm your schedule.")
      setScheduledDate(""); setAddress(""); setNotes("")
      setReloadKey((value) => value + 1)
    } catch (caughtError) {
      toast.error("Request not submitted", { description: caughtError instanceof Error ? caughtError.message : "Please try again." })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleCancel() {
    if (!cancelling) return
    try {
      await cancelBooking(cancelling.id)
      toast.success("Installation request cancelled.")
      setCancelling(null)
      setReloadKey((value) => value + 1)
    } catch (caughtError) {
      toast.error("Request not cancelled", { description: caughtError instanceof Error ? caughtError.message : "Please try again." })
    }
  }

  return (
    <Container className="py-12 lg:py-16">
      <header className="max-w-2xl">
        <p className="section-eyebrow">Services</p>
        <h1 className="type-h1 mt-4">Panel installation</h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">Request installation for panels you have ordered. Tell us your preferred date and where the work is, and the team will confirm the schedule and assign an installer.</p>
      </header>

      <div className="mt-10 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-12">
        <section aria-labelledby="request-title">
          <h2 id="request-title" className="text-xl font-semibold tracking-[-0.025em]">Request installation</h2>
          <div className="mt-5 space-y-5 surface-card p-6">
            <div className="space-y-2">
              <Label htmlFor="installation-date">Preferred date</Label>
              <Input id="installation-date" type="date" min={minimumDate()} value={scheduledDate} onChange={(event) => setScheduledDate(event.target.value)} />
              <p className="text-xs text-muted-foreground">Must be a future date. The team confirms the final schedule with you.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="installation-address">Installation address</Label>
              <Textarea id="installation-address" rows={3} value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Unit / house number, street, barangay, city" maxLength={500} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="installation-notes">Notes (optional)</Label>
              <Textarea id="installation-notes" rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Which room, surface condition, access or parking details, related order number" maxLength={1000} />
              <p className="text-xs text-muted-foreground">Mentioning your order number here helps the team match the request to your panels.</p>
            </div>
            <Button onClick={() => void handleSubmit()} disabled={isSaving}>
              {isSaving && <Loader2 className="animate-spin" aria-hidden="true" />}Submit request
            </Button>
          </div>

          <div className="mt-6 rounded-lg border-l-2 border-primary bg-secondary/40 p-5">
            <h3 className="font-semibold">What happens next</h3>
            <ol className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
              <li>1. The team reviews your request and confirms the date.</li>
              <li>2. An installer is assigned to the confirmed schedule.</li>
              <li>3. Installation is carried out and the request is marked completed.</li>
            </ol>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">Installation is arranged separately from your order payment. Submitting a request does not charge anything.</p>
          </div>
        </section>

        <aside aria-labelledby="your-requests-title">
          <h2 id="your-requests-title" className="text-xl font-semibold tracking-[-0.025em]">Your requests</h2>
          {error ? (
            <div className="mt-5 rounded-lg border border-destructive/25 bg-destructive/5 p-5 text-center">
              <AlertCircle className="mx-auto size-5 text-destructive" aria-hidden="true" />
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{error}</p>
              <Button variant="outline" size="sm" className="mt-4" onClick={() => setReloadKey((value) => value + 1)}>Try again</Button>
            </div>
          ) : isLoading ? (
            <div className="mt-5 space-y-3"><Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" /></div>
          ) : bookings.length === 0 ? (
            <div className="mt-5 rounded-lg border border-dashed border-border bg-card px-6 py-10 text-center">
              <HardHat className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
              <p className="mt-3 font-medium">No installation requests yet</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Requests you submit appear here with their current status.</p>
            </div>
          ) : (
            <ul className="mt-5 space-y-3">
              {bookings.map((booking) => (
                <li key={booking.id} className="surface-card p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-semibold"><CalendarDays className="size-4 text-primary" aria-hidden="true" />{formatOrderDate(booking.scheduledDate)}</span>
                    <StatusBadge status={booking.status} />
                  </div>
                  <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-muted-foreground"><MapPin className="mt-1 size-3.5 shrink-0" aria-hidden="true" />{booking.address}</p>
                  {booking.notes && <p className="mt-2 text-sm leading-6 text-muted-foreground">{booking.notes}</p>}
                  {booking.installer && <p className="mt-3 border-t border-border pt-3 text-sm">Installer assigned: <span className="font-medium">{booking.installer.firstName} {booking.installer.lastName}</span>{booking.installer.specialty && <span className="text-muted-foreground"> · {booking.installer.specialty}</span>}</p>}
                  {booking.status === "PENDING" && (
                    <Button variant="outline" size="sm" className="mt-4" onClick={() => setCancelling(booking)}>Cancel request</Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>

      <AlertDialog open={Boolean(cancelling)} onOpenChange={(open) => { if (!open) setCancelling(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this installation request?</AlertDialogTitle>
            <AlertDialogDescription>
              Your request for {cancelling ? formatOrderDate(cancelling.scheduledDate) : ""} will be cancelled. Only requests that have not yet been confirmed can be cancelled here — after that, message the team.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep request</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void handleCancel()}>Cancel request</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Container>
  )
}
