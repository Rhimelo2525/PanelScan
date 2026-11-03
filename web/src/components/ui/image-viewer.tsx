import { ExternalLink, Minus, Plus, RotateCcw, X } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { useRef, useState } from "react"
import type { PointerEvent, WheelEvent } from "react"

import { Button } from "@/components/ui/button"

const MIN_SCALE = 1
const MAX_SCALE = 5
const BUTTON_STEP = 1.5
const DOUBLE_CLICK_SCALE = 2.5

interface View {
  scale: number
  x: number
  y: number
}

const FIT: View = { scale: 1, x: 0, y: 0 }

/**
 * A full-screen photo viewer over the page. The photo opens fitted to the
 * screen; the mouse wheel, a double-click, the + and - buttons or a two-finger
 * pinch zoom it (up to 5x, around the pointer), and dragging moves it while
 * zoomed. Esc, the X or a click on the dark backdrop closes it.
 */
export function ImageViewer({ src, alt, title, open, onOpenChange }: { src: string; alt: string; title: string; open: boolean; onOpenChange: (open: boolean) => void }) {
  const [view, setView] = useState<View>(FIT)
  const imageRef = useRef<HTMLImageElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  // Pointers down on the photo (one to drag, two to pinch) and where each one was last.
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  // No easing while a finger or the mouse moves the photo, so it follows exactly.
  const [isHeld, setIsHeld] = useState(false)

  function changeOpen(next: boolean) {
    if (!next) setView(FIT)
    onOpenChange(next)
  }

  /** Keeps a zoomed photo from being dragged away: it can move only as far as its own edges. */
  function clamp(next: View): View {
    const image = imageRef.current
    if (!image || next.scale <= MIN_SCALE) return FIT
    const maxX = (image.offsetWidth * (next.scale - 1)) / 2
    const maxY = (image.offsetHeight * (next.scale - 1)) / 2
    return { scale: next.scale, x: Math.min(Math.max(next.x, -maxX), maxX), y: Math.min(Math.max(next.y, -maxY), maxY) }
  }

  /** Zooms to `scale`, keeping the point at (clientX, clientY) where it is (the screen centre when not given). */
  function zoomAt(scale: number, clientX?: number, clientY?: number) {
    setView((current) => {
      const nextScale = Math.min(Math.max(scale, MIN_SCALE), MAX_SCALE)
      const stage = stageRef.current?.getBoundingClientRect()
      const fromCentreX = stage && clientX !== undefined ? clientX - (stage.left + stage.width / 2) : 0
      const fromCentreY = stage && clientY !== undefined ? clientY - (stage.top + stage.height / 2) : 0
      const ratio = nextScale / current.scale
      return clamp({ scale: nextScale, x: fromCentreX - (fromCentreX - current.x) * ratio, y: fromCentreY - (fromCentreY - current.y) * ratio })
    })
  }

  function handleWheel(event: WheelEvent<HTMLDivElement>) {
    zoomAt(view.scale * (event.deltaY < 0 ? 1.15 : 1 / 1.15), event.clientX, event.clientY)
  }

  function handlePointerDown(event: PointerEvent<HTMLImageElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })
    setIsHeld(true)
  }

  function handlePointerMove(event: PointerEvent<HTMLImageElement>) {
    const previous = pointers.current.get(event.pointerId)
    if (!previous) return
    const others = [...pointers.current.entries()].filter(([id]) => id !== event.pointerId).map(([, point]) => point)
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY })

    const other = others[0]
    if (other) {
      // Pinch: zoom by how much the two fingers spread, around the point between them.
      const before = Math.hypot(previous.x - other.x, previous.y - other.y)
      const after = Math.hypot(event.clientX - other.x, event.clientY - other.y)
      if (before > 0) zoomAt(view.scale * (after / before), (event.clientX + other.x) / 2, (event.clientY + other.y) / 2)
      return
    }
    if (view.scale > MIN_SCALE) {
      const dx = event.clientX - previous.x
      const dy = event.clientY - previous.y
      setView((current) => clamp({ ...current, x: current.x + dx, y: current.y + dy }))
    }
  }

  function handlePointerUp(event: PointerEvent<HTMLImageElement>) {
    pointers.current.delete(event.pointerId)
    if (pointers.current.size === 0) setIsHeld(false)
  }

  const isZoomed = view.scale > MIN_SCALE

  return (
    <DialogPrimitive.Root open={open} onOpenChange={changeOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/85 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content className="fixed inset-0 z-50 flex flex-col outline-none" aria-describedby={undefined}>
          <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
            <DialogPrimitive.Title className="truncate text-sm font-medium">{title}</DialogPrimitive.Title>
            <div className="flex shrink-0 items-center gap-1">
              <Button type="button" variant="ghost" size="icon-sm" className="text-white hover:bg-white/15 hover:text-white" onClick={() => zoomAt(view.scale / BUTTON_STEP)} disabled={!isZoomed} aria-label="Zoom out"><Minus aria-hidden="true" /></Button>
              <span className="w-12 text-center text-xs tabular-nums" aria-live="polite">{Math.round(view.scale * 100)}%</span>
              <Button type="button" variant="ghost" size="icon-sm" className="text-white hover:bg-white/15 hover:text-white" onClick={() => zoomAt(view.scale * BUTTON_STEP)} disabled={view.scale >= MAX_SCALE} aria-label="Zoom in"><Plus aria-hidden="true" /></Button>
              <Button type="button" variant="ghost" size="icon-sm" className="text-white hover:bg-white/15 hover:text-white" onClick={() => setView(FIT)} disabled={!isZoomed} aria-label="Fit to screen"><RotateCcw aria-hidden="true" /></Button>
              <Button type="button" variant="ghost" size="icon-sm" className="text-white hover:bg-white/15 hover:text-white" asChild>
                <a href={src} target="_blank" rel="noreferrer" aria-label="Open in a new tab"><ExternalLink aria-hidden="true" /></a>
              </Button>
              <DialogPrimitive.Close asChild>
                <Button type="button" variant="ghost" size="icon-sm" className="ml-1 text-white hover:bg-white/15 hover:text-white" aria-label="Close"><X aria-hidden="true" /></Button>
              </DialogPrimitive.Close>
            </div>
          </div>
          {/* A click on the backdrop around the photo closes the viewer. */}
          <div
            ref={stageRef}
            className="relative flex min-h-0 flex-1 touch-none items-center justify-center overflow-hidden px-4 pb-4"
            onWheel={handleWheel}
            onClick={(event) => { if (event.target === event.currentTarget) changeOpen(false) }}
          >
            <img
              ref={imageRef}
              src={src}
              alt={alt}
              draggable={false}
              className={`max-h-full max-w-full select-none object-contain ${isZoomed ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`}
              style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})`, transition: isHeld ? "none" : "transform 120ms ease-out" }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onDoubleClick={(event) => (isZoomed ? setView(FIT) : zoomAt(DOUBLE_CLICK_SCALE, event.clientX, event.clientY))}
            />
          </div>
          <p className="pb-3 text-center text-xs text-white/60">Scroll or pinch to zoom · drag to move · double-click to zoom in or out · Esc to close</p>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
