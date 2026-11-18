import { Star } from "lucide-react"
import { useEffect, useState } from "react"

import { apiRequest } from "@/api/client"

interface ProductFeedbackItem {
  id: string
  rating: number
  comment: string | null
  createdAt: string
  customer: {
    firstName: string
    lastName: string
  }
}

interface ProductFeedbackResponse {
  feedbacks: ProductFeedbackItem[]
  pagination: {
    total: number
  }
}

const feedbackCache = new Map<string, Promise<ProductFeedbackResponse>>()

function fetchProductFeedback(productId: string): Promise<ProductFeedbackResponse> {
  const cached = feedbackCache.get(productId)
  if (cached) return cached

  const request = apiRequest<ProductFeedbackResponse>(
    `/feedback/product/${encodeURIComponent(productId)}?limit=20`,
  ).catch((error) => {
    feedbackCache.delete(productId)
    throw error
  })
  feedbackCache.set(productId, request)
  return request
}

export function RatingStars({ value }: { value: number }) {
  return (
    <span className="inline-flex gap-0.5 text-primary" role="img" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star key={star} className="size-4" fill={star <= Math.round(value) ? "currentColor" : "none"} aria-hidden="true" />
      ))}
    </span>
  )
}

export function ProductRatings({ productId, detailed = false }: { productId?: string; detailed?: boolean }) {
  const [data, setData] = useState<ProductFeedbackResponse | null>(null)

  useEffect(() => {
    if (!productId) return
    let cancelled = false
    fetchProductFeedback(productId)
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch(() => {
        if (!cancelled) setData(null)
      })
    return () => {
      cancelled = true
    }
  }, [productId])

  const feedbacks = data?.feedbacks ?? []
  const totalReviews = data?.pagination.total ?? feedbacks.length
  const averageRating =
    feedbacks.length > 0
      ? feedbacks.reduce((sum, item) => sum + item.rating, 0) / feedbacks.length
      : null

  const summary =
    averageRating !== null && totalReviews > 0 ? (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <RatingStars value={averageRating} />
        <span className="font-medium text-foreground tabular-nums">{averageRating.toFixed(1)}</span>
        <span>
          ({totalReviews} {totalReviews === 1 ? "review" : "reviews"})
        </span>
      </div>
    ) : (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <Star className="size-4 text-muted-foreground/60" aria-hidden="true" />
        <span>No customer reviews yet</span>
      </div>
    )

  if (!detailed) return <div className="mt-3">{summary}</div>

  return (
    <section className="mt-8 surface-card p-5 sm:p-6" aria-labelledby="product-reviews-title">
      <h2 id="product-reviews-title" className="text-lg font-semibold">Customer reviews &amp; ratings</h2>
      <div className="mt-3">{summary}</div>
      {feedbacks.length > 0 ? (
        <ul className="mt-4 divide-y divide-border">
          {feedbacks.map((review) => (
            <li key={review.id} className="py-3.5 first:pt-1 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">
                    {review.customer.lastName
                      ? `${review.customer.firstName} ${review.customer.lastName[0]}.`
                      : review.customer.firstName}
                  </span>
                  <RatingStars value={review.rating} />
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(review.createdAt).toLocaleDateString("en-PH", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </span>
              </div>
              {review.comment && (
                <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{review.comment}</p>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Reviews are submitted by verified customers following completed deliveries.
        </p>
      )}
    </section>
  )
}
