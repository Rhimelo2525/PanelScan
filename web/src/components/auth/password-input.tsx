import { Eye, EyeOff } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

interface PasswordInputProps {
  id: string
  name: string
  label: string
  value: string
  onChange: (value: string) => void
  autoComplete: "current-password" | "new-password"
  error?: string
  description?: string
  minLength?: number
  maxLength?: number
  inputClassName?: string
}

export function PasswordInput({ id, name, label, value, onChange, autoComplete, error, description, minLength, maxLength, inputClassName }: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false)
  const errorId = `${id}-error`
  const descriptionId = `${id}-description`
  const describedBy = [description ? descriptionId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative mt-2">
        <Input id={id} name={name} type={isVisible ? "text" : "password"} autoComplete={autoComplete} value={value} onChange={(event) => onChange(event.target.value)} className={cn("h-11 pr-11", inputClassName)} aria-invalid={Boolean(error)} aria-describedby={describedBy} minLength={minLength} maxLength={maxLength} required />
        <Button type="button" variant="ghost" size="icon" className="absolute top-1/2 right-1.5 -translate-y-1/2" onClick={() => setIsVisible((visible) => !visible)} aria-label={isVisible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} aria-pressed={isVisible}>
          {isVisible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </Button>
      </div>
      {description && <p id={descriptionId} className="mt-1.5 text-xs leading-5 text-muted-foreground">{description}</p>}
      {error && <p id={errorId} className="motion-swap mt-1.5 text-xs text-destructive">{error}</p>}
    </div>
  )
}
