import { ImageOff } from "lucide-react"
import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"
import { categoryRepresentativeImages } from "@/data/representative-images"
import type { ProductImage as ProductImageType } from "@/types/product"

type DisplayProductImage = Pick<ProductImageType, "url"> & Partial<Pick<ProductImageType, "altText">>

interface ProductImageProps {
  image?: DisplayProductImage | null
  productName: string
  categorySlug: string
  className?: string
  imageClassName?: string
}

export function ProductImage({ image, productName, categorySlug, className, imageClassName }: ProductImageProps) {
  const [failed, setFailed] = useState(false)
  const [representativeFailed, setRepresentativeFailed] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const representativeImage = categoryRepresentativeImages[categorySlug]

  useEffect(() => { setFailed(false); setIsLoaded(false) }, [image?.url])
  useEffect(() => setRepresentativeFailed(false), [categorySlug])

  if ((!image || failed) && representativeImage && !representativeFailed) {
    return <div className={cn("relative overflow-hidden rounded-xl bg-muted", className)}><img src={representativeImage.src} alt={`${representativeImage.alt}; representative category visualization for ${productName}`} className={cn("media-fade size-full object-cover", imageClassName)} data-loaded={isLoaded} ref={(node) => { if (node?.complete) setIsLoaded(true) }} loading="lazy" onLoad={() => setIsLoaded(true)} onError={() => setRepresentativeFailed(true)} /><span className="absolute right-3 bottom-3 bg-background/88 px-2 py-1 text-[0.6rem] font-semibold backdrop-blur-sm">Representative</span></div>
  }

  if (!image || failed) {
    return (
      <div
        className={cn("product-fallback-visual", `product-fallback-visual--${categorySlug}`, className)}
        role="img"
        aria-label={`${productName} material preview unavailable`}
      >
        <span className="product-fallback-visual__sample" aria-hidden="true" />
        <span className="product-fallback-visual__label"><ImageOff className="size-3.5" aria-hidden="true" /> Material preview</span>
      </div>
    )
  }

  return (
    <div className={cn("overflow-hidden rounded-xl bg-muted", className)}>
      <img
        src={image.url}
        alt={image.altText?.trim() || `${productName} product image`}
        className={cn("media-fade size-full object-cover", imageClassName)}
        data-loaded={isLoaded}
        ref={(node) => { if (node?.complete) setIsLoaded(true) }}
        loading="lazy"
        onLoad={() => setIsLoaded(true)}
        onError={() => setFailed(true)}
      />
    </div>
  )
}
