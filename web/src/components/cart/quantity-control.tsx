import { Minus, Plus } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface QuantityControlProps {
  value: number
  onChange: (quantity: number) => void
  min?: number
  max?: number
  disabled?: boolean
  productName: string
  onMaxReached?: () => void
}

export function QuantityControl({
  value,
  onChange,
  min = 0,
  max,
  disabled = false,
  productName,
  onMaxReached,
}: QuantityControlProps) {
  const canDecrease = !disabled && value > min
  const isAtMax = max !== undefined && value >= max

  function handleDecrease() {
    if (!canDecrease) return
    const nextValue = max !== undefined && value > max ? Math.max(min, max) : value - 1
    onChange(nextValue)
  }

  function handleIncrease() {
    if (disabled) return
    if (isAtMax) {
      toast.warning("Maximum available stock reached.")
      onMaxReached?.()
      return
    }
    onChange(value + 1)
  }

  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-background" aria-label={`Quantity for ${productName}`}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="rounded-r-none"
        aria-label={`Decrease ${productName} quantity`}
        disabled={!canDecrease}
        onClick={handleDecrease}
      >
        <Minus aria-hidden="true" />
      </Button>
      <span className="min-w-10 px-1 text-center text-sm font-semibold tabular-nums" aria-live="polite" aria-label={`Quantity ${value}`}>
        <span key={value} className="motion-fade inline-block">{value}</span>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={cn("rounded-l-none", isAtMax && "opacity-50 cursor-not-allowed hover:bg-transparent")}
        aria-label={`Increase ${productName} quantity`}
        aria-disabled={isAtMax || disabled}
        disabled={disabled}
        onClick={handleIncrease}
      >
        <Plus aria-hidden="true" />
      </Button>
    </div>
  )
}
