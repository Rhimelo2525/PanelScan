import { useLayoutEffect, useRef } from "react"
import type { CSSProperties } from "react"

/** If the observer never reports at all (unsupported layout, print), show everything after this. */
const FAILSAFE_MS = 1500

/**
 * Scroll reveal for the landing page: every element marked `data-rv` inside
 * the returned ref animates in the first time it scrolls into view, each on
 * its own (so a long section reveals piece by piece as it is reached).
 * `data-rv="media"` is for images (they open up and zoom out); anything else
 * fades and rises. `stagger(i)` delays an item behind its siblings.
 *
 * Fails open: elements render visible and are hidden only once this hook can
 * observe them; reduced-motion visitors and browsers without
 * IntersectionObserver simply see the content.
 */
export function useScrollReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)

  useLayoutEffect(() => {
    const root = ref.current
    if (!root) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || typeof IntersectionObserver === "undefined") return

    const items = Array.from(root.querySelectorAll<HTMLElement>("[data-rv]"))
    items.forEach((item) => item.classList.add("rv-pending"))

    let heard = false
    const timers: number[] = []
    const show = (item: HTMLElement) => {
      item.classList.remove("rv-pending")
      item.classList.add("rv-in")
      observer.unobserve(item)
      // Once it has arrived, hand the element back its own transitions (button hovers and the like).
      timers.push(window.setTimeout(() => item.classList.remove("rv-in"), 2200))
    }
    const observer = new IntersectionObserver(
      (entries) => {
        heard = true
        entries.forEach((entry) => { if (entry.isIntersecting) show(entry.target as HTMLElement) })
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
    )
    items.forEach((item) => observer.observe(item))
    const failsafe = window.setTimeout(() => { if (!heard) items.forEach(show) }, FAILSAFE_MS)

    return () => {
      window.clearTimeout(failsafe)
      timers.forEach((timer) => window.clearTimeout(timer))
      observer.disconnect()
    }
  }, [])

  return ref
}

/** Delays a revealed item behind its siblings (about 90 ms per step). */
export const stagger = (index: number) => ({ "--i": index }) as CSSProperties

/**
 * Gentle parallax for one image: it drifts a little slower than the page as
 * the page scrolls, while on screen. Writes `--parallax` on the element.
 */
export function useParallax<T extends HTMLElement>(strength = 0.12) {
  const ref = useRef<T>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    let frame = 0
    const update = () => {
      frame = 0
      const rect = element.getBoundingClientRect()
      if (rect.bottom < 0 || rect.top > window.innerHeight) return
      const offset = Math.max(-60, Math.min(60, -rect.top * strength))
      element.style.setProperty("--parallax", `${offset.toFixed(1)}px`)
    }
    const onScroll = () => { if (!frame) frame = window.requestAnimationFrame(update) }
    update()
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll)
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [strength])

  return ref
}
