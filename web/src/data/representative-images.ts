export interface RepresentativeImage {
  src: string
  alt: string
}

export const categoryRepresentativeImages: Record<string, RepresentativeImage> = {
  "wall-panels": { src: "/images/categories/wall-panels.webp", alt: "Representative fluted wall panelling in a wood-look finish behind a modern console" },
  "ceiling-panels": { src: "/images/categories/ceiling-panels.webp", alt: "Representative white PVC ceiling panel installation in a warm modern dining room" },
}
