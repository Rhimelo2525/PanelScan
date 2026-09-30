import { useState } from "react"
import type { ComponentProps } from "react"

import { Input } from "@/components/ui/input"

/** Must match STOCK_QUANTITY_MAX in the API's inventory validation, which enforces it. */
export const STOCK_QUANTITY_MAX = 99_999
export const STOCK_QUANTITY_MESSAGE = "Stock quantities can have at most 5 digits (up to 99,999)."

function stockInputRejection(value: string): string | null {
  if (!/^\d*$/.test(value)) return "Enter whole numbers only."
  if (value.length > String(STOCK_QUANTITY_MAX).length) return STOCK_QUANTITY_MESSAGE
  return null
}

type StockQuantityInputProps = Omit<ComponentProps<typeof Input>, "value" | "onChange" | "type"> & {
  value: string
  onValueChange: (value: string) => void
}

/**
 * Whole-number stock field capped at 5 digits. A keystroke or paste that would
 * break that is refused whole (the field keeps its value, nothing is cut down
 * to a different number) and the reason is shown under the field.
 */
export function StockQuantityInput({ id, value, onValueChange, onBlur, ...props }: StockQuantityInputProps) {
  const [notice, setNotice] = useState<string | null>(null)
  const noticeId = `${id}-notice`

  return (
    <>
      <Input
        {...props}
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(event) => {
          const next = event.target.value.trim()
          const rejection = stockInputRejection(next)
          setNotice(rejection)
          if (!rejection) onValueChange(next)
        }}
        onBlur={(event) => {
          setNotice(null)
          onBlur?.(event)
        }}
        aria-invalid={Boolean(notice) || props["aria-invalid"]}
        aria-describedby={notice ? noticeId : props["aria-describedby"]}
      />
      {notice && <p id={noticeId} className="text-xs text-destructive">{notice}</p>}
    </>
  )
}
