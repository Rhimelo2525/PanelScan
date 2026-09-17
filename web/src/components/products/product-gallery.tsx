import { useEffect, useMemo, useState } from "react"

import { ProductImage } from "@/components/products/product-image"
import { cn } from "@/lib/utils"
import type { Product } from "@/types/product"

interface ProductGalleryProps {
  product: Product
}

export function ProductGallery({ product }: ProductGalleryProps) {
  const sortedImages = useMemo(() => product.images.toSorted((left, right) => Number(right.isPrimary) - Number(left.isPrimary) || left.sortOrder - right.sortOrder), [product.images])
  const firstImageId = sortedImages[0]?.id ?? null
  const [activeImageId, setActiveImageId] = useState<string | null>(firstImageId)

  useEffect(() => setActiveImageId(firstImageId), [product.id, firstImageId])

  const activeImage = sortedImages.find((image) => image.id === activeImageId) ?? sortedImages[0]

  return (
    <div>
      <ProductImage image={activeImage} productName={product.name} categorySlug={product.category.slug} className="aspect-[4/3] rounded-xl border border-border" />
      {sortedImages.length > 1 && (
        <div className="mt-3 flex gap-3 overflow-x-auto pb-2" aria-label="Product image thumbnails">
          {sortedImages.map((image, index) => (
            <button
              key={image.id}
              type="button"
              className={cn("w-24 shrink-0 border bg-card p-1 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50", activeImage?.id === image.id ? "border-primary" : "border-border hover:border-primary/50")}
              onClick={() => setActiveImageId(image.id)}
              aria-label={`Show image ${index + 1} of ${product.name}`}
              aria-pressed={activeImage?.id === image.id}
            >
              <ProductImage image={image} productName={product.name} categorySlug={product.category.slug} className="aspect-square" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
