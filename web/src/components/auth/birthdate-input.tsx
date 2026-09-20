import { Calendar } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import type { ChangeEvent } from "react"

import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

interface BirthdateInputProps {
  id: string
  name: string
  value: string
  onChange: (value: string) => void
  max?: string
  error?: string
  describedBy?: string
  required?: boolean
  className?: string
}

function isoToDisplay(iso: string): string {
  if (!iso) return ""
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return iso
  const [, year, month, day] = match
  return `${month} / ${day} / ${year}`
}

function formatDigits(digits: string): string {
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)} / ${digits.slice(2)}`
  return `${digits.slice(0, 2)} / ${digits.slice(2, 4)} / ${digits.slice(4)}`
}

export function BirthdateInput({
  id,
  name,
  value,
  onChange,
  max,
  error,
  describedBy,
  required,
  className,
}: BirthdateInputProps) {
  const [displayValue, setDisplayValue] = useState(() => isoToDisplay(value))
  const nativePickerRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setDisplayValue(isoToDisplay(value))
  }, [value])

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value

    // If user pasted a full ISO date (e.g. 2000-05-15)
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

    if (digits.length === 8) {
      const mm = digits.slice(0, 2)
      const dd = digits.slice(2, 4)
      const yyyy = digits.slice(4, 8)
      const nextIso = `${yyyy}-${mm}-${dd}`
      onChange(nextIso)
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
        autoComplete="bday"
        placeholder="MM / DD / YYYY"
        value={displayValue}
        onChange={handleInputChange}
        maxLength={14}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        required={required}
        className="h-11 pr-10 font-sans tracking-wide"
      />
      <button
        type="button"
        onClick={openPicker}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none m-0 p-0"
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
        max={max}
        value={value || ""}
        onChange={handleNativeChange}
        className="pointer-events-none absolute left-0 top-0 h-0 w-0 opacity-0 border-0 p-0 m-0 overflow-hidden"
      />
    </div>
  )
}
