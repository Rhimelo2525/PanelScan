import { createContext } from "react"

import type { AppNotification } from "@/types/notification"

export interface NotificationsContextValue {
  /** Null until the first count has loaded (or when signed out). */
  unreadCount: number | null
  /** The most recent notifications, for the header dropdown. */
  recent: AppNotification[]
  isLoadingRecent: boolean
  recentError: string | null
  /** Re-fetches the unread count and, when `includeRecent`, the dropdown list too. */
  refresh: (options?: { includeRecent?: boolean }) => Promise<void>
  markRead: (notification: AppNotification) => Promise<void>
  markAllRead: () => Promise<void>
  /** Bumped after every read-state change, so a page showing its own list knows to reload it. */
  version: number
}

export const NotificationsContext = createContext<NotificationsContextValue | null>(null)
