import { useSyncExternalStore } from "react"

import { customerPreviewOrders } from "@/data/customer-order-preview"
import { ratingError } from "@/preview/rating-policy"
import type { PreviewRating } from "@/preview/rating-policy"

// No browser storage: reload clears both the preview purchases' ratings and reviews.
let ratings: readonly PreviewRating[] = []
const listeners = new Set<() => void>()
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function usePreviewRatings() {
  return useSyncExternalStore(subscribe, () => ratings)
}

export function submitPreviewRating(next: PreviewRating): string | null {
  const error = ratingError(customerPreviewOrders, ratings, next)
  if (error) return error
  ratings = [...ratings, { ...next, feedback: next.feedback.trim(), submittedAt: new Date().toISOString() }]
  listeners.forEach((listener) => listener())
  return null
}
