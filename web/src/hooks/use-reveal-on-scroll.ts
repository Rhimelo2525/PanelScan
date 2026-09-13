import { useLayoutEffect, useRef } from "react"

/** Safety net: if nothing has revealed the element by now, show it regardless. */
const FAILSAFE_MS = 1200

/**
 * Reveals a section the first time it scrolls into view, then disconnects.
 *
 * Fails open by design. The element renders visible, and this hook only hides
 * it once it has confirmed it can observe it - so if JavaScript never runs, the
 * observer is unsupported, or the page is laid out somewhere the observer never
 * fires (a zero-size frame, print), the content is simply there. A timeout
 * backs that up. Content must never be trapped behind an animation.
 */
export function useRevealOnScroll<T extends HTMLElement>() {
  const ref = useRef<T>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (prefersReducedMotion || typeof IntersectionObserver === "undefined") return

    // Hidden only from here on, before the browser paints, so there is no flash.
    element.classList.add("reveal")

    let timeoutId = 0
    const reveal = () => {
      element.classList.remove("reveal")
      element.classList.add("reveal-in")
      window.clearTimeout(timeoutId)
      observer.disconnect()
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) reveal()
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    )

    observer.observe(element)
    timeoutId = window.setTimeout(reveal, FAILSAFE_MS)

    return () => {
      window.clearTimeout(timeoutId)
      observer.disconnect()
    }
  }, [])

  return ref
}
