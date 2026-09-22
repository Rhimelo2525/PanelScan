/**
 * Client-side half of the profile picture feature: pick, validate, decode, crop
 * and compress. The server re-validates and re-encodes everything it receives
 * (the browser is never trusted), so this exists to give the customer instant,
 * friendly feedback and to upload a ~50 KB square instead of a 5 MB photo.
 */

export const PROFILE_PICTURE_MAX_BYTES = 5 * 1024 * 1024
export const PROFILE_PICTURE_OUTPUT_PX = 512
export const PROFILE_PICTURE_ACCEPT = ".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"

// Same wording as the API, so a problem reads identically whichever side catches it.
export const PROFILE_PICTURE_MESSAGES = {
  noFile: "Please choose an image to upload.",
  type: "Please upload a JPG, PNG, or WEBP image.",
  size: "Image size must be less than 5MB.",
  unreadable: "We couldn't read that image. It may be damaged - please try a different file.",
} as const

const ALLOWED_EXTENSION = /\.(jpe?g|png|webp)$/i

/** Identifies the format from the file's real leading bytes, not its name or the type the browser reports. */
async function sniffImageType(file: Blob): Promise<"jpeg" | "png" | "webp" | null> {
  const head = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return "jpeg"

  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (head.length >= 8 && pngSignature.every((byte, index) => head[index] === byte)) return "png"

  const ascii = (from: number, to: number) => String.fromCharCode(...head.slice(from, to))
  if (head.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "webp"
  return null
}

/** Returns a customer-facing message when the file can't be used, or null when it can. */
export async function checkImageFile(file: File): Promise<string | null> {
  if (!ALLOWED_EXTENSION.test(file.name)) return PROFILE_PICTURE_MESSAGES.type
  if (file.size > PROFILE_PICTURE_MAX_BYTES) return PROFILE_PICTURE_MESSAGES.size
  if (file.size === 0 || (await sniffImageType(file)) === null) return PROFILE_PICTURE_MESSAGES.type
  return null
}

export interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  /** Releases the decoded pixels / object URL. */
  dispose: () => void
}

/** Fully decodes the file, which is also what proves it isn't corrupted. Honors EXIF rotation so phone photos aren't sideways. */
export async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" })
      return { source: bitmap, width: bitmap.width, height: bitmap.height, dispose: () => bitmap.close() }
    } catch {
      // Fall through to the <img> decoder before giving up.
    }
  }

  const url = URL.createObjectURL(file)
  try {
    const element = new Image()
    element.src = url
    await element.decode()
    return { source: element, width: element.naturalWidth, height: element.naturalHeight, dispose: () => URL.revokeObjectURL(url) }
  } catch {
    URL.revokeObjectURL(url)
    throw new Error(PROFILE_PICTURE_MESSAGES.unreadable)
  }
}

// ------------------------------------------------------------------ cropping

/** The square window into the source image, described in source pixels so it doesn't depend on how large it is drawn on screen. */
export interface CropState {
  zoom: number
  centerX: number
  centerY: number
}

export const MIN_ZOOM = 1
export const MAX_ZOOM = 4

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Side of the crop square, in source pixels. At zoom 1 it is the whole short edge (the largest possible square). */
export function cropSide(image: Pick<DecodedImage, "width" | "height">, zoom: number): number {
  return Math.min(image.width, image.height) / zoom
}

/** Keeps the window inside the image, so the result never contains blank edges. */
export function clampCrop(image: Pick<DecodedImage, "width" | "height">, crop: CropState): CropState {
  const zoom = clamp(crop.zoom, MIN_ZOOM, MAX_ZOOM)
  const half = cropSide(image, zoom) / 2
  return {
    zoom,
    centerX: clamp(crop.centerX, half, image.width - half),
    centerY: clamp(crop.centerY, half, image.height - half),
  }
}

/** Starts centred on the middle of the photo, at the largest square. */
export function initialCrop(image: Pick<DecodedImage, "width" | "height">): CropState {
  return { zoom: MIN_ZOOM, centerX: image.width / 2, centerY: image.height / 2 }
}

/** Draws exactly what will be uploaded. The on-screen preview and the export both use this, so what the customer sees is what they get. */
export function drawCrop(ctx: CanvasRenderingContext2D, image: DecodedImage, crop: CropState, outputSize: number) {
  const side = cropSide(image, crop.zoom)
  ctx.save()
  // White underneath, so a transparent PNG doesn't turn black if it has to be saved as JPEG.
  ctx.fillStyle = "#ffffff"
  ctx.fillRect(0, 0, outputSize, outputSize)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(image.source, crop.centerX - side / 2, crop.centerY - side / 2, side, side, 0, 0, outputSize, outputSize)
  ctx.restore()
}

/** Crops to a 512x512 square and compresses (WebP, or JPEG where the browser can't write WebP). Typically 20-60 KB. */
export async function exportCroppedImage(image: DecodedImage, crop: CropState): Promise<Blob> {
  const canvas = document.createElement("canvas")
  canvas.width = PROFILE_PICTURE_OUTPUT_PX
  canvas.height = PROFILE_PICTURE_OUTPUT_PX
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error(PROFILE_PICTURE_MESSAGES.unreadable)

  drawCrop(ctx, image, clampCrop(image, crop), PROFILE_PICTURE_OUTPUT_PX)

  const toBlob = (type: string, quality: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))
  const webp = await toBlob("image/webp", 0.85)
  if (webp && webp.type === "image/webp") return webp

  const jpeg = await toBlob("image/jpeg", 0.9)
  if (!jpeg) throw new Error(PROFILE_PICTURE_MESSAGES.unreadable)
  return jpeg
}
