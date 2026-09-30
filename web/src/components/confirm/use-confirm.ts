import { useContext } from "react"

import { ConfirmContext } from "@/components/confirm/confirm-context"

/**
 * `if (!(await confirm({ title: "..." }))) return` at the top of an action
 * handler: the action only runs when the user explicitly confirms.
 */
export function useConfirm() {
  const confirm = useContext(ConfirmContext)
  if (!confirm) throw new Error("useConfirm must be used inside ConfirmProvider")
  return confirm
}
