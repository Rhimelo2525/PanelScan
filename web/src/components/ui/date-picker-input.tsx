import { Calendar } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { ChangeEvent } from "react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

export interface DatePickerInputProps {
  id?: string
  name?: string
  value: string
  onChange: (value: string) => void
  min?: string
  max?: string
  placeholder?: string
  disabled?: boolean
  required?: boolean
  className?: string
  inputClassName?: string
  error?: boolean | string
  describedBy?: string
}

function isoToDisplay(iso: string): string {
  if (!iso) return ""
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return iso
  const [, year, month, day] = match
  // Format as MM DD, YY (e.g. 09 25, 26)
  return `${month} ${day}, ${year.slice(2)}`
}

function formatDigits(digits: string): string {
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)} ${digits.slice(2)}`
  if (digits.length <= 6) return `${digits.slice(0, 2)} ${digits.slice(2, 4)}, ${digits.slice(4)}`
  return `${digits.slice(0, 2)} ${digits.slice(2, 4)}, ${digits.slice(4, 8)}`
}

export function DatePickerInput({
  id,
  name,
  value,
  onChange,
  min,
  max,
  placeholder = "MM DD, YY",
  disabled,
  required,
  className,
  inputClassName,
  error,
  describedBy,
}: DatePickerInputProps) {
  const [displayValue, setDisplayValue] = useState(() => isoToDisplay(value))
  const nativePickerRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDisplayValue((currentDisplay) => {
      if (!value) return ""
      // If current input already represents this date, retain user's typed format
      const digits = currentDisplay.replace(/\D/g, "")
      if (digits.length === 6) {
        const mm = digits.slice(0, 2)
        const dd = digits.slice(2, 4)
        const yy = digits.slice(4, 6)
        if (`20${yy}-${mm}-${dd}` === value) {
          return currentDisplay
        }
      } else if (digits.length === 8) {
        const mm = digits.slice(0, 2)
        const dd = digits.slice(2, 4)
        const yyyy = digits.slice(4, 8)
        if (`${yyyy}-${mm}-${dd}` === value) {
          return currentDisplay
        }
      }
      return isoToDisplay(value)
    })
  }, [value])

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value

    // If user pasted a full ISO date (e.g. 2026-09-25)
    const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim())
    if (isoMatch) {
      const nextIso = raw.trim()
      setDisplayValue(isoToDisplay(nextIso))
      onChange(nextIso)
      return
    }

    const digits = raw.replace(/\D/g, "").slice(0, 8)
    const formatted = formatDigits(digits)
    setDisplayValue(formatted)

    if (digits.length === 6) {
      const mm = parseInt(digits.slice(0, 2), 10)
      const dd = parseInt(digits.slice(2, 4), 10)
      const yy = parseInt(digits.slice(4, 6), 10)
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        const yyyy = 2000 + yy
        const nextIso = `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`
        onChange(nextIso)
      } else {
        onChange("")
      }
    } else if (digits.length === 8) {
      const mm = parseInt(digits.slice(0, 2), 10)
      const dd = parseInt(digits.slice(2, 4), 10)
      const yyyy = parseInt(digits.slice(4, 8), 10)
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31 && yyyy >= 2000) {
        const nextIso = `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`
        onChange(nextIso)
      } else {
        onChange("")
      }
    } else if (value !== "") {
      onChange("")
    }
  }

  function handleNativeChange(event: ChangeEvent<HTMLInputElement>) {
    const nextIso = event.target.value
    onChange(nextIso)
    setDisplayValue(isoToDisplay(nextIso))
  }

  function openPicker() {
    if (disabled) return
    const nativeInput = nativePickerRef.current
    if (!nativeInput) return
    try {
      if (typeof nativeInput.showPicker === "function") {
        nativeInput.showPicker()
      } else {
        nativeInput.focus()
        nativeInput.click()
      }
    } catch {
      nativeInput.focus()
      nativeInput.click()
    }
  }

  return (
    <div className={cn("relative", className)}>
      <Input
        id={id}
        name={name}
        type="text"
        inputMode="numeric"
        placeholder={placeholder}
        value={displayValue}
        onChange={handleInputChange}
        onKeyDown={(e) => {
          if (e.key === "F4" || (e.altKey && e.key === "ArrowDown")) {
            e.preventDefault()
            openPicker()
          }
        }}
        maxLength={14}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        required={required}
        className={cn("h-11 pr-10 font-sans tracking-wide", inputClassName)}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={openPicker}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none m-0 p-0 disabled:pointer-events-none disabled:opacity-50"
        aria-label="Open calendar date picker"
        title="Open calendar date picker"
      >
        <Calendar className="size-4 shrink-0" aria-hidden="true" />
      </button>
      <input
        ref={nativePickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        min={min}
        max={max}
        disabled={disabled}
        value={value || ""}
        onChange={handleNativeChange}
        className="pointer-events-none absolute inset-0 opacity-0 -z-10 border-0 p-0 m-0 overflow-hidden"
      />
    </div>
  )
}
