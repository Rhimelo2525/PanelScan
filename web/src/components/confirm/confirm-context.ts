import { createContext } from "react"
import type { ReactNode } from "react"

export interface ConfirmDetail {
  label: string
  value: ReactNode
}

export interface ConfirmOptions {
  title: string
  description?: ReactNode
  /** Key facts shown before a transaction is confirmed (items, amounts, destination...). */
  details?: ConfirmDetail[]
  confirmLabel?: string
  cancelLabel?: string
  /** Red confirm button for deletions and other irreversible actions. */
  destructive?: boolean
}

/** Resolves true only when the user presses the confirm button; cancel, Esc or closing resolves false. */
export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

export const ConfirmContext = createContext<ConfirmFn | null>(null)
