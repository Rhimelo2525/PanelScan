import type { InventoryRecord } from "@/types/admin"
import { formatPesos } from "@/lib/format-price"

const numberFormatter = new Intl.NumberFormat("en-PH")
const dateFormatter = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "Asia/Manila" })
const dateTimeFormatter = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" })

/**
 * Analytics and report endpoints return money as numbers (major units), unlike
 * the storefront's decimal strings - so admin money formatting lives here rather
 * than reusing the catalog's string parser.
 */
export function formatMoney(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : formatPesos(value, true)
}

export function formatMoneyDetail(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : formatPesos(value)
}

export function formatCount(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : numberFormatter.format(value)
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : dateFormatter.format(date)
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : dateTimeFormatter.format(date)
}

/** ENUM_VALUE -> "Enum value", used for every backend enum rendered in the Admin. */
export function formatEnumLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

export function fullName(person: { firstName: string; lastName: string } | null | undefined): string {
  return person ? `${person.firstName} ${person.lastName}` : "—"
}

export type StockStatus = "HEALTHY" | "LOW_STOCK" | "OUT_OF_STOCK"

/**
 * Derived from the same fields the backend's own low-stock report uses
 * (available = quantity - reservedQty, compared against reorderLevel), so the
 * table and the backend agree on what "low" means.
 */
export function stockStatus(record: { quantity: number; reservedQty: number; reorderLevel: number }): StockStatus {
  const available = record.quantity - record.reservedQty
  if (available <= 0) return "OUT_OF_STOCK"
  if (available <= record.reorderLevel) return "LOW_STOCK"
  return "HEALTHY"
}

export function availableStock(record: Pick<InventoryRecord, "quantity" | "reservedQty">): number {
  return record.quantity - record.reservedQty
}

/**
 * Buckets dated rows into day or month periods for the dashboard trend. The
 * backend has no time-series endpoint, so this derives one from real report rows
 * rather than inventing a series.
 */
export function bucketByPeriod<T>(rows: T[], getDate: (row: T) => string, getValue: (row: T) => number, buckets = 7): Array<{ label: string; value: number }> {
  if (rows.length === 0) return []

  const dated = rows
    .map((row) => ({ time: new Date(getDate(row)).getTime(), value: getValue(row) }))
    .filter((entry) => Number.isFinite(entry.time))
    .sort((a, b) => a.time - b.time)

  if (dated.length === 0) return []

  const start = dated[0].time
  const end = dated[dated.length - 1].time
  const span = Math.max(end - start, 1)
  const size = span / buckets
  // A day of activity bucketed by date would print the same label seven times,
  // so short ranges are labelled by time instead.
  const labelFormatter = span < 48 * 60 * 60 * 1000
    ? new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" })
    : dateFormatter

  const totals = new Array<number>(buckets).fill(0)
  for (const entry of dated) {
    const index = Math.min(buckets - 1, Math.floor((entry.time - start) / size))
    totals[index] += entry.value
  }

  return totals.map((value, index) => ({
    label: labelFormatter.format(new Date(start + size * index)),
    value,
  }))
}
