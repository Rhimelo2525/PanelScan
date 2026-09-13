import { Star } from "lucide-react"
import { Link } from "react-router-dom"

import { summarizeRatings } from "@/preview/rating-policy"
import { usePreviewRatings } from "@/preview/rating-store"

export function RatingStars({ value }: { value: number }) {
  return <span className="inline-flex gap-0.5 text-primary" role="img" aria-label={`${value} out of 5 stars`}>{[1, 2, 3, 4, 5].map((star) => <Star key={star} className="size-4" fill={star <= Math.round(value) ? "currentColor" : "none"} aria-hidden="true" />)}</span>
}

export function ProductRatings({ productId, detailed = false }: { productId: string; detailed?: boolean }) {
  const ratings = usePreviewRatings()
  const { count, average, reviews } = summarizeRatings(ratings, productId)
  const summary = <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">{average !== null ? <><RatingStars value={average} /><span>{average.toFixed(1)} · {count} preview {count === 1 ? "rating" : "ratings"}</span></> : <><Star className="size-4" aria-hidden="true" /><span>No preview ratings yet</span></>}</div>
  if (!detailed) return <div className="mt-3">{summary}</div>
  return <section className="mt-8 surface-card p-5 sm:p-6" aria-labelledby="product-reviews-title"><h2 id="product-reviews-title" className="text-lg font-semibold">Product ratings &amp; feedback</h2><div className="mt-3">{summary}</div><p className="mt-3 text-sm leading-6 text-muted-foreground">Ratings shown here come from fictional delivered orders in this preview. They are not published customer reviews and clear on reload.</p>{reviews.length > 0 && <ul className="mt-5 divide-y divide-border">{reviews.map((review) => <li key={review.orderId} className="py-4"><p className="mb-2 text-xs font-medium text-muted-foreground">Sample customer · Delivered purchase preview</p><RatingStars value={review.stars} />{review.feedback && <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{review.feedback}</p>}</li>)}</ul>}<Link to="/customer-preview" className="mt-4 inline-block text-sm font-medium underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring">View customer order preview</Link></section>
}
