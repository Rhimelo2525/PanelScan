import { useEffect, useRef } from "react"

/**
 * Re-runs `revalidate` on an interval while the tab is visible, and once
 * immediately whenever the tab becomes visible again after being hidden (so
 * switching back to a backgrounded tab catches up right away rather than
 * waiting out the rest of the interval). A tick is skipped while the
 * previous one is still in flight, so a slow response can't stack requests
 * or let an older response land after a newer one.
 *
 * `revalidate` itself is responsible for only ever applying a successful
 * result (e.g. `load(signal).then(setData)` with no `catch` that clears
 * existing data) - this hook never touches loading/error state, so a
 * transient failure leaves the last-good data on screen instead of
 * blanking the page.
 */
export function useSilentPolling(revalidate: () => Promise<unknown>, intervalMs: number | false): void {
  const revalidateRef = useRef(revalidate)
  revalidateRef.current = revalidate

  useEffect(() => {
    if (!intervalMs) return

    let inFlight = false
    const tick = () => {
      if (document.visibilityState !== "visible" || inFlight) return
      inFlight = true
      void revalidateRef.current().finally(() => { inFlight = false })
    }

    const intervalId = window.setInterval(tick, intervalMs)
    document.addEventListener("visibilitychange", tick)
    return () => {
      window.clearInterval(intervalId)
      document.removeEventListener("visibilitychange", tick)
    }
  }, [intervalMs])
}
