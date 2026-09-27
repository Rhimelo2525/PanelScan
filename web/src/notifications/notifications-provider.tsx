import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ReactNode } from "react"

import { getNotifications, getUnreadNotificationCount, markAllNotificationsRead, markNotificationRead } from "@/api/notifications"
import { useAuth } from "@/auth/use-auth"
import { useSilentPolling } from "@/hooks/use-silent-polling"
import { NotificationsContext } from "@/notifications/notifications-context"
import type { NotificationsContextValue } from "@/notifications/notifications-context"
import type { AppNotification } from "@/types/notification"

/**
 * The unread count is one indexed COUNT query, so it is what gets polled; the
 * heavier list is only fetched when the dropdown opens, or when the count moves
 * after the list has already been loaded once. Polling pauses while the tab is
 * hidden and catches up the moment it's visible again (see useSilentPolling).
 */
const UNREAD_POLL_MS = 15_000
const RECENT_LIMIT = 8

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: isAuthLoading } = useAuth()
  const [unreadCount, setUnreadCount] = useState<number | null>(null)
  const [recent, setRecent] = useState<AppNotification[]>([])
  const [isLoadingRecent, setIsLoadingRecent] = useState(false)
  const [recentError, setRecentError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  const userId = user?.id
  const currentUserIdRef = useRef(userId)
  currentUserIdRef.current = userId
  const hasLoadedRecentRef = useRef(false)
  const lastCountRef = useRef<number | null>(null)

  const loadRecent = useCallback(async () => {
    const requestUserId = currentUserIdRef.current
    if (!requestUserId) return
    setIsLoadingRecent(true)
    try {
      const page = await getNotifications({ limit: RECENT_LIMIT })
      if (currentUserIdRef.current !== requestUserId) return
      setRecent(page.notifications)
      setRecentError(null)
      hasLoadedRecentRef.current = true
    } catch {
      if (currentUserIdRef.current === requestUserId) setRecentError("Notifications could not be loaded.")
    } finally {
      if (currentUserIdRef.current === requestUserId) setIsLoadingRecent(false)
    }
  }, [])

  const refresh = useCallback(async (options?: { includeRecent?: boolean }) => {
    const requestUserId = currentUserIdRef.current
    if (!requestUserId) return
    try {
      const count = await getUnreadNotificationCount()
      if (currentUserIdRef.current !== requestUserId) return
      const changed = lastCountRef.current !== null && lastCountRef.current !== count
      lastCountRef.current = count
      setUnreadCount(count)
      if (options?.includeRecent || (changed && hasLoadedRecentRef.current)) await loadRecent()
    } catch {
      // Keep the last good count on screen; the next poll retries.
    }
  }, [loadRecent])

  useEffect(() => {
    setUnreadCount(null)
    setRecent([])
    setRecentError(null)
    hasLoadedRecentRef.current = false
    lastCountRef.current = null
    if (isAuthLoading || !userId) return
    const timer = window.setTimeout(() => void refresh(), 0)
    return () => window.clearTimeout(timer)
  }, [isAuthLoading, userId, refresh])

  useSilentPolling(refresh, userId ? UNREAD_POLL_MS : false)

  const markRead = useCallback(async (notification: AppNotification) => {
    if (notification.isRead) return
    setRecent((current) => current.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item)))
    setUnreadCount((count) => (count === null ? count : Math.max(0, count - 1)))
    lastCountRef.current = lastCountRef.current === null ? null : Math.max(0, lastCountRef.current - 1)
    try {
      await markNotificationRead(notification.id)
    } catch {
      await refresh({ includeRecent: true })
    } finally {
      setVersion((value) => value + 1)
    }
  }, [refresh])

  const markAllRead = useCallback(async () => {
    setRecent((current) => current.map((item) => ({ ...item, isRead: true })))
    setUnreadCount(0)
    lastCountRef.current = 0
    try {
      await markAllNotificationsRead()
    } catch {
      await refresh({ includeRecent: true })
    } finally {
      setVersion((value) => value + 1)
    }
  }, [refresh])

  const value = useMemo<NotificationsContextValue>(
    () => ({ unreadCount, recent, isLoadingRecent, recentError, refresh, markRead, markAllRead, version }),
    [unreadCount, recent, isLoadingRecent, recentError, refresh, markRead, markAllRead, version],
  )

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}
