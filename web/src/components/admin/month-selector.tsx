import { cn } from "@/lib/utils"
import { MONTHS } from "@/components/admin/month-colors"

/**
 * A compact chart legend of the twelve months, each a small square in the
 * month's fixed colour beside its name. The selected month gets a highlighted
 * background, bold text and a ring in its colour. Months after
 * `lastSelectableMonth` (0-11, still in the future) cannot be picked.
 */
export function MonthSelector({ value, onChange, lastSelectableMonth, year }: { value: number; onChange: (month: number) => void; lastSelectableMonth: number; year: number }) {
  return (
    <div className="mt-3 flex flex-wrap gap-1" role="group" aria-label={`Month of ${year}`}>
      {MONTHS.map((month, index) => {
        const isActive = index === value
        const isFuture = index > lastSelectableMonth
        return (
          <button
            key={month.short}
            type="button"
            onClick={() => onChange(index)}
            disabled={isFuture}
            aria-pressed={isActive}
            aria-label={`${month.long} ${year}`}
            title={isFuture ? `${month.long} ${year} has not started yet` : `${month.long} ${year}`}
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-35",
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
