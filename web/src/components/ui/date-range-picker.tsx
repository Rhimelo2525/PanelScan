import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react"
import { Popover as PopoverPrimitive } from "radix-ui"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** A range of calendar days as "2026-10-19" keys; an empty string leaves that end open. */
export interface DateRange {
  from: string
  to: string
}

const DAY_MS = 24 * 60 * 60 * 1000
const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
const monthTitle = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "UTC" })
const shortDay = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "UTC" })
const fullDay = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
const longDay = new Intl.DateTimeFormat("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })

// Day keys are worked on as UTC midnights, so no local time zone can shift a day.
const toTime = (key: string) => Date.parse(`${key}T00:00:00Z`)
const toKey = (time: number) => new Date(time).toISOString().slice(0, 10)
const shiftDay = (key: string, days: number) => toKey(toTime(key) + days * DAY_MS)
const monthStart = (key: string) => `${key.slice(0, 7)}-01`
const shiftMonth = (key: string, months: number) => {
  const date = new Date(toTime(monthStart(key)))
  date.setUTCMonth(date.getUTCMonth() + months)
  return toKey(date.getTime())
}

/** "Oct 19 – 22, 2026", "Oct 19, 2026", "From Oct 19, 2026" … for the button. */
function rangeLabel({ from, to }: DateRange, placeholder: string): string {
  if (from && to) {
    if (from === to) return fullDay.format(toTime(from))
    const sameYear = from.slice(0, 4) === to.slice(0, 4)
    return `${(sameYear ? shortDay : fullDay).format(toTime(from))} – ${fullDay.format(toTime(to))}`
  }
  if (from) return `From ${fullDay.format(toTime(from))}`
  if (to) return `Until ${fullDay.format(toTime(to))}`
  return placeholder
}

/**
 * One field for a date range: a button showing the chosen days that opens a
 * calendar (first click the start, second click the end) with quick choices.
 * `today` is the last day that can be picked, as a day key.
 */
export function DateRangePicker({ value, onChange, today, placeholder = "Any date", className, "aria-label": ariaLabel }: {
  value: DateRange
  onChange: (range: DateRange) => void
  today: string
  placeholder?: string
  className?: string
  "aria-label"?: string
}) {
  const [open, setOpen] = useState(false)
  const [month, setMonth] = useState(() => monthStart(value.from || today))
  const hasRange = value.from !== "" || value.to !== ""

  const presets: { label: string; range: DateRange }[] = [
    { label: "Today", range: { from: today, to: today } },
    { label: "Last 7 days", range: { from: shiftDay(today, -6), to: today } },
    { label: "Last 30 days", range: { from: shiftDay(today, -29), to: today } },
    { label: "This month", range: { from: monthStart(today), to: today } },
    { label: "Last month", range: { from: shiftMonth(today, -1), to: shiftDay(monthStart(today), -1) } },
  ]

  function choose(range: DateRange) {
    onChange(range)
    setOpen(false)
  }

  function pickDay(key: string) {
    // A first click (or one after a finished range) starts a new range; the second ends it.
    if (!value.from || value.to) onChange({ from: key, to: "" })
    else if (key < value.from) onChange({ from: key, to: "" })
    else choose({ from: value.from, to: key })
  }

  function openChange(next: boolean) {
    if (next) setMonth(monthStart(value.from || value.to || today))
    // Closed after picking only a start: that one day is the range.
    if (!next && value.from && !value.to) onChange({ from: value.from, to: value.from })
    setOpen(next)
  }

  return (
    <div className={cn("relative inline-flex", className)}>
      <PopoverPrimitive.Root open={open} onOpenChange={openChange}>
        <PopoverPrimitive.Trigger asChild>
          <button
            type="button"
            aria-label={ariaLabel ? `${ariaLabel}: ${rangeLabel(value, placeholder)}` : undefined}
            className={cn(
              "inline-flex h-10 w-full items-center gap-2 rounded-full border border-border bg-card pr-9 pl-3.5 text-left text-sm font-medium transition-colors hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              hasRange && "border-primary/60",
            )}
          >
            <CalendarDays className="size-4 shrink-0 text-primary" aria-hidden="true" />
            <span className={cn("min-w-0 flex-1 truncate", !hasRange && "text-muted-foreground")}>{rangeLabel(value, placeholder)}</span>
            {!hasRange && <ChevronDown className="pointer-events-none absolute right-3.5 size-4 text-muted-foreground" aria-hidden="true" />}
          </button>
        </PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content align="end" sideOffset={6} collisionPadding={16} className="z-50 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-lg outline-none">
            <div className="flex flex-col gap-3 sm:flex-row">
              <ul className="flex flex-wrap gap-1.5 sm:w-32 sm:flex-col sm:gap-0.5 sm:border-r sm:border-border sm:pr-3" aria-label="Quick choices">
                {presets.map((preset) => {
                  const isActive = preset.range.from === value.from && preset.range.to === value.to
                  return (
                    <li key={preset.label}>
                      <button type="button" aria-pressed={isActive} onClick={() => choose(preset.range)} className={cn("w-full rounded-md px-2.5 py-1.5 text-left text-sm whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", isActive ? "bg-primary text-primary-foreground" : "hover:bg-secondary")}>
                        {preset.label}
                      </button>
                    </li>
                  )
                })}
              </ul>
              <MonthGrid month={month} onMonth={setMonth} value={value} today={today} onPick={pickDay} />
            </div>
            <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground" aria-live="polite">
              {value.from && !value.to ? "Now pick the last day." : "Pick the first day, then the last."}
            </p>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
      {hasRange && (
        <button type="button" onClick={() => onChange({ from: "", to: "" })} className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" aria-label="Clear dates">
          <X className="size-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

/** One month of days, Sunday first; days after `today` can't be picked. */
function MonthGrid({ month, onMonth, value, today, onPick }: {
  month: string
  onMonth: (month: string) => void
  value: DateRange
  today: string
  onPick: (key: string) => void
}) {
  const first = toTime(month)
  const lead = new Date(first).getUTCDay()
  const daysInMonth = Math.round((toTime(shiftMonth(month, 1)) - first) / DAY_MS)
  const cells = [...Array<null>(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => shiftDay(month, index))]
  const canGoNext = shiftMonth(month, 1) <= today
  const end = value.to || value.from

  return (
    <div className="w-64">
      <div className="flex items-center justify-between">
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => onMonth(shiftMonth(month, -1))} aria-label="Previous month"><ChevronLeft aria-hidden="true" /></Button>
        <p className="text-sm font-semibold" aria-live="polite">{monthTitle.format(first)}</p>
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => onMonth(shiftMonth(month, 1))} disabled={!canGoNext} aria-label="Next month"><ChevronRight aria-hidden="true" /></Button>
      </div>
      <div className="mt-2 grid grid-cols-7 text-center text-[0.7rem] font-medium text-muted-foreground" aria-hidden="true">
        {WEEKDAYS.map((day) => <span key={day} className="py-1">{day}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((key, index) => {
          if (!key) return <span key={`lead-${index}`} />
          const isEdge = key === value.from || key === end
          const isBetween = value.from !== "" && key > value.from && key < end
          const isFuture = key > today
          return (
            <button
              key={key}
              type="button"
              disabled={isFuture}
              onClick={() => onPick(key)}
              aria-pressed={isEdge || isBetween}
              aria-label={longDay.format(toTime(key))}
              className={cn(
                "h-8 text-sm tabular-nums transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-35",
                isEdge ? "rounded-md bg-primary font-semibold text-primary-foreground" : isBetween ? "bg-primary/12 text-foreground" : "rounded-md hover:bg-secondary",
                key === today && !isEdge && "font-semibold text-primary",
              )}
            >
              {Number(key.slice(8))}
            </button>
          )
        })}
      </div>
    </div>
  )
}
