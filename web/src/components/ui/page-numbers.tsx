import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/** Up to this many pages are all shown; beyond it, far pages collapse into "…". */
const SHOW_ALL_UP_TO = 7

/**
 * The page numbers to show: every page when there are few, otherwise the
 * first and last pages, the current one and its neighbours, with a gap
 * ("…") wherever pages are skipped. 1 2 3 4 5 … 12 / 1 … 5 6 7 … 12.
 */
function pageItems(page: number, totalPages: number): (number | "gap")[] {
  if (totalPages <= SHOW_ALL_UP_TO) return Array.from({ length: totalPages }, (_, index) => index + 1)
  // Near either end, show the first or last five so the row keeps the same length.
  const from = page <= 4 ? 2 : page >= totalPages - 3 ? totalPages - 4 : page - 1
  const to = page <= 4 ? 5 : page >= totalPages - 3 ? totalPages - 1 : page + 1
  const middle = Array.from({ length: to - from + 1 }, (_, index) => from + index)
  return [1, ...(from > 2 ? ["gap" as const] : []), ...middle, ...(to < totalPages - 1 ? ["gap" as const] : []), totalPages]
}

/**
 * Previous, the page numbers and Next, so any page is one click away instead
 * of stepping through them one at a time.
 */
export function PageNumbers({ page, totalPages, onPageChange, disabled = false, size = "sm", className }: {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
  disabled?: boolean
  size?: "sm" | "default"
  className?: string
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      <Button variant="outline" size={size} disabled={disabled || page <= 1} onClick={() => onPageChange(page - 1)}>Previous</Button>
      <ol className="flex flex-wrap items-center gap-1">
        {pageItems(page, totalPages).map((item, index) =>
          item === "gap" ? (
            <li key={`gap-${index}`} className="px-1 text-xs text-muted-foreground" aria-hidden="true">…</li>
          ) : (
            <li key={item}>
              <Button
                variant={item === page ? "default" : "ghost"}
                size={size}
                className="min-w-8 justify-center px-2 tabular-nums"
                disabled={disabled && item !== page}
                onClick={() => { if (item !== page) onPageChange(item) }}
                aria-current={item === page ? "page" : undefined}
                aria-label={`Page ${item} of ${totalPages}`}
              >
                {item}
              </Button>
            </li>
          ),
        )}
      </ol>
      <Button variant="outline" size={size} disabled={disabled || page >= totalPages} onClick={() => onPageChange(page + 1)}>Next</Button>
    </div>
  )
}
