import { Minus, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"

interface QuantityControlProps {
  value: number
  onChange: (quantity: number) => void
  min?: number
  max?: number
  disabled?: boolean
  productName: string
}

export function QuantityControl({ value, onChange, min = 1, max, disabled = false, productName }: QuantityControlProps) {
  const canDecrease = !disabled && value > min
  const canIncrease = !disabled && (max === undefined || value < max)

  return (
    <div className="inline-flex items-center rounded-lg border border-border bg-background" aria-label={`Quantity for ${productName}`}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="rounded-r-none"
        aria-label={`Decrease ${productName} quantity`}
        disabled={!canDecrease}
        onClick={() => onChange(max !== undefined && value > max ? Math.max(min, max) : value - 1)}
      >
        <Minus aria-hidden="true" />
      </Button>
      <span className="min-w-10 px-1 text-center text-sm font-semibold tabular-nums" aria-live="polite" aria-label={`Quantity ${value}`}><span key={value} className="motion-fade inline-block">{value}</span></span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="rounded-l-none"
        aria-label={`Increase ${productName} quantity`}
        disabled={!canIncrease}
        onClick={() => onChange(value + 1)}
      >
        <Plus aria-hidden="true" />
      </Button>
    </div>
  )
}
