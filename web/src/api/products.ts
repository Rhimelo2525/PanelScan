import { apiRequest, isApiConfigured } from "@/api/client"
import { findManagedPreviewProduct, getPreviewProducts, selectPreviewCatalog } from "@/preview/product-store"
import type { PaginatedProducts, Product, ProductQuery } from "@/types/product"

const FALLBACK_DELAY_MS = 360

function waitForFallback(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(resolve, FALLBACK_DELAY_MS)
    signal?.addEventListener("abort", () => {
      window.clearTimeout(timeoutId)
      reject(new DOMException("The request was aborted.", "AbortError"))
    }, { once: true })
  })
}

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

function filterFallbackProducts(query: ProductQuery): Product[] {
  const normalizedSearch = query.search?.trim().toLowerCase()
  const products = getPreviewProducts().filter((product) => {
    const matchesCategory = !query.categoryId || product.categoryId === query.categoryId
    const matchesSearch = !normalizedSearch || [product.name, product.description, product.sku, product.material]
      .some((value) => value?.toLowerCase().includes(normalizedSearch))
    return product.isActive && !product.deletedAt && matchesCategory && matchesSearch
  })

  return products.toSorted((left, right) => {
    if (query.sort === "name-asc") return left.name.localeCompare(right.name)
    if (query.sort === "name-desc") return right.name.localeCompare(left.name)
    return Date.parse(right.createdAt) - Date.parse(left.createdAt)
  })
}

export async function getProducts(query: ProductQuery, signal?: AbortSignal): Promise<PaginatedProducts> {
  if (isApiConfigured) {
    const params = buildProductParams(query)
    const result = await apiRequest<PaginatedProducts>(`/products?${params.toString()}`, { signal })
    const products = selectPreviewCatalog(result.products, query, true)
    return { ...result, products, pagination: { ...result.pagination, total: products.length } }
  }

  await waitForFallback(signal)
  const products = filterFallbackProducts(query)
  const limit = query.limit ?? 100

  return {
    products: products.slice(0, limit),
    pagination: { page: 1, limit, total: products.length, totalPages: 1 },
  }
}

export async function getProductById(id: string, signal?: AbortSignal): Promise<Product | null> {
  const preview = findManagedPreviewProduct(id)
  if (preview) return preview.isActive && !preview.deletedAt ? preview : null
  if (isApiConfigured) {
    const data = await apiRequest<{ product: Product }>(`/products/${encodeURIComponent(id)}`, { signal })
    return data.product
  }

  await waitForFallback(signal)
  return getPreviewProducts().find((product) => product.id === id && product.isActive && !product.deletedAt) ?? null
}
