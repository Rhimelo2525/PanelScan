import { getSalesReport } from "@/api/admin"
import { manilaDayKey } from "@/admin/admin-format"
import type { OrderReportRow } from "@/types/admin"

const PAGE_SIZE = 500

const pad = (value: number) => String(value).padStart(2, "0")

/** Number of days in `month` (0-11) of `year`. */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

/** "2026-09" */
export function monthKey(year: number, month: number): string {
  return `${year}-${pad(month + 1)}`
}

/** "2026-09-07" */
export function dayKey(year: number, month: number, day: number): string {
  return `${monthKey(year, month)}-${pad(day)}`
}

/**
 * Every order placed in one calendar month (Philippine time), read from the
 * existing sales report. The report's date range is in UTC days, so the
 * request is widened by a day on each side and the rows are then cut back to
 * this month's Philippine dates - no order from a neighbouring month gets in.
 */
export async function getMonthOrders(year: number, month: number, signal?: AbortSignal): Promise<OrderReportRow[]> {
  const dateFrom = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
  const dateTo = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10)
  const rows: OrderReportRow[] = []
  for (let page = 1; ; page += 1) {
    const report = await getSalesReport({ page, limit: PAGE_SIZE, dateFrom, dateTo }, signal)
    rows.push(...report.orders)
    if (page >= report.pagination.totalPages) break
  }
  const key = monthKey(year, month)
  return rows.filter((row) => manilaDayKey(row.createdAt).startsWith(key))
}
