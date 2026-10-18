import type { Category } from "@/types/category"

export interface ProductImage {
  id: string
  productId: string
  url: string
  altText: string | null
  isPrimary: boolean
  sortOrder: number
  createdAt: string
}

export interface ProductInventory {
  quantity: number
  reservedQty: number
  reorderLevel: number
}

export type PanelProfile = "FLAT" | "FLUTED" | "INVERTED_CIRCLE" | "SPANDREL"

export interface Product {
  id: string
  categoryId: string
  name: string
  slug: string
  description: string | null
  sku: string
  price: string | null
  width: string | null
  height: string | null
  thickness: string | null
  unit: string
  material: string | null
  /** How the app's 3D preview draws the panel; null until a moderator sets it. */
  panelProfile: PanelProfile | null
  /** Grooves across the face (the 5 in "5in1"); null for a flat panel. */
  grooveCount: number | null
  /** A straight-on photo of the panel face; without one the main photo is used. */
  surfaceImageUrl: string | null
  isActive: boolean
  isFeatured: boolean
  deletedAt: string | null
  createdAt: string
  updatedAt: string
  category: Pick<Category, "id" | "name" | "slug">
  images: ProductImage[]
  inventory: ProductInventory | null
}

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface PaginatedProducts {
  products: Product[]
  pagination: PaginationMeta
}

export type ProductSort = "newest" | "name-asc" | "name-desc"

export interface ProductQuery {
  /** Frontend preview category matching; never sent as an API parameter. */
  categorySlug?: string
  search?: string
  categoryId?: string
  sort?: ProductSort
  limit?: number
}
