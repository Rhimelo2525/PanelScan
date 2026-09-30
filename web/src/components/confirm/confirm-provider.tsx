import { useCallback, useRef, useState } from "react"
import type { ReactNode } from "react"

import { ConfirmContext } from "@/components/confirm/confirm-context"
import type { ConfirmOptions } from "@/components/confirm/confirm-context"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"

/**
 * One app-wide confirmation dialog built from the existing AlertDialog, so
 * every confirmation looks like the ones already in the app. Only one can be
 * open at a time: a second request while one is showing (e.g. a double click
 * on the button that opened it) is answered "no" instead of queueing a
 * duplicate action.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolverRef = useRef<((confirmed: boolean) => void) | null>(null)

  const confirm = useCallback((next: ConfirmOptions) => {
    if (resolverRef.current) return Promise.resolve(false)
    setOptions(next)
    return new Promise<boolean>((resolve) => { resolverRef.current = resolve })
  }, [])

  const settle = useCallback((confirmed: boolean) => {
    const resolve = resolverRef.current
    resolverRef.current = null
    setOptions(null)
    resolve?.(confirmed)
  }, [])

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={options !== null} onOpenChange={(open) => { if (!open) settle(false) }}>
        {options && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{options.title}</AlertDialogTitle>
              {options.description && <AlertDialogDescription>{options.description}</AlertDialogDescription>}
            </AlertDialogHeader>
            {options.details && options.details.length > 0 && (
              <dl className="space-y-1.5 rounded-md border border-border bg-secondary/40 px-3 py-2.5 text-sm" data-slot="confirm-details">
                {options.details.map((detail) => (
                  <div key={detail.label} className="flex items-start justify-between gap-4">
                    <dt className="text-muted-foreground">{detail.label}</dt>
                    <dd className="text-right font-medium">{detail.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => settle(false)}>{options.cancelLabel ?? "Cancel"}</AlertDialogCancel>
              <AlertDialogAction variant={options.destructive ? "destructive" : "default"} onClick={() => settle(true)}>
                {options.confirmLabel ?? "Confirm"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </ConfirmContext.Provider>
  )
}
