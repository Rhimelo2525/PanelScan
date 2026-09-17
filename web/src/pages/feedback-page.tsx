import { AlertCircle, Loader2, Star } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"

import { getOrders } from "@/api/orders"
import { getMyFeedback, submitFeedback } from "@/api/support"
import type { CustomerFeedback } from "@/api/support"
import { Container } from "@/components/layout/container"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { formatOrderDate } from "@/orders/order-format"
import { cn } from "@/lib/utils"
import type { Order } from "@/types/order"

const RATINGS = [5, 4, 3, 2, 1]

/**
 * Feedback follows the backend's rules exactly: one entry per order, and only
 * for the customer's own DELIVERED orders. Orders that are not eligible are not
 * offered, so the form cannot produce a rejection the customer can't act on.
 */
export function FeedbackPage() {
  useDocumentTitle("Feedback | PanelScan")
  const [orders, setOrders] = useState<Order[]>([])
  const [feedback, setFeedback] = useState<CustomerFeedback[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [orderId, setOrderId] = useState("")
  const [rating, setRating] = useState("5")
  const [comment, setComment] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setIsLoading(true)
    Promise.all([getOrders({ limit: 50 }, controller.signal), getMyFeedback(controller.signal)])
      .then(([orderResult, feedbackResult]) => {
        if (controller.signal.aborted) return
        setOrders(orderResult.orders)
        setFeedback(feedbackResult)
        setError(null)
      })
      .catch((caughtError) => {
        if (caughtError instanceof DOMException && caughtError.name === "AbortError") return
        setError("Your feedback and orders could not be loaded. Please try again.")
      })
      .finally(() => { if (!controller.signal.aborted) setIsLoading(false) })
    return () => controller.abort()
  }, [reloadKey])

  const eligibleOrders = useMemo(() => {
    const reviewed = new Set(feedback.map((entry) => entry.orderId))
    return orders.filter((order) => order.status === "DELIVERED" && !reviewed.has(order.id))
  }, [orders, feedback])

  async function handleSubmit() {
    if (!orderId) {
      toast.error("Choose which order you are reviewing.")
      return
    }
    setIsSaving(true)
    try {
      await submitFeedback({ orderId, rating: Number(rating), comment: comment.trim() || undefined })
      toast.success("Thank you — your feedback was submitted.")
      setOrderId(""); setComment(""); setRating("5")
      setReloadKey((value) => value + 1)
    } catch (caughtError) {
      toast.error("Feedback not submitted", { description: caughtError instanceof Error ? caughtError.message : "Please try again." })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Container className="py-12 lg:py-16">
      <header className="max-w-2xl">
        <p className="section-eyebrow">Your experience</p>
        <h1 className="type-h1 mt-4">Feedback</h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">Rate a completed order and tell the team how the panels and service worked out. Feedback can be given once per delivered order.</p>
      </header>

      {error ? (
        <div className="mt-10 rounded-lg border border-destructive/25 bg-destructive/5 p-8 text-center">
          <AlertCircle className="mx-auto size-6 text-destructive" aria-hidden="true" />
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{error}</p>
          <Button variant="outline" className="mt-5" onClick={() => setReloadKey((value) => value + 1)}>Try again</Button>
        </div>
      ) : isLoading ? (
        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]"><Skeleton className="h-72 w-full" /><Skeleton className="h-72 w-full" /></div>
      ) : (
        <div className="mt-10 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12">
          <section aria-labelledby="submit-feedback-title">
            <h2 id="submit-feedback-title" className="text-xl font-semibold tracking-[-0.025em]">Leave feedback</h2>

            {eligibleOrders.length === 0 ? (
              <div className="mt-5 rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center">
                <Star className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
                <p className="mt-3 font-medium">No orders are awaiting feedback</p>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">Feedback can be left once an order has been delivered. Orders you have already reviewed are listed alongside.</p>
                <Button variant="outline" className="mt-5" asChild><Link to="/orders">View your orders</Link></Button>
              </div>
            ) : (
              <div className="mt-5 space-y-5 surface-card p-6">
                <div className="space-y-2">
                  <Label htmlFor="feedback-order">Delivered order</Label>
                  <Select value={orderId} onValueChange={setOrderId}>
                    <SelectTrigger id="feedback-order" className="w-full"><SelectValue placeholder="Choose an order" /></SelectTrigger>
                    <SelectContent>
                      {eligibleOrders.map((order) => (
                        <SelectItem key={order.id} value={order.id}>{order.orderNumber} · {formatOrderDate(order.createdAt)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">Rating</legend>
                  <div className="flex flex-wrap gap-2">
                    {RATINGS.map((value) => (
                      <Button
                        key={value}
                        type="button"
                        variant={rating === String(value) ? "secondary" : "outline"}
                        size="sm"
                        aria-pressed={rating === String(value)}
                        onClick={() => setRating(String(value))}
                      >
                        <Star className={cn("size-3.5", rating === String(value) && "fill-current")} aria-hidden="true" />
                        {value} {value === 1 ? "star" : "stars"}
                      </Button>
                    ))}
                  </div>
                </fieldset>

                <div className="space-y-2">
                  <Label htmlFor="feedback-comment">Comments (optional)</Label>
                  <Textarea id="feedback-comment" rows={5} value={comment} onChange={(event) => setComment(event.target.value)} placeholder="How were the panels, the delivery, and the service?" maxLength={1000} />
                  <p className="text-xs text-muted-foreground">If you write a comment, it needs at least 3 characters.</p>
                </div>

                <Button onClick={() => void handleSubmit()} disabled={isSaving}>
                  {isSaving && <Loader2 className="animate-spin" aria-hidden="true" />}Submit feedback
                </Button>
              </div>
            )}
          </section>

          <aside aria-labelledby="past-feedback-title">
            <h2 id="past-feedback-title" className="text-xl font-semibold tracking-[-0.025em]">Your past feedback</h2>
            {feedback.length === 0 ? (
              <p className="mt-5 surface-card p-5 text-sm leading-6 text-muted-foreground">You have not submitted any feedback yet.</p>
            ) : (
              <ul className="mt-5 space-y-3">
                {feedback.map((entry) => (
                  <li key={entry.id} className="surface-card p-5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-1.5 text-sm font-semibold" aria-label={`${entry.rating} out of 5`}>
                        <Star className="size-3.5 fill-current text-[var(--status-warning)]" aria-hidden="true" />{entry.rating}/5
                      </span>
                      <span className="text-xs text-muted-foreground">{formatOrderDate(entry.createdAt)}</span>
                    </div>
                    {entry.order && <p className="mt-2 text-xs text-muted-foreground">Order {entry.order.orderNumber}</p>}
                    {entry.comment && <p className="mt-2 text-sm leading-6">{entry.comment}</p>}
                  </li>
                ))}
              </ul>
            )}
          </aside>
        </div>
      )}
    </Container>
  )
}
