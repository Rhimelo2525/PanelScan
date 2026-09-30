/**
 * Panel dimension inputs are limited by digit count, not by size; the decimal
 * point doesn't count (width 2.9 and 99 are both 2 digits). Must match
 * DIMENSION_DIGIT_LIMITS in the API's product validation, which enforces it.
 */
export const DIMENSION_DIGIT_LIMITS = { width: 2, height: 3, thickness: 2 } as const
export type DimensionField = keyof typeof DIMENSION_DIGIT_LIMITS

const LABELS: Record<DimensionField, string> = { width: "Width", height: "Height", thickness: "Thickness" }

export const dimensionDigitMessage = (field: DimensionField) => `${LABELS[field]} can have at most ${DIMENSION_DIGIT_LIMITS[field]} digits.`

// Digits with at most one decimal point; "2." is allowed while typing.
const PARTIAL_DIMENSION = /^\d*\.?\d*$/

/**
 * Digits in a typed value. A leading "." counts as "0." because that is how
 * the number is sent (".55" is 0.55, three digits).
 */
function digitCount(value: string): number {
  const digits = value.replace(".", "").length
  return value.startsWith(".") ? digits + 1 : digits
}

/**
 * Why a typed or pasted value can't replace the field's content, or null when
 * it can. Letters, signs, exponents and values over the digit limit are
 * refused as a whole, so nothing is ever silently cut down to a different number.
 */
export function dimensionInputRejection(field: DimensionField, value: string): string | null {
  if (!PARTIAL_DIMENSION.test(value)) return `${LABELS[field]} accepts numbers only.`
  if (digitCount(value) > DIMENSION_DIGIT_LIMITS[field]) return dimensionDigitMessage(field)
  return null
}

/** Final check before saving: blank (no dimension) or a number above 0 within the digit limit. */
export function dimensionError(field: DimensionField, value: string): string | null {
  const trimmed = value.trim()
  if (!trimmed) return null
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(trimmed) || !(Number(trimmed) > 0)) return `${LABELS[field]} must be a number greater than 0.`
  if (digitCount(trimmed) > DIMENSION_DIGIT_LIMITS[field]) return dimensionDigitMessage(field)
  return null
}

/** Product size for display, without units: "2.9 × 25 × 8". */
export function formatDimensions(width: string | null, height: string | null, thickness?: string | null): string | null {
  if (!width || !height) return null
  return [width, height, thickness].filter(Boolean).join(" × ")
}
