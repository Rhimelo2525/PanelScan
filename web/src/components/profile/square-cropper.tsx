import { useEffect, useRef } from "react"
import type { KeyboardEvent, PointerEvent } from "react"

import { clampCrop, cropSide, drawCrop, MAX_ZOOM, MIN_ZOOM, PROFILE_PICTURE_OUTPUT_PX } from "@/lib/profile-picture"
import type { CropState, DecodedImage } from "@/lib/profile-picture"

interface SquareCropperProps {
  image: DecodedImage
  crop: CropState
  onChange: (crop: CropState) => void
  disabled?: boolean
}

const KEYBOARD_PAN_FRACTION = 0.05
const KEYBOARD_ZOOM_STEP = 0.1

/**
 * A square crop window: drag to move the photo, slider / +/- to zoom. The
 * canvas is drawn at the real output size with the same routine the upload
 * uses, so the preview is exactly what will be saved; the circle is only an
 * overlay showing how the avatar will be masked.
 */
export function SquareCropper({ image, crop, onChange, disabled }: SquareCropperProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const dragStart = useRef<{ x: number; y: number; crop: CropState } | null>(null)

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d")
    if (ctx) drawCrop(ctx, image, crop, PROFILE_PICTURE_OUTPUT_PX)
  }, [image, crop])

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    if (disabled) return
    event.currentTarget.setPointerCapture(event.pointerId)
    dragStart.current = { x: event.clientX, y: event.clientY, crop }
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const start = dragStart.current
    const frame = frameRef.current
    if (!start || !frame) return
    // Screen pixels moved -> source pixels moved. Dragging right pulls the photo right, so the window moves left.
    const sourcePerScreenPixel = cropSide(image, start.crop.zoom) / frame.getBoundingClientRect().width
    onChange(
      clampCrop(image, {
        ...start.crop,
        centerX: start.crop.centerX - (event.clientX - start.x) * sourcePerScreenPixel,
        centerY: start.crop.centerY - (event.clientY - start.y) * sourcePerScreenPixel,
      }),
    )
  }

  function endDrag() {
    dragStart.current = null
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return
    const step = cropSide(image, crop.zoom) * KEYBOARD_PAN_FRACTION
    const moves: Record<string, Partial<CropState>> = {
      ArrowLeft: { centerX: crop.centerX - step },
      ArrowRight: { centerX: crop.centerX + step },
      ArrowUp: { centerY: crop.centerY - step },
      ArrowDown: { centerY: crop.centerY + step },
      "+": { zoom: crop.zoom + KEYBOARD_ZOOM_STEP },
      "=": { zoom: crop.zoom + KEYBOARD_ZOOM_STEP },
      "-": { zoom: crop.zoom - KEYBOARD_ZOOM_STEP },
    }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    onChange(clampCrop(image, { ...crop, ...move }))
  }

  return (
    <div className="space-y-4">
      <div
        ref={frameRef}
        role="group"
        tabIndex={0}
        aria-label="Photo crop area. Drag or use the arrow keys to move the photo, and plus or minus to zoom."
        aria-disabled={disabled}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={handleKeyDown}
        className="relative mx-auto aspect-square w-full max-w-72 cursor-grab touch-none overflow-hidden rounded-lg bg-muted outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing aria-disabled:cursor-default aria-disabled:opacity-70"
      >
        <canvas ref={canvasRef} width={PROFILE_PICTURE_OUTPUT_PX} height={PROFILE_PICTURE_OUTPUT_PX} className="absolute inset-0 size-full" aria-hidden="true" />
        {/* Dims everything outside the circle the avatar will be masked to. */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: "radial-gradient(circle closest-side, transparent calc(100% - 1px), rgb(0 0 0 / 0.55) 100%)" }}
          aria-hidden="true"
        />
        <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-white/90 shadow-sm" aria-hidden="true" />
      </div>

      <div className="mx-auto flex w-full max-w-72 items-center gap-3">
        <label htmlFor="profile-picture-zoom" className="text-xs font-medium text-muted-foreground">Zoom</label>
        <input
          id="profile-picture-zoom"
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.01}
          value={crop.zoom}
          disabled={disabled}
          onChange={(event) => onChange(clampCrop(image, { ...crop, zoom: Number(event.target.value) }))}
          className="h-2 flex-1 cursor-pointer accent-primary disabled:cursor-not-allowed"
        />
      </div>
    </div>
  )
}
