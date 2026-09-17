export interface ProductCategory {
  name: string
  slug: string
  description: string
  visualClass: string
  image: string
  imageAlt: string
}

// Presentation summaries mapped to the actual category slugs in backend/prisma/seed.ts.
export const productCategories: ProductCategory[] = [
  { name: "PVC Wall Panels", slug: "wall-panels", description: "Interior wall panelling that installs over existing surfaces, in fluted and flat profiles.", visualClass: "material-visual--fluted", image: "/images/categories/wall-panels.webp", imageAlt: "Representative fluted wall panelling in a wood-look finish behind a modern console" },
  { name: "PVC Ceiling Panels", slug: "ceiling-panels", description: "Moisture-resistant ceiling panels and tiles for a clean, even ceiling line.", visualClass: "material-visual--ceiling", image: "/images/categories/ceiling-panels.webp", imageAlt: "Representative white PVC ceiling panels in a warm modern dining room" },
]
