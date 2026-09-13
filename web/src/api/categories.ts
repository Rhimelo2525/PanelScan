import { apiRequest, isApiConfigured } from "@/api/client"
import { fallbackCategories } from "@/data/catalog-fallback"
import type { Category } from "@/types/category"

const FALLBACK_DELAY_MS = 240

function waitForFallback(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(resolve, FALLBACK_DELAY_MS)
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timeoutId)
      reject(new DOMException("The request was aborted.", "AbortError"))
    }, { once: true })
  })
}

export async function getCategories(signal?: AbortSignal): Promise<Category[]> {
  if (isApiConfigured) {
    const data = await apiRequest<{ categories: Category[] }>("/categories", { signal })
    return data.categories
  }

  await waitForFallback(signal)
  return fallbackCategories
}
