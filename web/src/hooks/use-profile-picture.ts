import { useEffect, useState } from "react"

import { fetchProfilePicture } from "@/api/auth"

// The picture is access-controlled, so a plain <img src> can't fetch it (an image
// tag can't send the login token). It is fetched once with the token and shown
// from a local object URL. The cache is module-level so every avatar on screen
// shares one request, and coming back to a page costs nothing. Each upload gets
// a new URL (the `?v=` version), so a new picture is a new cache entry.
const MAX_CACHED_PICTURES = 8
const cache = new Map<string, Promise<string>>()

function load(url: string): Promise<string> {
  let entry = cache.get(url)
  if (!entry) {
    entry = fetchProfilePicture(url).then((blob) => URL.createObjectURL(blob))
    cache.set(url, entry)
    // Don't remember failures - the next mount should try again.
    entry.catch(() => cache.delete(url))

    while (cache.size > MAX_CACHED_PICTURES) {
      const oldest = cache.keys().next().value as string
      cache.get(oldest)?.then((objectUrl) => URL.revokeObjectURL(objectUrl), () => undefined)
      cache.delete(oldest)
    }
  }
  return entry
}

/** Drops every cached picture. Called on logout so one customer's photo never lingers in memory for the next person on the same browser. */
export function clearProfilePictureCache() {
  for (const entry of cache.values()) entry.then((objectUrl) => URL.revokeObjectURL(objectUrl), () => undefined)
  cache.clear()
}

interface LoadedPicture {
  url: string
  src: string | null
}

/**
 * Loads a customer's profile picture for display. `src` is null while loading,
 * when there is no picture, and if it fails to load - callers show the initials
 * avatar in all three cases, so a broken or slow image never breaks the page.
 */
export function useProfilePictureSrc(url: string | null | undefined): { src: string | null; isLoading: boolean } {
  const [loaded, setLoaded] = useState<LoadedPicture | null>(null)

  useEffect(() => {
    if (!url) return
    let cancelled = false
    load(url).then(
      (src) => { if (!cancelled) setLoaded({ url, src }) },
      () => { if (!cancelled) setLoaded({ url, src: null }) },
    )
    return () => { cancelled = true }
  }, [url])

  // Only trust a result that belongs to the CURRENT url, so replacing or removing
  // the picture never flashes the previous one.
  const isCurrent = Boolean(url) && loaded?.url === url
  return { src: isCurrent ? loaded!.src : null, isLoading: Boolean(url) && !isCurrent }
}
