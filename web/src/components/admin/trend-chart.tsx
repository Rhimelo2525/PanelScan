import { useId, useState } from "react"

export interface TrendPoint {
  /** Axis label, e.g. "Aug 12". */
  label: string
  value: number
}

interface TrendChartProps {
  points: TrendPoint[]
  /** Names the single series, so no legend is needed. */
  title: string
  formatValue: (value: number) => string
  description?: string
}

const VIEW_WIDTH = 640
const VIEW_HEIGHT = 200
const PADDING = { top: 12, right: 8, bottom: 24, left: 8 }

/**
 * One series, change over time: a line with a soft area under it. Deliberately
 * ink-coloured rather than a brand hue - status colours are reserved for status,
 * and a single series needs no colour identity of its own. Every value is also
 * available as text in the table below, so the chart is never the only source.
 */
export function TrendChart({ points, title, formatValue, description }: TrendChartProps) {
  const gradientId = useId()
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  if (points.length === 0) return null

  const values = points.map((point) => point.value)
  const maxValue = Math.max(...values, 1)
  const innerWidth = VIEW_WIDTH - PADDING.left - PADDING.right
  const innerHeight = VIEW_HEIGHT - PADDING.top - PADDING.bottom
  const stepX = points.length > 1 ? innerWidth / (points.length - 1) : 0
  const coordinates = points.map((point, index) => ({
    x: PADDING.left + (points.length > 1 ? index * stepX : innerWidth / 2),
    y: PADDING.top + innerHeight - (point.value / maxValue) * innerHeight,
  }))

  const linePath = coordinates.map((coordinate, index) => `${index === 0 ? "M" : "L"}${coordinate.x.toFixed(1)},${coordinate.y.toFixed(1)}`).join(" ")
  const areaPath = `${linePath} L${coordinates[coordinates.length - 1].x.toFixed(1)},${(PADDING.top + innerHeight).toFixed(1)} L${coordinates[0].x.toFixed(1)},${(PADDING.top + innerHeight).toFixed(1)} Z`
  const active = activeIndex === null ? null : { point: points[activeIndex], coordinate: coordinates[activeIndex] }
  const total = values.reduce((sum, value) => sum + value, 0)

  return (
    <figure className="m-0">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs text-muted-foreground">{description ?? `${formatValue(total)} total`}</span>
      </figcaption>

      <div className="relative mt-3">
        <svg viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`} className="h-44 w-full" role="img" aria-label={`${title}. ${points.map((point) => `${point.label}: ${formatValue(point.value)}`).join(". ")}`}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.14" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>

          {[0, 0.5, 1].map((fraction) => (
            <line key={fraction} x1={PADDING.left} x2={VIEW_WIDTH - PADDING.right} y1={PADDING.top + innerHeight * fraction} y2={PADDING.top + innerHeight * fraction} stroke="var(--border)" strokeWidth="1" />
          ))}

          <g className="text-foreground">
            <path d={areaPath} fill={`url(#${gradientId})`} />
            <path d={linePath} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {active && <>
              <line x1={active.coordinate.x} x2={active.coordinate.x} y1={PADDING.top} y2={PADDING.top + innerHeight} stroke="var(--muted-foreground)" strokeWidth="1" strokeDasharray="3 3" />
              <circle cx={active.coordinate.x} cy={active.coordinate.y} r="4.5" fill="currentColor" stroke="var(--card)" strokeWidth="2" />
            </>}
          </g>

          {points.map((point, index) => (
            <rect
              key={point.label}
              x={PADDING.left + (index - 0.5) * stepX}
              y={0}
              width={Math.max(stepX, 8)}
              height={VIEW_HEIGHT}
              fill="transparent"
              onPointerEnter={() => setActiveIndex(index)}
              onPointerLeave={() => setActiveIndex(null)}
            />
          ))}
        </svg>

        {active && (
          <div className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-sm" style={{ left: `${(active.coordinate.x / VIEW_WIDTH) * 100}%` }}>
            <span className="block font-medium">{active.point.label}</span>
            <span className="block tabular-nums text-muted-foreground">{formatValue(active.point.value)}</span>
          </div>
        )}
      </div>

      <div className="mt-1 flex justify-between text-[0.68rem] text-muted-foreground">
        <span>{points[0].label}</span>
        {points.length > 2 && <span className="hidden sm:inline">{points[Math.floor(points.length / 2)].label}</span>}
        <span>{points[points.length - 1].label}</span>
      </div>

      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">View as table</summary>
        <table className="mt-2 w-full text-left">
          <thead><tr><th scope="col" className="py-1 font-medium">Period</th><th scope="col" className="py-1 text-right font-medium">{title}</th></tr></thead>
          <tbody>{points.map((point) => <tr key={point.label} className="border-t border-border"><td className="py-1">{point.label}</td><td className="py-1 text-right tabular-nums">{formatValue(point.value)}</td></tr>)}</tbody>
        </table>
      </details>
    </figure>
  )
}

/**
 * Status mixes are shown as labelled bars rather than a pie: the label carries
 * identity, the bar carries magnitude, and no colour vocabulary is invented for
 * categories that already have a status meaning elsewhere.
 */
export function StatusBreakdownBars({ title, items, emptyLabel = "No records yet" }: { title: string; items: Array<{ status: string; count: number }>; emptyLabel?: string }) {
  const total = items.reduce((sum, item) => sum + item.count, 0)

  return (
    <div>
      <p className="text-sm font-semibold">{title}</p>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {items.map((item) => (
            <li key={item.status}>
              <div className="flex items-baseline justify-between gap-3 text-xs">
                <span className="font-medium">{item.status.charAt(0) + item.status.slice(1).toLowerCase().replace(/_/g, " ")}</span>
                <span className="tabular-nums text-muted-foreground">{item.count} ({total === 0 ? 0 : Math.round((item.count / total) * 100)}%)</span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full bg-foreground/70" style={{ width: `${total === 0 ? 0 : (item.count / total) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
