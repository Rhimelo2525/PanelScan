import { ArrowUpRight } from "lucide-react"
import { Link } from "react-router-dom"

import { ProductImage } from "@/components/products/product-image"
import { ProductPrice } from "@/components/products/product-price"
import { ProductRatings } from "@/components/products/product-ratings"
import { StockStatus } from "@/components/products/stock-status"
import { Badge } from "@/components/ui/badge"
import { formatDimensions } from "@/lib/dimensions"
import { panelTypeLabel } from "@/products/panel-types"
import type { Product } from "@/types/product"

interface ProductCardProps {
  product: Product
  headingLevel?: "h2" | "h3"
}

function getPrimaryImage(product: Product) {
  return product.images.find((image) => image.isPrimary) ?? product.images[0]
}

/**
 * Cards lead with the image and carry only what a customer choosing a panel
 * needs: which line it belongs to, its size, availability, and price. The
 * whole card opens the product: the name's link stretches over all of it
 * (one link, read once by screen readers), while the sign-in-for-price link
 * sits above it and keeps its own target.
 */
export function ProductCard({ product, headingLevel = "h2" }: ProductCardProps) {
  const Heading = headingLevel
  const dimensions = formatDimensions(product.width, product.height, product.thickness)

  return (
    <article className="card-interactive group relative flex flex-col rounded-xl border border-border bg-card p-3 shadow-xs has-[a:focus-visible]:ring-3 has-[a:focus-visible]:ring-ring/50 sm:p-4">
      <div className="relative overflow-hidden rounded-lg">
        <ProductImage
          image={getPrimaryImage(product)}
          productName={product.name}
          categorySlug={product.category.slug}
          className="media-zoom aspect-[4/3]"
        />
        {product.isFeatured && <Badge className="absolute top-3 left-3">Featured</Badge>}
      </div>

      <div className="mt-4 flex flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="type-label text-primary">{panelTypeLabel(product) ?? product.category.name}</p>
            <Heading className="mt-2 text-lg leading-snug font-semibold tracking-[-0.025em]">
              <Link to={`/products/${product.id}`} className="outline-none transition-colors duration-(--motion-fast) group-hover:text-primary after:absolute after:inset-0 after:rounded-xl after:content-['']">{product.name}</Link>
            </Heading>
          </div>
          <ArrowUpRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-(--motion-fast) ease-(--ease-standard) group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
        </div>

        {dimensions && <p className="mt-2 text-sm text-muted-foreground tabular-nums">{dimensions}</p>}
        <ProductRatings productId={product.id} />

        <div className="mt-auto pt-4">
          <StockStatus inventory={product.inventory} compact />
          <ProductPrice price={product.price} returnTo={`/products/${product.id}`} className="relative z-10" />
        </div>
      </div>
    </article>
  )
}
