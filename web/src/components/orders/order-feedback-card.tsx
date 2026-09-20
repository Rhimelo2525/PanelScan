import { Loader2, Star } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { submitFeedback, type CustomerFeedback } from "@/api/support"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatOrderDate } from "@/orders/order-format"
import { getOrderErrorMessage } from "@/orders/order-errors"
import type { Order } from "@/types/order"

interface OrderFeedbackCardProps {
  order: Order
  onFeedbackSubmitted?: (feedback: CustomerFeedback) => void
}

export function OrderFeedbackCard({ order, onFeedbackSubmitted }: OrderFeedbackCardProps) {
  const [rating, setRating] = useState<number>(0)
  const [hoverRating, setHoverRating] = useState<number>(0)
  const [comment, setComment] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Read-only mode if feedback already exists for this order
  if (order.feedback) {
    const feedback = order.feedback
    return (
      <section
        id="feedback"
        className="surface-card scroll-mt-20 p-6 sm:p-8"
        aria-labelledby="feedback-submitted-title"
      >
        <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
          Your feedback
        </p>
        <h2 id="feedback-submitted-title" className="sr-only">
          Customer review for {order.orderNumber}
        </h2>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex items-center gap-1" aria-label={`Rating: ${feedback.rating} out of 5 stars`}>
            {[1, 2, 3, 4, 5].map((star) => (
              <Star
                key={star}
                className={cn(
                  "size-5",
                  star <= feedback.rating
                    ? "fill-amber-400 text-amber-400"
                    : "text-muted-foreground/30"
                )}
                aria-hidden="true"
              />
            ))}
          </div>
          <span className="text-sm font-semibold text-foreground">
            {feedback.rating} out of 5
          </span>
        </div>

        {feedback.comment && (
          <blockquote className="mt-4 rounded-lg border border-border/70 bg-secondary/30 p-4 text-sm leading-6 italic text-foreground">
            "{feedback.comment}"
          </blockquote>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-4 text-xs text-muted-foreground">
          <span>Submitted {formatOrderDate(feedback.createdAt)}</span>
          <span className="font-medium text-primary">Thank you for your feedback.</span>
        </div>
      </section>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (rating < 1 || rating > 5) {
      setError("Please select a rating between 1 and 5 stars.")
      return
    }

    const trimmedComment = comment.trim()
    if (trimmedComment.length > 0 && trimmedComment.length < 3) {
      setError("Comment must be at least 3 characters if provided.")
      return
    }

    setIsSubmitting(true)
    try {
      const created = await submitFeedback({
        orderId: order.id,
        rating,
        comment: trimmedComment ? trimmedComment : undefined,
      })
      toast.success("Thank you for your feedback!")
      onFeedbackSubmitted?.(created)
    } catch (caughtError) {
      const msg = getOrderErrorMessage(caughtError)
      setError(msg)
      toast.error("Feedback could not be submitted", { description: msg })
    } finally {
      setIsSubmitting(false)
    }
  }

  const activeStar = hoverRating || rating

  return (
    <section
      id="feedback"
      className="surface-card scroll-mt-20 p-6 sm:p-8"
      aria-labelledby="feedback-form-title"
    >
      <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
        How was your experience?
      </p>
      <h2 id="feedback-form-title" className="type-h3 mt-2">
        Your order has been delivered.
      </h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">
        We'd appreciate your feedback.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <div>
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">
              Rating <span className="text-destructive">*</span>
            </label>
            {activeStar > 0 && (
              <span className="text-xs font-medium text-muted-foreground">
                {activeStar} of 5 stars
              </span>
            )}
          </div>

          <div
            className="mt-2.5 flex items-center gap-1.5"
            role="radiogroup"
            aria-label="Order rating 1 to 5 stars"
          >
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                role="radio"
                aria-checked={rating === star}
                aria-label={`${star} star${star > 1 ? "s" : ""}`}
                onClick={() => {
                  setRating(star)
                  setError(null)
                }}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                className={cn(
                  "group relative rounded-md p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                  "hover:bg-amber-400/10"
                )}
              >
                <Star
                  className={cn(
                    "size-7 transition-transform group-hover:scale-110",
                    star <= activeStar
                      ? "fill-amber-400 text-amber-400"
                      : "text-muted-foreground/40"
                  )}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="feedback-comment" className="text-sm font-medium text-foreground">
            Comments
          </label>
          <p className="mt-0.5 text-xs text-muted-foreground">Optional</p>
          <textarea
            id="feedback-comment"
            rows={4}
            value={comment}
            onChange={(e) => {
              setComment(e.target.value)
              if (error) setError(null)
            }}
            placeholder="Tell us about your experience with your order, delivery, or installation."
            className="mt-2 flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 resize-y"
            maxLength={1000}
            disabled={isSubmitting}
          />
          <div className="mt-1 flex justify-end">
            <span className="text-[11px] text-muted-foreground">{comment.length} / 1000</span>
          </div>
        </div>

        {error && (
          <p className="text-xs font-medium text-destructive" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" disabled={isSubmitting || rating === 0}>
          {isSubmitting && <Loader2 className="animate-spin" aria-hidden="true" />}
          Submit feedback
        </Button>
      </form>
    </section>
  )
}
