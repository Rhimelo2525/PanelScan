import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import type { Pagination } from "@/types/admin"

export interface Column<T> {
  key: string
  header: string
  cell: (row: T) => ReactNode
  numeric?: boolean
  /** Dropped from the desktop table at narrower widths instead of shrinking every column. */
  secondary?: boolean
  /** Used as the heading of the stacked card on small screens. */
  primary?: boolean
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[]
  getRowId: (row: T) => string
  caption: string
  isLoading?: boolean
  empty?: ReactNode
  rowAction?: (row: T) => ReactNode
}

/**
 * One table implementation for the whole Admin. Below `md` it re-renders the
 * same column definitions as stacked cards - dense tabular data on a 390px
 * screen becomes unreadable long before it becomes scrollable, so the layout
 * changes rather than the type size.
 */
export function DataTable<T>({ columns, rows, getRowId, caption, isLoading, empty, rowAction }: DataTableProps<T>) {
  if (isLoading) return <DataTableSkeleton columns={columns.length} />
  if (rows.length === 0 && empty) return <>{empty}</>

  const primaryColumn = columns.find((column) => column.primary) ?? columns[0]
  const restColumns = columns.filter((column) => column !== primaryColumn)

  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-border bg-card md:block">
        <table className="admin-table">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => <th key={column.key} scope="col" className={cn(column.numeric && "is-numeric", column.secondary && "hidden lg:table-cell")}>{column.header}</th>)}
              {rowAction && <th scope="col"><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={getRowId(row)}>
                {columns.map((column) => <td key={column.key} className={cn(column.numeric && "is-numeric", column.secondary && "hidden lg:table-cell")}>{column.cell(row)}</td>)}
                {rowAction && <td className="text-right">{rowAction(row)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 md:hidden">
        {rows.map((row) => (
          <li key={getRowId(row)} className="surface-card p-4">
            <div className="text-sm font-semibold break-words [overflow-wrap:anywhere]">{primaryColumn.cell(row)}</div>
            <dl className="mt-3 space-y-2 text-sm">
              {restColumns.map((column) => (
                <div key={column.key} className="flex items-start justify-between gap-4">
                  <dt className="text-xs text-muted-foreground">{column.header}</dt>
                  <dd className={cn("min-w-0 break-words text-right [overflow-wrap:anywhere]", column.numeric && "tabular-nums")}>{column.cell(row)}</dd>
                </div>
              ))}
            </dl>
            {rowAction && <div className="mt-4 flex justify-end">{rowAction(row)}</div>}
          </li>
        ))}
      </ul>
    </>
  )
}

export function DataTableSkeleton({ columns = 5, rows = 6 }: { columns?: number; rows?: number }) {
  return (
    <div className="surface-card p-4" aria-busy="true" aria-label="Loading table data">
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div key={rowIndex} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {Array.from({ length: columns }).map((_, columnIndex) => <Skeleton key={columnIndex} className="h-4 w-full" />)}
          </div>
        ))}
      </div>
    </div>
  )
}

export function TablePagination({ pagination, onPageChange, isLoading }: { pagination: Pagination | null; onPageChange: (page: number) => void; isLoading?: boolean }) {
  if (!pagination || pagination.totalPages <= 1) return null
  const start = (pagination.page - 1) * pagination.limit + 1
  const end = Math.min(pagination.page * pagination.limit, pagination.total)

  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 pt-1" aria-label="Table pages">
      <p className="text-xs text-muted-foreground">Showing {start}–{end} of {pagination.total}</p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={isLoading || pagination.page <= 1} onClick={() => onPageChange(pagination.page - 1)}>Previous</Button>
        <span className="text-xs text-muted-foreground">Page {pagination.page} of {pagination.totalPages}</span>
        <Button variant="outline" size="sm" disabled={isLoading || pagination.page >= pagination.totalPages} onClick={() => onPageChange(pagination.page + 1)}>Next</Button>
      </div>
    </nav>
  )
}
