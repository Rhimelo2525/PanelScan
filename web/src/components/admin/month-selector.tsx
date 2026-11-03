import { cn } from "@/lib/utils"
import { MONTHS } from "@/components/admin/month-colors"

/** A calendar month: `month` is 0-11. */
export interface CalendarMonth {
  year: number
  month: number
}

/**
 * A compact chart legend of the given months, each a small square in the
 * month's fixed colour beside its name. The selected month gets a highlighted
 * background, bold text and a ring in its colour. The months can span two
 * years (Nov to Apr), so each one carries its year.
 */
export function MonthSelector({ months, value, onChange }: { months: CalendarMonth[]; value: CalendarMonth; onChange: (month: CalendarMonth) => void }) {
  return (
    <div className="mt-3 flex flex-wrap gap-1" role="group" aria-label="Month">
      {months.map((item) => {
        const month = MONTHS[item.month]
        const isActive = item.year === value.year && item.month === value.month
        return (
          <button
            key={`${item.year}-${item.month}`}
            type="button"
            onClick={() => onChange(item)}
            aria-pressed={isActive}
            aria-label={`${month.long} ${item.year}`}
            title={`${month.long} ${item.year}`}
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isActive ? "bg-secondary font-semibold text-foreground" : "border-transparent font-medium text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
            style={isActive ? { borderColor: month.color, boxShadow: `0 0 0 1px ${month.color}` } : undefined}
          >
            <span className="size-2.5 shrink-0 rounded-[2px]" style={{ backgroundColor: month.color }} aria-hidden="true" />
            {month.short}
          </button>
        )
      })}
    </div>
  )
}
