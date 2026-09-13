import { apiRequest } from "@/api/client"
import type { PaginatedProducts, Product, ProductQuery } from "@/types/product"

function buildProductParams(query: ProductQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (query.search) params.set("search", query.search)
  if (query.categoryId) params.set("categoryId", query.categoryId)
  if (query.limit) params.set("limit", String(query.limit))

  if (query.sort === "name-asc") {
    params.set("sortBy", "name")
    params.set("sortOrder", "asc")
  } else if (query.sort === "name-desc") {
    params.set("sortBy", "name")
    params.set("sortOrder", "desc")
  } else {
    params.set("sortBy", "createdAt")
    params.set("sortOrder", "desc")
  }

  return params
}

export async function getProducts(query: ProductQuery, signal?: AbortSignal): Promise<PaginatedProducts> {
  const params = buildProductParams(query)
  return apiRequest<PaginatedProducts>(`/products?${params.toString()}`, { signal, authenticated: true })
}

export async function getProductById(id: string, signal?: AbortSignal): Promise<Product | null> {
  const data = await apiRequest<{ product: Product }>(`/products/${encodeURIComponent(id)}`, { signal, authenticated: true })
  return data.product
}
