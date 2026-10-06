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

// Dashboard cycles and archives are defined in Philippine time, so they are
// always shown in it, whatever the viewer's own time zone.
const manilaDateFormatter = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "short", day: "2-digit", year: "numeric" })
const manilaTimeFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hour12: false })
const manilaDayKeyFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" })

/** "Sep 19, 2026" in Philippine time. */
export function formatManilaDate(value: string): string {
  return manilaDateFormatter.format(new Date(value))
}

/** "Sep 19, 2026 00:00" in Philippine time (24-hour). */
export function formatManilaDateTime(value: string): string {
  const date = new Date(value)
  return `${manilaDateFormatter.format(date)} ${manilaTimeFormatter.format(date)}`
}

/** "2026-09-19" - the Philippine calendar date. */
export function manilaDayKey(value: string): string {
  return manilaDayKeyFormatter.format(new Date(value))
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
