import { apiRequest } from "@/api/client"
import type { Category } from "@/types/category"

let cachedCategories: Category[] | null = null
let inFlightRequest: Promise<Category[]> | null = null

export function invalidateCategoriesCache(): void {
  cachedCategories = null
  inFlightRequest = null
}

export async function getCategories(signal?: AbortSignal): Promise<Category[]> {
  if (cachedCategories) {
    return cachedCategories
  }

  if (signal?.aborted) {
    throw new DOMException("The user aborted a request.", "AbortError")
  }

  if (inFlightRequest) {
    return inFlightRequest
  }

  inFlightRequest = apiRequest<{ categories: Category[] }>("/categories")
    .then((data) => {
      cachedCategories = data.categories
      inFlightRequest = null
      return data.categories
    })
    .catch((error) => {
      inFlightRequest = null
      throw error
    })

  return inFlightRequest
}


