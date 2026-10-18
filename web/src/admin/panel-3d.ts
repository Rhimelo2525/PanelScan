import type { PanelProfile, Product } from "@/types/product"

/**
 * The 3D preview settings a moderator picks for a product. The app builds the
 * panel in 3D from these and the product's size, so a new product shows in 3D
 * without an app update. Must match the API's rules in product.panel3d.ts.
 */
export const PANEL_PROFILE_OPTIONS: Array<{ value: PanelProfile; label: string; hint: string }> = [
  { value: "FLAT", label: "Flat", hint: "Smooth face, no grooves (seamless panels)" },
  { value: "FLUTED", label: "Fluted", hint: "Square ridges across the face (5in1, 6in1, 7in1)" },
  { value: "INVERTED_CIRCLE", label: "Inverted circle", hint: "Half-round flutes" },
  { value: "SPANDREL", label: "Spandrel", hint: "Flat face with lines along it" },
]

export const GROOVE_COUNT_MAX = 12

export function panelProfileLabel(profile: PanelProfile | null): string {
  return PANEL_PROFILE_OPTIONS.find((option) => option.value === profile)?.label ?? "Not set"
}

/** "Fluted, 5 grooves", "Flat" or "Not set". */
export function panel3dLabel(profile: PanelProfile | null, grooveCount: number | null): string {
  const name = panelProfileLabel(profile)
  if (!profile || profile === "FLAT" || !grooveCount) return name
  return `${name}, ${grooveCount} groove${grooveCount === 1 ? "" : "s"}`
}

/**
 * A first guess at the shape from the product name, for a new product:
 * "WPC Fluted 7in1" is fluted with 7 grooves, "… Inverted Circle" half-round,
 * "PVC Ceiling Spandrel" a spandrel with 2 lines; anything else is flat.
 */
export function guessPanel3d(name: string): { profile: PanelProfile; grooveCount: number | null } {
  const count = /(\d{1,2})\s*-?\s*in\s*-?\s*1\b/i.exec(name)?.[1]
  const grooves = count ? Math.min(Math.max(Number(count), 1), GROOVE_COUNT_MAX) : null
  if (/inverted\s*circle|half[-\s]*round/i.test(name)) return { profile: "INVERTED_CIRCLE", grooveCount: grooves ?? 6 }
  if (/spandrel/i.test(name)) return { profile: "SPANDREL", grooveCount: grooves ?? 2 }
  if (/flut/i.test(name) || grooves) return { profile: "FLUTED", grooveCount: grooves ?? 5 }
  return { profile: "FLAT", grooveCount: null }
}

/** The problem with a shape and groove count, or null when they fit. */
export function panel3dError(profile: PanelProfile, grooveCount: string): string | null {
  if (profile === "FLAT") return null
  const value = Number(grooveCount)
  if (grooveCount.trim() === "") return "Enter how many grooves the panel has."
  if (!Number.isInteger(value) || value < 1 || value > GROOVE_COUNT_MAX) return `Number of grooves must be a whole number from 1 to ${GROOVE_COUNT_MAX}.`
  return null
}

/**
 * "Ready" once a moderator has saved the product's shape; "Auto" while the
 * app still guesses it from the name. Either way the product shows in 3D,
 * coloured from its main photo.
 */
export function panel3dStatus(product: Pick<Product, "panelProfile">): "READY" | "AUTO" {
  return product.panelProfile ? "READY" : "AUTO"
}

/** The 3D settings while a product form is open. */
export interface Panel3dValue {
  profile: PanelProfile
  grooveCount: string
}

/** A product's saved settings, or a guess from the name for one not set yet. */
export function panel3dValue(product?: Pick<Product, "name" | "panelProfile" | "grooveCount">): Panel3dValue {
  if (product?.panelProfile) return { profile: product.panelProfile, grooveCount: product.grooveCount ? String(product.grooveCount) : "" }
  const guess = guessPanel3d(product?.name ?? "")
  return { profile: guess.profile, grooveCount: guess.grooveCount ? String(guess.grooveCount) : "" }
}

/** The fields to send. */
export function panel3dPayload(value: Panel3dValue): { panelProfile: PanelProfile; grooveCount: number | null } {
  return {
    panelProfile: value.profile,
    grooveCount: value.profile === "FLAT" ? null : Number(value.grooveCount),
  }
}
