import { Star } from "lucide-react"

export function RatingStars({ value }: { value: number }) {
  return (
    <span className="inline-flex gap-0.5 text-primary" role="img" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star key={star} className="size-4" fill={star <= Math.round(value) ? "currentColor" : "none"} aria-hidden="true" />
      ))}
    </span>
  )
}

export function ProductRatings({ detailed = false }: { productId?: string; detailed?: boolean }) {
  const summary = (
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
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        Reviews are submitted by verified customers following completed deliveries.
      </p>
    </section>
  )
}

