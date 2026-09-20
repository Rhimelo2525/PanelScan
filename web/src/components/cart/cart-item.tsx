import { AlertTriangle } from "lucide-react"
import { Link } from "react-router-dom"

import { getAvailableQuantity, getCartProductWarning, isCartProductAvailable } from "@/cart/cart-utils"
import { QuantityControl } from "@/components/cart/quantity-control"
import { ProductImage } from "@/components/products/product-image"
import { Checkbox } from "@/components/ui/checkbox"
import { calculateLineTotal, formatMinorUnits, formatProductPrice } from "@/lib/format-price"
import type { CartItem as CartItemType } from "@/types/cart"

interface CartItemProps {
  item: CartItemType
  isPending: boolean
  isSelected: boolean
  onSelectChange: (selected: boolean) => void
  onQuantityChange: (quantity: number) => void
  onRemove?: () => void
}

export function CartItem({ item, isPending, isSelected, onSelectChange, onQuantityChange }: CartItemProps) {
  const { product, quantity } = item
  const available = getAvailableQuantity(product)
  const warning = getCartProductWarning(product, quantity)
  const canUpdate = isCartProductAvailable(product)
  const lineTotal = calculateLineTotal(product.price, quantity)
  const isAtMaxStock = available > 0 && quantity >= available

  return (
    <article
      className="flex items-start gap-3 sm:gap-4 border-b border-border py-6 first:pt-0"
      aria-busy={isPending}
    >
      <div className="pt-2 sm:pt-3 shrink-0">
        <Checkbox
          id={`select-item-${item.id}`}
          checked={isSelected}
          onCheckedChange={(checked) => onSelectChange(Boolean(checked))}
          aria-label={`Select ${product.name}`}
        />
      </div>
      <div className="grid flex-1 gap-5 min-w-0 sm:grid-cols-[8rem_1fr]">
        <Link to={`/products/${product.id}`} className="block focus-visible:rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`View ${product.name}`}>
          <ProductImage image={product.images[0]} productName={product.name} categorySlug="cart-material" className="aspect-[4/3] w-full sm:aspect-square" />
        </Link>
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-[-0.02em]"><Link className="hover:text-primary focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" to={`/products/${product.id}`}>{product.name}</Link></h2>
            <p className="mt-1 text-xs text-muted-foreground">SKU {product.sku} · per {product.unit}</p>
          </div>
          <p className="shrink-0 text-sm font-medium">{formatProductPrice(product.price)}</p>
        </div>

        {warning && <p className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs leading-5 text-destructive"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{warning}</p>}

        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Quantity</p>
            <QuantityControl
              value={quantity}
              min={0}
              max={available}
              disabled={isPending || !canUpdate}
              productName={product.name}
              onChange={onQuantityChange}
            />
            {isAtMaxStock && (
              <p className="mt-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                Maximum available stock reached.
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Line total</p>
            <p className="mt-1 text-lg font-semibold tabular-nums">{lineTotal === null ? "Unavailable" : formatMinorUnits(lineTotal)}</p>
          </div>
        </div>
      </div>
      </div>
    </article>
  )
}
