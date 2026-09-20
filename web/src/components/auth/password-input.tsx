import { Eye, EyeOff } from "lucide-react"
import { useState } from "react"
import type { ReactNode } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface PasswordInputProps {
  id: string
  name: string
  label: string
  value: string
  onChange: (value: string) => void
  onFocus?: (event: React.FocusEvent<HTMLInputElement>) => void
  onBlur?: (event: React.FocusEvent<HTMLInputElement>) => void
  autoComplete: "current-password" | "new-password"
  error?: string
  description?: string
  minLength?: number
  maxLength?: number
  inputClassName?: string
  children?: ReactNode
}

export function PasswordInput({
  id,
  name,
  label,
  value,
  onChange,
  onFocus,
  onBlur,
  autoComplete,
  error,
  description,
  minLength,
  maxLength,
  inputClassName,
  children,
}: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false)
  const errorId = `${id}-error`
  const descriptionId = `${id}-description`
  const describedBy = [description ? descriptionId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative mt-2">
        <Input
          id={id}
          name={name}
          type={isVisible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          className={cn("h-11 pr-10 font-sans", inputClassName)}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          minLength={minLength}
          maxLength={maxLength}
          required
        />
        <button
          type="button"
          onClick={() => setIsVisible((visible) => !visible)}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none m-0 p-0"
          aria-label={isVisible ? "Hide password" : "Show password"}
          aria-pressed={isVisible}
        >
          {isVisible ? (
            <EyeOff className="size-4 shrink-0" aria-hidden="true" />
          ) : (
            <Eye className="size-4 shrink-0" aria-hidden="true" />
          )}
        </button>
      </div>
      {description && <p id={descriptionId} className="mt-1.5 text-xs leading-5 text-muted-foreground">{description}</p>}
      {error && <p id={errorId} className="motion-swap mt-1.5 text-xs text-destructive">{error}</p>}
      {children}
    </div>
  )
}
