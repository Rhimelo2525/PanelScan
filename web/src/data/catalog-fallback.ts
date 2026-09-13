import type { Category } from "@/types/category"
import type { Product, ProductInventory } from "@/types/product"

const timestamp = "2026-08-01T00:00:00.000Z"

export const fallbackCategories: Category[] = [
  { id: "11111111-1111-4111-8111-111111111111", name: "PVC Wall Panels", slug: "wall-panels", description: "Decorative and acoustic wall panels.", imageUrl: null, isActive: true, createdAt: timestamp, updatedAt: timestamp },
  { id: "22222222-2222-4222-8222-222222222222", name: "PVC Ceiling Panels", slug: "ceiling-panels", description: "Ceiling panel systems and tiles.", imageUrl: null, isActive: true, createdAt: timestamp, updatedAt: timestamp },
]

interface FallbackSeed {
  id: string
  name: string
  categorySlug: string
  sku: string
  price: number
  width: number
  height: number
  thickness: number
  material: string
  inventory: ProductInventory | null
  featured?: boolean
}

// Preview records mirror the current product contract and are restricted to the two supported panel lines.
const fallbackSeeds: FallbackSeed[] = [
  { id: "a1111111-1111-4111-8111-111111111111", name: "Oak Veneer Wall Panel", categorySlug: "wall-panels", sku: "WP-OAK-001", price: 1850, width: 60, height: 240, thickness: 1.2, material: "Oak Veneer", inventory: { quantity: 42, reservedQty: 3, reorderLevel: 15 }, featured: true },
  { id: "a2222222-2222-4222-8222-222222222222", name: "Acoustic Fabric Wall Panel", categorySlug: "wall-panels", sku: "WP-ACO-002", price: 2100, width: 60, height: 120, thickness: 2.5, material: "Fabric-wrapped Foam", inventory: { quantity: 9, reservedQty: 1, reorderLevel: 15 } },
  { id: "a3333333-3333-4333-8333-333333333333", name: "PVC Ceiling Tile", categorySlug: "ceiling-panels", sku: "CP-PVC-001", price: 450, width: 60, height: 60, thickness: 0.8, material: "PVC", inventory: { quantity: 65, reservedQty: 4, reorderLevel: 15 }, featured: true },
  { id: "a4444444-4444-4444-8444-444444444444", name: "Gypsum Ceiling Panel", categorySlug: "ceiling-panels", sku: "CP-GYP-002", price: 620, width: 120, height: 60, thickness: 1, material: "Gypsum", inventory: { quantity: 4, reservedQty: 4, reorderLevel: 15 } },
]

export const fallbackProducts: Product[] = fallbackSeeds.map((seed, index) => {
  const category = fallbackCategories.find((item) => item.slug === seed.categorySlug)

  if (!category) {
    throw new Error(`Missing fallback category: ${seed.categorySlug}`)
  }

  return {
    id: seed.id,
    categoryId: category.id,
    name: seed.name,
    slug: seed.sku.toLowerCase(),
    description: `${seed.name} - premium ${seed.material} panel for interior projects.`,
    sku: seed.sku,
    price: seed.price.toFixed(2),
    width: String(seed.width),
    height: String(seed.height),
    thickness: String(seed.thickness),
    unit: "piece",
    material: seed.material,
    isActive: true,
    isFeatured: seed.featured ?? false,
    deletedAt: null,
    createdAt: `2026-08-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
    updatedAt: timestamp,
    category: { id: category.id, name: category.name, slug: category.slug },
    images: [],
    inventory: seed.inventory,
  }
})
