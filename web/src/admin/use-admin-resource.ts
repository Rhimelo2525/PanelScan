import { useCallback, useEffect, useState } from "react"

import { ApiRequestError } from "@/api/client"

/** Admin-specific error copy: a 403 here means the backend, not the UI, decided. */
export function getAdminErrorMessage(error: unknown): string {
  if (!(error instanceof ApiRequestError)) return "This request could not be completed. Please try again."
  if (error.status === 0 || error.status === 503) return "PanelScan services are unavailable right now. Check your connection and try again."
  if (error.status === 401) return "Your session ended. Please sign in again."
  if (error.status === 403) return "Your role does not have access to this data."
  if (error.status === 429) return "Too many requests were made. Please wait a moment and try again."
  if (error.status === 400 || error.status === 404 || error.status === 409) return error.message
  return "This request could not be completed. Please try again."
}

/**
 * Shared load/abort/retry wiring for admin reads. Every admin screen has the
 * same three states (loading, error with retry, data), so they are implemented
 * once instead of in every page.
 */
export function useAdminResource<T>(load: (signal: AbortSignal) => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setIsLoading(true)
    setError(null)
    load(controller.signal)
      .then((result) => { if (!controller.signal.aborted) setData(result) })
      .catch((caughtError) => {
        if (caughtError instanceof DOMException && caughtError.name === "AbortError") return
        if (controller.signal.aborted) return
        setError(getAdminErrorMessage(caughtError))
      })
      .finally(() => { if (!controller.signal.aborted) setIsLoading(false) })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey, ...deps])

  const reload = useCallback(() => setRetryKey((value) => value + 1), [])

  return { data, isLoading, error, reload, setData }
}

/** Debounces a value so table search does not fire a request per keystroke. */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timeoutId)
  }, [value, delayMs])

  return debounced
}
