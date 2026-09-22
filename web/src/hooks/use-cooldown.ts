import { useCallback, useEffect, useState } from "react"

/** A whole-seconds countdown, used to pace "resend code" so it mirrors the server-side cooldown. */
export function useCooldown() {
  const [remaining, setRemaining] = useState(0)

  useEffect(() => {
    if (remaining <= 0) return
    const timer = window.setTimeout(() => setRemaining((seconds) => seconds - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [remaining])

  const start = useCallback((seconds: number) => setRemaining(seconds), [])

  return { remaining, start }
}
