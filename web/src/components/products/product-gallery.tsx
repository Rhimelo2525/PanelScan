import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react"

import { ProductImage } from "@/components/products/product-image"
import { cn } from "@/lib/utils"
import type { Product } from "@/types/product"

/** How much the side view magnifies the photo; the lens covers 1/ZOOM of it. */
const ZOOM = 2.5

interface ProductGalleryProps {
  product: Product
}

export function ProductGallery({ product }: ProductGalleryProps) {
  const sortedImages = useMemo(() => product.images.toSorted((left, right) => Number(right.isPrimary) - Number(left.isPrimary) || left.sortOrder - right.sortOrder), [product.images])
  const firstImageId = sortedImages[0]?.id ?? null
  const [activeImageId, setActiveImageId] = useState<string | null>(firstImageId)

  useEffect(() => setActiveImageId(firstImageId), [product.id, firstImageId])

  const activeImage = sortedImages.find((image) => image.id === activeImageId) ?? sortedImages[0]
  const canZoom = useHoverZoomSupport()
  const imageLoads = useImageLoads(activeImage?.url)

  return (
    <div className="relative">
      {activeImage && canZoom && imageLoads ? (
        <HoverZoomImage url={activeImage.url} alt={activeImage.altText?.trim() || `${product.name} product image`}>
          <ProductImage image={activeImage} productName={product.name} categorySlug={product.category.slug} className="aspect-[4/3] rounded-xl border border-border" />
        </HoverZoomImage>
      ) : (
        <ProductImage image={activeImage} productName={product.name} categorySlug={product.category.slug} className="aspect-[4/3] rounded-xl border border-border" />
      )}
      {sortedImages.length > 1 && (
        <div className="mt-3 flex gap-3 overflow-x-auto pb-2" aria-label="Product image thumbnails">
          {sortedImages.map((image, index) => (
            <button
              key={image.id}
              type="button"
              className={cn("w-24 shrink-0 border bg-card p-1 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50", activeImage?.id === image.id ? "border-primary" : "border-border hover:border-primary/50")}
              onClick={() => setActiveImageId(image.id)}
              onMouseEnter={() => setActiveImageId(image.id)}
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

/**
 * Hover zoom, as on large store sites: a lens follows the pointer over the
 * photo and the part under it shows magnified beside the gallery, over the
 * product details. Mouse only; the photo is unchanged for touch and keyboard.
 */
function HoverZoomImage({ url, alt, children }: { url: string; alt: string; children: ReactNode }) {
  const frameRef = useRef<HTMLDivElement>(null)
  // Lens position in px within the photo, or null while the pointer is away.
  const [lens, setLens] = useState<{ left: number; top: number; width: number; height: number } | null>(null)

  function track(event: MouseEvent<HTMLDivElement>) {
    const frame = frameRef.current
    if (!frame) return
    const box = frame.getBoundingClientRect()
    const width = box.width / ZOOM
    const height = box.height / ZOOM
    const left = Math.min(Math.max(event.clientX - box.left - width / 2, 0), box.width - width)
    const top = Math.min(Math.max(event.clientY - box.top - height / 2, 0), box.height - height)
    setLens({ left, top, width, height })
  }

  return (
    <div ref={frameRef} className="relative cursor-crosshair" onMouseMove={track} onMouseEnter={track} onMouseLeave={() => setLens(null)}>
      {children}
      {lens && (
        <>
          <div
            className="pointer-events-none absolute border border-foreground/40 bg-background/25 shadow-sm"
            style={{ left: lens.left, top: lens.top, width: lens.width, height: lens.height }}
            aria-hidden="true"
          />
          <div
            className="pointer-events-none absolute top-0 left-[calc(100%+2rem)] z-30 hidden aspect-[4/3] w-full overflow-hidden rounded-xl border border-border bg-card shadow-2xl lg:block"
            aria-hidden="true"
          >
            {/* The same photo at ZOOM× size, cropped like the main one, moved so the lens area fills the view. */}
            <img
              src={url}
              alt={alt}
              className="absolute max-w-none object-cover"
              style={{
                width: `${ZOOM * 100}%`,
                height: `${ZOOM * 100}%`,
                left: -lens.left * ZOOM,
                top: -lens.top * ZOOM,
              }}
            />
          </div>
        </>
      )}
    </div>
  )
}

/** True on a desktop with a mouse, where hovering is possible. */
function useHoverZoomSupport(): boolean {
  const query = "(hover: hover) and (pointer: fine) and (min-width: 1024px)"
  const [supported, setSupported] = useState(() => typeof window !== "undefined" && window.matchMedia(query).matches)
  useEffect(() => {
    const media = window.matchMedia(query)
    const update = () => setSupported(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])
  return supported
}

/** Whether the photo actually loads: no zoom over the stand-in shown for a missing one. */
function useImageLoads(url: string | undefined): boolean {
  const [loaded, setLoaded] = useState<string | null>(null)
  useEffect(() => {
    if (!url) return
    const image = new Image()
    image.onload = () => setLoaded(url)
    image.src = url
    return () => { image.onload = null }
  }, [url])
  return Boolean(url) && loaded === url
}
