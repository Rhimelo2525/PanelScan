import * as React from "react"
import { Popover } from "radix-ui"
import { Check, ChevronsUpDown, Search } from "lucide-react"
import { cn } from "@/lib/utils"

export interface ComboboxOption {
  value: string
  label: string
  secondaryText?: string
}

export interface ComboboxProps {
  id?: string
  name?: string
  placeholder?: string
  searchPlaceholder?: string
  options: ComboboxOption[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  error?: string
  className?: string
  emptyMessage?: string
}

export function Combobox({
  id,
  name,
  placeholder = "Select an option...",
  searchPlaceholder = "Type to search...",
  options,
  value,
  onChange,
  disabled = false,
  error,
  className,
  emptyMessage = "No results found.",
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const searchInputRef = React.useRef<HTMLInputElement>(null)

  const selectedOption = React.useMemo(
    () => options.find((opt) => opt.value === value),
    [options, value]
  )

  const filteredOptions = React.useMemo(() => {
    if (!search.trim()) return options
    const q = search.toLowerCase()
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        (opt.secondaryText && opt.secondaryText.toLowerCase().includes(q))
    )
  }, [options, search])

  React.useEffect(() => {
    if (open) {
      setSearch("")
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 10)
    }
  }, [open])

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          id={id}
          name={name}
          disabled={disabled}
          aria-expanded={open}
          aria-invalid={Boolean(error)}
          className={cn(
            "flex h-11 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground transition-colors outline-none select-none",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            "disabled:cursor-not-allowed disabled:bg-muted/30 disabled:opacity-50",
            "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
            className
          )}
        >
          <span className={cn("truncate", !selectedOption && "text-muted-foreground")}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" aria-hidden="true" />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          className="z-50 w-(--radix-popover-trigger-width) min-w-[12rem] rounded-md border border-border bg-popover text-popover-foreground shadow-md outline-none animate-in fade-in-0 zoom-in-95"
        >
          <div className="flex items-center border-b border-border px-3 py-2">
            <Search className="mr-2 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              ref={searchInputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="flex h-7 w-full rounded-none bg-transparent text-sm placeholder:text-muted-foreground outline-none"
            />
          </div>

          <div className="max-h-60 overflow-y-auto p-1 text-sm">
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                {emptyMessage}
              </div>
            ) : (
              filteredOptions.map((option) => {
                const isSelected = option.value === value
                return (
                  <div
                    key={option.value}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(option.value)
                      setOpen(false)
                    }}
                    className={cn(
                      "flex cursor-pointer items-center justify-between rounded-sm px-2.5 py-2 text-sm transition-colors select-none",
                      "hover:bg-accent hover:text-accent-foreground",
                      isSelected && "bg-accent/60 font-medium text-accent-foreground"
                    )}
                  >
                    <div className="flex flex-col truncate">
                      <span className="truncate">{option.label}</span>
                      {option.secondaryText && (
                        <span className="text-[0.75rem] text-muted-foreground">
                          {option.secondaryText}
                        </span>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="ml-2 size-4 shrink-0 text-primary" aria-hidden="true" />
                    )}
                  </div>
                )
              })
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
