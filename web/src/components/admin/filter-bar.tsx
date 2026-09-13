import { Search, X } from "lucide-react"
import type { ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface FilterBarProps {
  searchValue?: string
  searchPlaceholder?: string
  onSearchChange?: (value: string) => void
  onClear?: () => void
  hasActiveFilters?: boolean
  children?: ReactNode
}

export function FilterBar({ searchValue, searchPlaceholder = "Search", onSearchChange, onClear, hasActiveFilters, children }: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {onSearchChange && (
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input value={searchValue ?? ""} onChange={(event) => onSearchChange(event.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder} className="h-8 pl-8 text-sm" />
        </div>
      )}
      {children}
      {hasActiveFilters && onClear && <Button variant="ghost" size="sm" onClick={onClear}><X data-icon="inline-start" aria-hidden="true" />Clear</Button>}
    </div>
  )
}

interface FilterSelectProps {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (value: string) => void
  allLabel?: string
}

export function FilterSelect({ label, value, options, onChange, allLabel = "All" }: FilterSelectProps) {
  return (
    <Select value={value || "all"} onValueChange={(next) => onChange(next === "all" ? "" : next)}>
      <SelectTrigger size="sm" className="h-8 w-auto min-w-36 text-sm" aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}
