import { Package } from "lucide-react"
import { useState } from "react"

import { cn } from "@/lib/utils"
import type { OrderItem } from "@/types/order"

/** The product's picture, or a neutral package tile when it has none (or it fails to load). */
export function ItemThumbnail({ item, className = "size-16" }: { item: OrderItem; className?: string }) {
  const image = item.product?.images[0]
  const [failed, setFailed] = useState(false)

  if (!image || failed) {
    return (
      <div className={cn("flex shrink-0 items-center justify-center rounded-md border border-border bg-secondary", className)} aria-hidden="true">
        <Package className="size-5 text-primary" />
      </div>
    )
  }
  return (
    <img
      src={image.url}
      alt={image.altText?.trim() || item.productName}
      className={cn("shrink-0 rounded-md border border-border bg-muted object-cover", className)}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}
