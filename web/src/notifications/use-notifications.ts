import { useContext } from "react"

import { NotificationsContext } from "@/notifications/notifications-context"
import type { NotificationsContextValue } from "@/notifications/notifications-context"

export function useNotifications(): NotificationsContextValue {
  const context = useContext(NotificationsContext)
  if (!context) throw new Error("useNotifications must be used inside NotificationsProvider")
  return context
}
