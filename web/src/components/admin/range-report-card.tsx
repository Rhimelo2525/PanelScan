import { CalendarRange, Coins, Download, Loader2, PackageCheck, Truck } from "lucide-react"
import { useState, type FormEvent } from "react"
import { toast } from "sonner"

import { downloadDashboardRangeReport, getDashboardRangeReport } from "@/api/admin"
import { formatCount, formatManilaDate, formatMoney, manilaDayKey } from "@/admin/admin-format"
import { getAdminErrorMessage, useAdminResource } from "@/admin/use-admin-resource"
import { DataTable } from "@/components/admin/data-table"
import { ErrorState } from "@/components/admin/empty-state"
import { MetricCard } from "@/components/admin/metric-card"
import { MONTHS } from "@/components/admin/month-colors"
import { StatusMixBar, TrendChart } from "@/components/admin/trend-chart"
import { Button } from "@/components/ui/button"
import { DatePickerInput } from "@/components/ui/date-picker-input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import type { CycleProductDemand } from "@/types/admin"

const DAY_MS = 24 * 60 * 60 * 1000

/** "2026-09-19" plus `days` calendar days. */
const shiftDay = (key: string, days: number) => new Date(Date.parse(`${key}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)

/** "Sep 19" from "2026-09-19". */
const shortDay = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1].short} ${key.slice(8, 10)}`

/** "PanelScan_Sales_Sep19_to_Sep22_2026.xlsx", the name the API gives the file. */
const rangeFileName = (from: string, to: string) => {
  const day = (key: string) => shortDay(key).replace(" ", "")
  return from.slice(0, 4) === to.slice(0, 4)
    ? `PanelScan_Sales_${day(from)}_to_${day(to)}_${to.slice(0, 4)}.xlsx`
    : `PanelScan_Sales_${day(from)}_${from.slice(0, 4)}_to_${day(to)}_${to.slice(0, 4)}.xlsx`
}

interface Range {
  from: string
  to: string
}

/**
 * The cycle figures for any span of days the owner picks (e.g. Sep 19 to 22
 * only), computed live from the orders in Philippine time, with the same
 * Excel record as an archived cycle. Nothing is shown until the owner picks
 * the dates (or a quick range).
 */
export function RangeReportCard() {
  const today = manilaDayKey(new Date().toISOString())
  const presets: Array<{ label: string; range: Range }> = [
    { label: "Today", range: { from: today, to: today } },
    { label: "Last 7 days", range: { from: shiftDay(today, -6), to: today } },
    { label: "This month", range: { from: `${today.slice(0, 8)}01`, to: today } },
  ]
  const [draft, setDraft] = useState<Range>({ from: "", to: "" })
  const [range, setRange] = useState<Range | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)

  const report = useAdminResource(
    (signal) => range ? getDashboardRangeReport(range.from, range.to, signal).then((result) => result.report) : Promise.resolve(null),
    [range?.from, range?.to],
  )
  const data = report.data

  function show(next: Range) {
    if (!next.from || !next.to) return setFormError("Pick both dates.")
    if (next.from > next.to) return setFormError("The start date must be on or before the end date.")
    if (next.from > today) return setFormError("The start date cannot be in the future.")
    setFormError(null)
    setDraft(next)
    setRange(next)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    show(draft)
  }

  async function handleDownload() {
    if (isDownloading || !range) return
    setIsDownloading(true)
    const fileName = rangeFileName(range.from, range.to)
    try {
      const blob = await downloadDashboardRangeReport(range.from, range.to)
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      toast.success("Report downloaded", { description: `${fileName} has been saved.` })
    } catch (error) {
      toast.error("Report not downloaded", { description: getAdminErrorMessage(error) })
    } finally {
      setIsDownloading(false)
    }
  }

  const days = data?.revenueOverTime ?? []
  const points = days.map((day) => ({ label: shortDay(day.date), value: day.grossRevenue ?? 0 }))
  const delivered = days.reduce((sum, day) => sum + day.completedOrdersCount, 0)
  const rangeLabel = !range ? "" : range.from === range.to ? formatManilaDate(`${range.from}T12:00:00+08:00`) : `${formatManilaDate(`${range.from}T12:00:00+08:00`)} – ${formatManilaDate(`${range.to}T12:00:00+08:00`)}`

  return (
    <section className="surface-card space-y-5 p-5" aria-labelledby="range-report-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <CalendarRange className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <h2 id="range-report-title" className="text-sm font-semibold">Sales by date range</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Pick any days to see their sales, in Philippine time. Both dates are included.</p>
          </div>
        </div>
        {range && <Button variant="outline" size="sm" onClick={() => void handleDownload()} disabled={isDownloading || !data}>
          {isDownloading ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Download data-icon="inline-start" aria-hidden="true" />}
          Download Excel Record
        </Button>}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="range-from">From</Label>
          <DatePickerInput id="range-from" value={draft.from} max={today} onChange={(from) => setDraft((current) => ({ ...current, from }))} className="w-44" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="range-to">To</Label>
          <DatePickerInput id="range-to" value={draft.to} min={draft.from || undefined} max={today} onChange={(to) => setDraft((current) => ({ ...current, to }))} className="w-44" />
        </div>
        <Button type="submit">Show report</Button>
        <span className="flex flex-wrap gap-1.5">
          {presets.map((preset) => (
            <Button key={preset.label} type="button" variant="ghost" size="sm" onClick={() => show(preset.range)}>{preset.label}</Button>
          ))}
        </span>
      </form>
      {formError && <p role="alert" className="text-sm text-[var(--status-critical)]">{formError}</p>}

      {!range ? (
        <p className="rounded-lg border border-dashed border-border px-6 py-8 text-center text-sm text-muted-foreground">Choose a From and To date, then press Show report, or pick a quick range.</p>
      ) : report.error ? <ErrorState message={report.error} onRetry={report.reload} /> : (
        <div className="space-y-4" aria-live="polite">
          <p className="text-xs font-medium text-muted-foreground">Showing {rangeLabel}</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricCard size="large" label="Gross revenue" icon={Coins} value={formatMoney(data?.totalGrossRevenue)} hint="Non-cancelled orders" isLoading={report.isLoading} />
            <MetricCard size="large" label="Orders" icon={PackageCheck} value={formatCount(data?.totalOrdersCount)} hint="Every order placed, cancelled included" isLoading={report.isLoading} />
            <MetricCard size="large" label="Delivered" icon={Truck} value={formatCount(delivered)} hint="Orders placed in this range, delivered now" isLoading={report.isLoading} />
          </div>

          {report.isLoading ? <Skeleton className="h-40 w-full" /> : data && (
            <>
              <div className="rounded-lg border border-border p-4">
                <StatusMixBar title="Order mix" unit="order" items={data.ordersByStatus} emptyLabel="No orders were placed in this range." />
              </div>
              {points.length > 1 && data.totalOrdersCount > 0 && (
                <div className="rounded-lg border border-border p-4">
                  <TrendChart
                    points={points}
                    title="Revenue over time"
                    formatValue={(value) => formatMoney(value)}
                    description={rangeLabel}
                    color={MONTHS[Number(range.from.slice(5, 7)) - 1].color}
                    axisLabels={[points[0].label, points[Math.floor((points.length - 1) / 2)].label, points[points.length - 1].label]}
                  />
                </div>
              )}
              <div>
                <h3 className="pb-3 text-sm font-semibold">Product demand</h3>
                <DataTable
                  caption="Products sold in the chosen date range by quantity"
                  rows={data.productDemand}
                  getRowId={(row: CycleProductDemand) => row.productId}
                  empty={<div className="rounded-lg border border-dashed border-border px-6 py-8 text-center text-sm text-muted-foreground">No products were sold in this range.</div>}
                  columns={[
                    { key: "name", header: "Product", primary: true, cell: (row) => <span className="font-medium">{row.productName}</span> },
                    { key: "sku", header: "Product Code", secondary: true, cell: (row) => <span className="text-muted-foreground">{row.sku}</span> },
                    { key: "sold", header: "Units sold", numeric: true, cell: (row) => formatCount(row.unitsSold) },
                    { key: "revenue", header: "Revenue", numeric: true, cell: (row) => formatMoney(row.totalRevenue) },
                  ]}
                />
              </div>
            </>
          )}
        </div>
      )}
    </section>
  )
}
