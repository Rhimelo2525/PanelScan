import { ArrowUpRight } from "lucide-react"
import { Link } from "react-router-dom"

import { ProductImage } from "@/components/products/product-image"
import { ProductPrice } from "@/components/products/product-price"
import { ProductRatings } from "@/components/products/product-ratings"
import { StockStatus } from "@/components/products/stock-status"
import { Badge } from "@/components/ui/badge"
import { isPvcProduct, panelTypeLabel } from "@/products/panel-types"
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
 * needs: which line it belongs to, its size, availability, and price. The card
 * chrome is deliberately light - a border and the image, not a raised white box.
 */
export function ProductCard({ product, headingLevel = "h2" }: ProductCardProps) {
  const Heading = headingLevel
  const dimensions = product.width && product.height ? `${product.width} × ${product.height} cm` : null
  const isReferenceItem = !isPvcProduct(product)

  return (
    <article className="group flex flex-col">
      <Link to={`/products/${product.id}`} className="card-interactive relative block overflow-hidden rounded-xl border border-transparent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50" aria-label={`View ${product.name}`}>
        <ProductImage
          image={getPrimaryImage(product)}
          productName={product.name}
          categorySlug={product.category.slug}
          className="media-zoom aspect-[4/3]"
        />
        {product.isFeatured && <Badge className="absolute top-3 left-3">Featured</Badge>}
      </Link>

      <div className="mt-4 flex flex-1 flex-col">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="type-label text-primary">{panelTypeLabel(product) ?? product.category.name}</p>
            <Heading className="mt-2 text-lg leading-snug font-semibold tracking-[-0.025em]">
              <Link to={`/products/${product.id}`} className="outline-none transition-colors duration-(--motion-fast) hover:text-primary focus-visible:underline">{product.name}</Link>
            </Heading>
          </div>
          <ArrowUpRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-(--motion-fast) ease-(--ease-standard) group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden="true" />
        </div>

        {dimensions && <p className="mt-2 text-sm text-muted-foreground tabular-nums">{dimensions}</p>}
        <ProductRatings productId={product.id} />
        {isReferenceItem && <p className="mt-2 text-xs leading-5 text-muted-foreground">Reference item — not part of the current PVC range</p>}

        <div className="mt-auto pt-4">
          <StockStatus inventory={product.inventory} compact />
          <ProductPrice price={product.price} returnTo={`/products/${product.id}`} />
        </div>
      </div>
    </article>
  )
}
