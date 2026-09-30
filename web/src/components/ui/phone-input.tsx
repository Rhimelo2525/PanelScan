import * as React from "react"

import { Input } from "@/components/ui/input"
import { groupPhoneLocalDigits, phoneLocalDigits } from "@/lib/phone"
import { cn } from "@/lib/utils"

const LOCAL_DIGITS = 10

type PhoneInputProps = Omit<React.ComponentProps<"input">, "value" | "onChange" | "type" | "inputMode" | "maxLength"> & {
  /** "+63" plus the digits entered so far ("" when empty); saved values in older formats are read too. */
  value: string
  onChange: (value: string) => void
  /** Classes for the input itself (height etc.); `className` goes on the wrapper (margins). */
  inputClassName?: string
}

/**
 * Philippine contact number field: a fixed "+63" prefix the user cannot remove,
 * followed by at most 10 digits shown as "912 345 6789". Letters and symbols
 * are never accepted; typing past 10 digits is ignored and a longer paste or
 * autofill is cut to 10 (a leading +63 / 63 / 0 in it is understood).
 * Completeness is checked by the form with isValidPhilippinePhone.
 */
function PhoneInput({ value, onChange, className, inputClassName, placeholder = "912 345 6789", autoComplete = "tel", ...props }: PhoneInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const pendingCaret = React.useRef<number | null>(null)
  // A rejected keystroke leaves the value unchanged; re-render anyway so the caret is put back.
  const [, rerender] = React.useReducer((count: number) => count + 1, 0)
  const local = phoneLocalDigits(value)
  const display = groupPhoneLocalDigits(local)

  // Keeps the caret after the same digit once the value is re-grouped.
  React.useLayoutEffect(() => {
    const input = inputRef.current
    const digitsBefore = pendingCaret.current
    pendingCaret.current = null
    if (digitsBefore === null || !input || document.activeElement !== input) return
    let position = 0
    for (let seen = 0; position < display.length && seen < digitsBefore; position++) {
      if (/\d/.test(display[position])) seen++
    }
    input.setSelectionRange(position, position)
  })

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value
    const caret = event.target.selectionStart ?? raw.length
    const inputType = (event.nativeEvent as InputEvent).inputType ?? ""
    let next = phoneLocalDigits(raw)
    let digitsBefore = Math.min(phoneLocalDigits(raw.slice(0, caret)).length, next.length)

    if (inputType === "insertText" && raw.replace(/\D/g, "").length > LOCAL_DIGITS) {
      // Already full: an extra typed digit is not accepted anywhere in the number.
      next = local
      digitsBefore = Math.max(0, digitsBefore - 1)
    } else if (inputType.startsWith("delete") && next === local && raw.length < display.length) {
      // Only a spacer was deleted: remove the digit next to it instead.
      const index = inputType === "deleteContentForward" ? digitsBefore : digitsBefore - 1
      if (index >= 0 && index < local.length) {
        next = local.slice(0, index) + local.slice(index + 1)
        digitsBefore = index
      }
    } else if (!inputType.startsWith("insertText") && !inputType.startsWith("delete")) {
      // Paste, drop or autofill: continue from the end of the number.
      digitsBefore = next.length
    }

    pendingCaret.current = digitsBefore
    rerender()
    onChange(next ? `+63${next}` : "")
  }

  return (
    <div className={cn("relative", className)}>
      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5 text-base text-foreground md:text-sm">+63</span>
      <Input
        {...props}
        ref={inputRef}
        type="tel"
        inputMode="numeric"
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={display}
        onChange={handleChange}
        className={cn("pl-11", inputClassName)}
      />
    </div>
  )
}

export { PhoneInput }
