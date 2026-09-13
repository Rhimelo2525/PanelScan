import { parsePriceToMinorUnits } from "../lib/format-price"

export interface ProductDraft {
  name: string
  categoryId: string
  description: string
  price: string
  material: string
  quantity: string
  status: string
}

export function validateProductDraft(draft: ProductDraft, categoryIds: readonly string[]) {
  const errors: Record<string, string> = {}
  for (const [key, max] of [["name", 100], ["description", 1500], ["material", 100]] as const) {
    if (!draft[key].trim()) errors[key] = "This field is required."
    else if (draft[key].trim().length > max) errors[key] = `Use ${max} characters or fewer.`
  }
  if (!categoryIds.includes(draft.categoryId)) errors.categoryId = "Choose a panel category."
  if (parsePriceToMinorUnits(draft.price) === null) errors.price = "Enter a non-negative peso amount with up to two decimal places."
  if (!/^\d+$/.test(draft.quantity) || Number(draft.quantity) > 1_000_000) errors.quantity = "Enter a whole stock quantity from 0 to 1,000,000."
  if (!["ACTIVE", "DRAFT"].includes(draft.status)) errors.status = "Choose Active or Draft."
  return errors
}

export function imageFileError(file: { type: string; size: number }) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "Choose a JPG, PNG, or WebP image."
  if (file.size === 0 || file.size > 5 * 1024 * 1024) return "Choose an image smaller than 5 MB."
  return null
}
