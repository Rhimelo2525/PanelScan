import type { ElementType, ReactNode } from "react"

import { useRevealOnScroll } from "@/hooks/use-reveal-on-scroll"
import { cn } from "@/lib/utils"

interface RevealSectionProps {
  children: ReactNode
  className?: string
  /** Defaults to <section>; pass "div" where a section landmark would be wrong. */
  as?: ElementType
  "aria-labelledby"?: string
  "aria-label"?: string
  id?: string
}

/**
 * Wraps a homepage section so it fades up once as it first comes into view.
 * Content is present in the DOM from the start and renders visible by default -
 * the hook hides it only once it can guarantee it will reveal it again. Reading
 * order, indexing, and screen-reader access are unaffected either way.
 */
export function RevealSection({ children, className, as: Component = "section", ...rest }: RevealSectionProps) {
  const ref = useRevealOnScroll<HTMLElement>()
  return (
    <Component ref={ref} className={cn(className)} {...rest}>
      {children}
    </Component>
  )
}
