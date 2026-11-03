import { ImageOff, ZoomIn } from "lucide-react"
import { useEffect, useState } from "react"

import { fetchProjectWallPhoto } from "@/api/admin"
import { ImageViewer } from "@/components/ui/image-viewer"
import { Skeleton } from "@/components/ui/skeleton"

interface LoadedPhoto {
  url: string
  src: string | null
}

/**
 * The photo of the wall the customer measured, with the measured outline and
 * its width and height drawn on it by the app. Only staff and the project's
 * customer may see it, so it is fetched with the login token (an <img src>
 * can't send one) and shown from a local object URL, released again when the
 * project closes.
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
      </div>
      {!url ? (
        <p className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
          <ImageOff className="size-4 shrink-0" aria-hidden="true" />No wall photo. It was measured before photos were saved, or by hand.
        </p>
      ) : !current ? (
        <Skeleton className="mt-2 aspect-[3/4] w-full rounded-lg" />
      ) : current.src ? (
        <WallPhotoPreview src={current.src} alt={`The wall measured for ${name}, with its outline, width and height`} name={name} />
      ) : (
        <p className="mt-2 rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">The wall photo could not be loaded. Close and open the project to try again.</p>
      )}
    </div>
  )
}

/**
 * The photo in a framed box. A click (or a tap) opens it in the full-screen
 * viewer, where it can be zoomed and moved to read the outline and sizes.
 */
function WallPhotoPreview({ src, alt, name }: { src: string; alt: string; name: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="mt-2 flex justify-center rounded-lg border border-border bg-muted p-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="group relative block w-fit max-w-full cursor-zoom-in overflow-hidden rounded-md shadow-sm ring-1 ring-border focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={`View the measured wall for ${name} full screen`}
        >
          <img src={src} alt={alt} className="block h-auto max-h-[32rem] w-auto max-w-full" />
          <span className="pointer-events-none absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2.5 py-1 text-xs font-medium text-white opacity-90 transition-opacity group-hover:opacity-100" aria-hidden="true">
            <ZoomIn className="size-3.5" />Click to zoom
          </span>
        </button>
      </div>
      <ImageViewer src={src} alt={alt} title={`Measured wall · ${name}`} open={open} onOpenChange={setOpen} />
    </>
  )
}
