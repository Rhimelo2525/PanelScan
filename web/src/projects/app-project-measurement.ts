/**
 * The measurement and panel estimate a customer saved in the mobile app,
 * read from a MOBILE_AR_3D project's arMetadata (written by
 * mobile/.../ProjectRepository.kt). Every field is checked, since the
 * metadata is free-form JSON; anything missing is left out.
 */
export interface AppProjectMeasurement {
  surface: "Wall" | "Ceiling"
  widthMeters: number | null
  heightMeters: number | null
  areaSquareMeters: number | null
  panelName: string | null
  panelSku: string | null
  panelWidthMeters: number | null
  panelHeightMeters: number | null
  baseQuantity: number | null
  wastePercent: number | null
  finalQuantity: number | null
  estimatedCost: number | null
  /** When the customer saved it in the app (ISO), if the app sent it. */
  savedAt: string | null
}

const toNumber = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null)
const toText = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null)

export function readAppMeasurement(arMetadata: Record<string, unknown> | null | undefined): AppProjectMeasurement | null {
  if (!arMetadata || typeof arMetadata !== "object") return null
  const meta = arMetadata
  const savedAt = toNumber(meta.savedAt)
  return {
    surface: meta.surfaceType === "CEILING" ? "Ceiling" : "Wall",
    widthMeters: toNumber(meta.widthMeters),
    heightMeters: toNumber(meta.heightMeters),
    areaSquareMeters: toNumber(meta.areaSquareMeters),
    panelName: toText(meta.panelName),
    panelSku: toText(meta.panelSku),
    panelWidthMeters: toNumber(meta.panelWidthMeters),
    panelHeightMeters: toNumber(meta.panelHeightMeters),
    baseQuantity: toNumber(meta.baseQuantity),
    wastePercent: toNumber(meta.wastePercent),
    finalQuantity: toNumber(meta.finalQuantity),
    estimatedCost: toNumber(meta.estimatedCost),
    savedAt: savedAt === null ? null : new Date(savedAt).toISOString(),
  }
}

const meters = (value: number) => value.toFixed(2)

/** "3.20 × 2.60 m", or null when either side is missing. */
export function formatSize(width: number | null, height: number | null): string | null {
  return width === null || height === null ? null : `${meters(width)} × ${meters(height)} m`
}

/** "7 panels (6 + 15% cutting allowance)". */
export function formatPanelCount(m: AppProjectMeasurement): string | null {
  if (m.finalQuantity === null) return null
  const count = `${m.finalQuantity} panel${m.finalQuantity === 1 ? "" : "s"}`
  if (m.baseQuantity === null || !m.wastePercent) return count
  return `${count} (${m.baseQuantity} + ${m.wastePercent}% cutting allowance)`
}
