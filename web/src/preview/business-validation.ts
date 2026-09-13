import type { AdminReviewRow } from "../data/admin-review"
import { parsePriceToMinorUnits } from "../lib/format-price"

export type BusinessKind = "inventory" | "installers"

export function validateBusinessRecord(kind: BusinessKind, draft: AdminReviewRow, rows: AdminReviewRow[]) {
  const errors: Record<string, string> = {}
  const required = kind === "inventory" ? ["item", "sku", "location"] : ["installer", "specialty", "coverage", "phone"]
  for (const field of required) {
    if (!draft[field]?.trim()) errors[field] = "This field is required."
    else if (draft[field].trim().length > 120) errors[field] = "Use 120 characters or fewer."
  }
  const quantities = kind === "inventory" ? ["onHand", "reorder"] : ["assignments"]
  for (const field of quantities) {
    if (!/^\d+$/.test(draft[field] ?? "") || !Number.isSafeInteger(Number(draft[field])) || Number(draft[field]) > 1_000_000) errors[field] = "Enter a whole number from 0 to 1,000,000."
  }
  if (kind === "inventory") {
    if (parsePriceToMinorUnits(draft.unitPrice ?? "") === null) errors.unitPrice = "Enter a non-negative peso amount with up to two decimal places."
    if (rows.some((row) => row.id !== draft.id && row.sku?.trim().toLowerCase() === draft.sku?.trim().toLowerCase())) errors.sku = "This SKU already exists."
  } else {
    const digits = (draft.phone ?? "").replace(/\D/g, "")
    if (!/^[+\d\s()-]{7,25}$/.test(draft.phone ?? "") || digits.length < 7 || digits.length > 15) errors.phone = "Enter a valid contact number."
    if (draft.verified !== "true") errors.verified = "Confirm verification before saving this installer."
    if (!["ACTIVE", "INACTIVE"].includes(draft.status)) errors.status = "Choose an availability status."
  }
  return errors
}

export function previewStockStatus(quantity: number, reorder: number) {
  return quantity <= 0 ? "OUT_OF_STOCK" : quantity <= reorder ? "LOW_STOCK" : "HEALTHY"
}

export const VALID_PROJECT_STATUSES = ["PENDING", "IN_PROGRESS", "READY_FOR_REVIEW", "COMPLETED"] as const
export type ProjectStatus = typeof VALID_PROJECT_STATUSES[number]

export function validateProjectRecord(draft: { status?: string; surface?: string; notes?: string }) {
  const errors: Record<string, string> = {}
  if (!draft.status || !VALID_PROJECT_STATUSES.includes(draft.status as ProjectStatus)) {
    errors.status = "Choose a valid project status: Pending, In progress, Ready for review, or Completed."
  }
  if (!draft.surface?.trim()) {
    errors.surface = "Surface specification is required."
  } else if (draft.surface.trim().length > 120) {
    errors.surface = "Use 120 characters or fewer for surface."
  }
  if (draft.notes && draft.notes.length > 500) {
    errors.notes = "Project notes must be 500 characters or fewer."
  }
  return errors
}
