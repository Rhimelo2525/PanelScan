import { apiRequest } from "@/api/client"
import type { Category } from "@/types/category"

export async function getCategories(signal?: AbortSignal): Promise<Category[]> {
  const data = await apiRequest<{ categories: Category[] }>("/categories", { signal })
  return data.categories
}

