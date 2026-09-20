import { Check, Circle } from "lucide-react"

import type { PasswordRequirementsState } from "@/auth/password-policy"
import { cn } from "@/lib/utils"

interface PasswordRequirementsProps {
  requirements: PasswordRequirementsState
  visible?: boolean
  className?: string
}

export function PasswordRequirements({
  requirements,
  visible = true,
  className,
}: PasswordRequirementsProps) {
  if (!visible) return null

  const items = [
    { key: "length", label: "8–16 characters", met: requirements.length },
    { key: "lowercase", label: "a-z lowercase", met: requirements.lowercase },
    { key: "uppercase", label: "A-Z uppercase", met: requirements.uppercase },
    { key: "number", label: "0-9 number", met: requirements.number },
    { key: "special", label: "!@#$% special character", met: requirements.special },
    { key: "noSpaces", label: "no spaces", met: requirements.noSpaces },
  ] as const

  return (
    <div
      className={cn("motion-fade mt-2 text-xs", className)}
      aria-label="Password requirements"
    >
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
        {items.map((item) => (
          <li
            key={item.key}
            className={cn(
              "flex items-center gap-1.5 transition-colors duration-150 select-none py-0.5",
              item.met
                ? "text-emerald-600 dark:text-emerald-400 font-medium"
                : "text-muted-foreground/70"
            )}
          >
            {item.met ? (
              <Check className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            ) : (
              <Circle className="size-1.5 shrink-0 text-muted-foreground/40 fill-muted-foreground/30 mx-1" aria-hidden="true" />
            )}
            <span className="truncate">{item.label}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
