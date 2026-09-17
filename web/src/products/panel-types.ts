import type { Category } from "@/types/category"
import type { Product } from "@/types/product"

/**
 * Disenyo Interior Solution sells two things: PVC wall panels and PVC ceiling
 * panels. This module is the single place that knows that, so no page has to
 * compare category strings on its own.
 *
 * The slugs below are the real category slugs seeded in the backend
 * (`wall-panels`, `ceiling-panels`), not invented values. The remaining seeded
 * categories - flooring, partition, cladding - do not correspond to the client's
 * business and are therefore never presented as storefront offerings.
 */

export type PanelType = "wall" | "ceiling"

interface PanelTypeDefinition {
  type: PanelType
  /** Backend category slug. */
  slug: string
  label: string
  shortLabel: string
  /** One line, customer-facing. */
  tagline: string
  description: string
  image: string
  imageAlt: string
}

export const PANEL_TYPES: readonly PanelTypeDefinition[] = [
  {
    type: "wall",
    slug: "wall-panels",
    label: "PVC Wall Panels",
    shortLabel: "Wall panels",
    tagline: "Feature walls, living areas, and commercial interiors.",
    description:
      "Interior wall panelling that installs over existing surfaces without wet work. Available in fluted and flat profiles for feature walls, receptions, and bedrooms.",
    image: "/images/categories/wall-panels.webp",
    imageAlt: "Representative interior with a fluted wall-panel feature behind a low console",
  },
  {
    type: "ceiling",
    slug: "ceiling-panels",
    label: "PVC Ceiling Panels",
    shortLabel: "Ceiling panels",
    tagline: "Clean, moisture-resistant ceilings for homes and shops.",
    description:
      "Ceiling panelling and tiles that stay stable in humid conditions, wipe clean, and give a flat, even ceiling line across living areas, kitchens, and wet zones.",
    image: "/images/categories/ceiling-panels.webp",
    imageAlt: "Representative dining interior with a clean white PVC panelled ceiling",
  },
]

export const IN_SCOPE_CATEGORY_SLUGS: readonly string[] = PANEL_TYPES.map((panel) => panel.slug)

export function panelTypeDefinition(type: PanelType): PanelTypeDefinition {
  return PANEL_TYPES.find((panel) => panel.type === type) ?? PANEL_TYPES[0]
}

export function panelTypeForSlug(slug: string | null | undefined): PanelType | null {
  return PANEL_TYPES.find((panel) => panel.slug === slug)?.type ?? null
}

export function panelTypeForProduct(product: Pick<Product, "category">): PanelType | null {
  return panelTypeForSlug(product.category?.slug)
}

/** Label used on cards and detail pages: "Wall panel" / "Ceiling panel". */
export function panelTypeLabel(product: Pick<Product, "category">): string | null {
  const type = panelTypeForProduct(product)
  if (!type) return null
  return type === "wall" ? "Wall panel" : "Ceiling panel"
}

export function isInScopeCategory(category: Pick<Category, "slug">): boolean {
  return IN_SCOPE_CATEGORY_SLUGS.includes(category.slug)
}

export function inScopeCategories<T extends Pick<Category, "slug">>(categories: T[]): T[] {
  // Ordered to match PANEL_TYPES so wall always precedes ceiling.
  return IN_SCOPE_CATEGORY_SLUGS.map((slug) => categories.find((category) => category.slug === slug)).filter(
    (category): category is T => Boolean(category),
  )
}

export function inScopeProducts<T extends Pick<Product, "category">>(products: T[]): T[] {
  return products.filter((product) => panelTypeForProduct(product) !== null)
}

/**
 * True when the product's own material field identifies PVC. Other seeded
 * wall/ceiling records are labeled as reference items rather than represented
 * as products in the current PVC range.
 */
export function isPvcProduct(product: Pick<Product, "material">): boolean {
  return (product.material ?? "").toLowerCase().includes("pvc")
}

export const REFERENCE_CATALOGUE_NOTICE =
  "Reference catalogue item. This product is not part of Disenyo Interior Solution's current PVC range."
