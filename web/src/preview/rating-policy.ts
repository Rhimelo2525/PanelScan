export interface RatingPurchase {
  id: string
  status: string
  items: readonly { productId: string }[]
}

export interface PreviewRating {
  orderId: string
  productId: string
  stars: number
  feedback: string
  submittedAt?: string
}

export function isDelivered(status: string) {
  return status === "DELIVERED" || status === "COMPLETED"
}

/** Submission checks the purchase itself, not a caller-supplied eligibility flag. */
export function ratingError(orders: readonly RatingPurchase[], ratings: readonly PreviewRating[], next: PreviewRating): string | null {
  const order = orders.find((item) => item.id === next.orderId)
  if (!order || !order.items.some((item) => item.productId === next.productId)) return "This product is not part of the selected order."
  if (!isDelivered(order.status)) return "You can rate this product after delivery is complete."
  if (ratings.some((rating) => rating.orderId === next.orderId && rating.productId === next.productId)) return "You have already rated this product for this order."
  if (!Number.isInteger(next.stars) || next.stars < 1 || next.stars > 5) return "Choose a rating from 1 to 5 stars."
  if (next.feedback.trim().length > 500) return "Keep your feedback to 500 characters or fewer."
  return null
}

export function summarizeRatings(ratings: readonly PreviewRating[], productId: string) {
  const reviews = ratings.filter((rating) => rating.productId === productId)
  return { reviews, count: reviews.length, average: reviews.length ? reviews.reduce((sum, rating) => sum + rating.stars, 0) / reviews.length : null }
}
