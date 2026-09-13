import { useSyncExternalStore } from "react"

import { adminPreviewCapabilities } from "@/admin/admin-preview-capabilities"
import type { AdminPreviewRole } from "@/admin/admin-preview-capabilities"
import { fallbackCategories, fallbackProducts } from "@/data/catalog-fallback"
import { parsePriceToMinorUnits } from "@/lib/format-price"
import { validateProductDraft } from "@/preview/product-policy"
import type { ProductDraft } from "@/preview/product-policy"
import type { Product, ProductQuery } from "@/types/product"

export interface PreviewProduct extends Product { previewSource: "EXISTING" | "MODERATOR" }
let products: readonly PreviewProduct[] = fallbackProducts.map((product) => ({ ...product, previewSource: "EXISTING" }))
const editedIds = new Set<string>()
const listeners = new Set<() => void>()
function subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } }
export function usePreviewProducts() { return useSyncExternalStore(subscribe, () => products) }
export function getPreviewProducts() { return products }
export function isManagedPreviewProduct(id: string) { return editedIds.has(id) }
export function findManagedPreviewProduct(id: string) { return products.find((product) => product.id === id && editedIds.has(id)) }

export function selectPreviewCatalog(base: readonly Product[], query: ProductQuery, overlay = false) {
  const combined = overlay ? [...base.filter((product) => !editedIds.has(product.id)), ...products.filter((product) => editedIds.has(product.id))] : [...base]
  const search = query.search?.trim().toLowerCase()
  return combined.filter((product) => product.isActive && !product.deletedAt && (query.categorySlug ? product.category.slug === query.categorySlug : !query.categoryId || product.categoryId === query.categoryId) && (!search || [product.name, product.sku, product.material, product.description].some((value) => value?.toLowerCase().includes(search))))
    .sort((a, b) => query.sort === "name-asc" ? a.name.localeCompare(b.name) : query.sort === "name-desc" ? b.name.localeCompare(a.name) : Date.parse(b.createdAt) - Date.parse(a.createdAt))
}

/** Owns a saved blob URL until it is replaced/removed or the document closes. */
export function savePreviewProduct(role: AdminPreviewRole, draft: ProductDraft, imageUrl: string | null, id?: string): { product?: PreviewProduct; errors: Record<string, string> } {
  if (!adminPreviewCapabilities[role].manageProducts) return { errors: { form: "Only Moderators can change the preview catalog." } }
  const errors = validateProductDraft(draft, fallbackCategories.map((category) => category.id))
  const previous = id ? products.find((product) => product.id === id) : undefined
  if (id && !previous) errors.form = "This product is no longer available."
  if (!previous && !imageUrl) errors.image = "Choose an image for the new product."
  if (Object.keys(errors).length) return { errors }
  const category = fallbackCategories.find((item) => item.id === draft.categoryId)!
  const productId = previous?.id ?? `preview-${crypto.randomUUID()}`
  const now = new Date().toISOString()
  const minorUnits = parsePriceToMinorUnits(draft.price)!
  const product: PreviewProduct = {
    id: productId, categoryId: category.id, category: { id: category.id, name: category.name, slug: category.slug },
    name: draft.name.trim(), slug: previous?.slug ?? productId, sku: previous?.sku ?? `DEMO-${productId.slice(-8).toUpperCase()}`,
    description: draft.description.trim(), price: `${Math.floor(minorUnits / 100)}.${String(minorUnits % 100).padStart(2, "0")}`, material: draft.material.trim(),
    width: previous?.width ?? null, height: previous?.height ?? null, thickness: previous?.thickness ?? null, unit: previous?.unit ?? "piece",
    isActive: draft.status === "ACTIVE", isFeatured: previous?.isFeatured ?? false, deletedAt: null,
    createdAt: previous?.createdAt ?? now, updatedAt: now,
    inventory: { quantity: Number(draft.quantity), reservedQty: 0, reorderLevel: previous?.inventory?.reorderLevel ?? 10 },
    images: imageUrl ? [{ id: `${productId}-image-${now}`, productId, url: imageUrl, altText: draft.name.trim(), isPrimary: true, sortOrder: 0, createdAt: now }] : [],
    previewSource: previous?.previewSource ?? "MODERATOR",
  }
  for (const image of previous?.images ?? []) if (image.url.startsWith("blob:") && image.url !== imageUrl) URL.revokeObjectURL(image.url)
  products = previous ? products.map((item) => item.id === productId ? product : item) : [product, ...products]
  editedIds.add(productId)
  listeners.forEach((listener) => listener())
  return { product, errors: {} }
}

// Browser document teardown releases blob URLs automatically. Explicitly release
// on module disposal too, so local hot reload does not leave abandoned images.
if (import.meta.hot) import.meta.hot.dispose(() => {
  products.forEach((product) => product.images.forEach((image) => { if (image.url.startsWith("blob:")) URL.revokeObjectURL(image.url) }))
})
