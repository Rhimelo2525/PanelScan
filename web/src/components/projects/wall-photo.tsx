import { ExternalLink, ImageOff } from "lucide-react"
import { useEffect, useState } from "react"

import { fetchProjectWallPhoto } from "@/api/admin"
import { Skeleton } from "@/components/ui/skeleton"

interface LoadedPhoto {
  url: string
  src: string | null
}

/**
 * The photo of the wall the customer measured, with the measured outline and
 * its width and height drawn on it by the app. Staff-only, so it is fetched
 * with the login token (an <img src> can't send one) and shown from a local
 * object URL, released again when the sheet closes.
 */
export function WallPhoto({ url, name }: { url: string | null; name: string }) {
  const [loaded, setLoaded] = useState<LoadedPhoto | null>(null)

  useEffect(() => {
    if (!url) return
    const controller = new AbortController()
    let objectUrl: string | null = null
    fetchProjectWallPhoto(url, controller.signal).then(
      (blob) => {
        objectUrl = URL.createObjectURL(blob)
        setLoaded({ url, src: objectUrl })
      },
      () => { if (!controller.signal.aborted) setLoaded({ url, src: null }) },
    )
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [url])

  // Only a result for the current photo counts, so a replaced one never flashes.
  const current = loaded?.url === url ? loaded : null

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">Measured wall</h3>
        {current?.src && (
          <a href={current.src} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            Open full size<ExternalLink className="size-3" aria-hidden="true" />
          </a>
        )}
      </div>
      {!url ? (
        <p className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
          <ImageOff className="size-4 shrink-0" aria-hidden="true" />No wall photo. It was measured before photos were saved, or by hand.
        </p>
      ) : !current ? (
        <Skeleton className="mt-2 aspect-[3/4] w-full rounded-lg" />
      ) : current.src ? (
        <a href={current.src} target="_blank" rel="noreferrer" className="mt-2 block overflow-hidden rounded-lg border border-border">
          <img src={current.src} alt={`The wall measured for ${name}, with its outline, width and height`} className="block max-h-[28rem] w-full bg-muted object-contain" />
        </a>
      ) : (
        <p className="mt-2 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">The wall photo could not be loaded. Close and open the project to try again.</p>
      )}
    </div>
  )
}
