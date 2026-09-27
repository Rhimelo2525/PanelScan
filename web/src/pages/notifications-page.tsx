import { BellOff, CheckCheck } from "lucide-react"
import { useEffect, useState } from "react"

import { getNotifications } from "@/api/notifications"
import { useAuth } from "@/auth/use-auth"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { EmptyState, ErrorState } from "@/components/admin/empty-state"
import { FilterBar, FilterSelect } from "@/components/admin/filter-bar"
import { Container } from "@/components/layout/container"
import { NotificationListItem } from "@/components/notifications/notification-list-item"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { notificationHref, notificationTypeLabels } from "@/notifications/notification-format"
import { useNotifications } from "@/notifications/use-notifications"
import type { AppNotification, NotificationPage, NotificationType } from "@/types/notification"

const PAGE_SIZE = 20

const typeOptions = (Object.keys(notificationTypeLabels) as NotificationType[]).map((value) => ({ value, label: notificationTypeLabels[value] }))
const readOptions = [
  { value: "unread", label: "Unread" },
  { value: "read", label: "Read" },
]

/**
 * Full notification history for the signed-in user, in whichever shell they
 * reached it from: the storefront (customers) or the Admin (moderators/owner).
 */
export function NotificationsPage({ variant }: { variant: "customer" | "admin" }) {
  useDocumentTitle(variant === "admin" ? "Notifications | PanelScan Admin" : "Notifications | PanelScan")
  const { user } = useAuth()
  const { unreadCount, markRead, markAllRead, version } = useNotifications()
  const [type, setType] = useState("")
  const [readFilter, setReadFilter] = useState("")
  const [page, setPage] = useState(1)
  const [data, setData] = useState<NotificationPage | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)

  // Reloads on filter/page changes, after any read-state change (`version`),
  // and whenever the polled unread count moves - i.e. a new notification arrived.
  useEffect(() => {
    const controller = new AbortController()
    setError(null)
    getNotifications({
      page,
      limit: PAGE_SIZE,
      type: (type || undefined) as NotificationType | undefined,
      isRead: readFilter ? readFilter === "read" : undefined,
    }, controller.signal).then((result) => {
      setData(result)
    }).catch((caughtError) => {
      if (caughtError instanceof DOMException && caughtError.name === "AbortError") return
      setError("Your notifications could not be loaded. Please try again.")
    }).finally(() => {
      if (!controller.signal.aborted) setIsLoading(false)
    })
    return () => controller.abort()
  }, [page, type, readFilter, version, unreadCount, retryKey])

  if (!user) return null

  function changeFilter(setter: (value: string) => void, value: string) {
    setter(value)
    setPage(1)
    setIsLoading(true)
  }

  function handleMarkRead(notification: AppNotification) {
    setData((current) => current && { ...current, notifications: current.notifications.map((item) => (item.id === notification.id ? { ...item, isRead: true } : item)) })
    void markRead(notification)
  }

  const hasActiveFilters = Boolean(type || readFilter)
  const markAllButton = (
    <Button variant="outline" size={variant === "admin" ? "sm" : "default"} disabled={!unreadCount} onClick={() => void markAllRead()}>
      <CheckCheck data-icon="inline-start" aria-hidden="true" />Mark all as read
    </Button>
  )

  const filters = (
    <FilterBar hasActiveFilters={hasActiveFilters} onClear={() => { setType(""); setReadFilter(""); setPage(1); setIsLoading(true) }}>
      <FilterSelect label="Type" value={type} options={typeOptions} allLabel="All types" onChange={(value) => changeFilter(setType, value)} />
      <FilterSelect label="Status" value={readFilter} options={readOptions} allLabel="Read and unread" onChange={(value) => changeFilter(setReadFilter, value)} />
    </FilterBar>
  )

  const pagination = data?.pagination
  const body = isLoading && !data ? (
    <div className="divide-y divide-border rounded-lg border border-border bg-card" aria-label="Loading notifications" aria-busy="true">
      {Array.from({ length: 5 }).map((_, index) => <div key={index} className="flex gap-3 p-5"><Skeleton className="size-8 rounded-full" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-48" /><Skeleton className="h-3.5 w-3/4" /><Skeleton className="h-3 w-32" /></div></div>)}
    </div>
  ) : error && !data ? (
    <ErrorState message={error} onRetry={() => { setIsLoading(true); setRetryKey((value) => value + 1) }} />
  ) : !data || data.notifications.length === 0 ? (
    <EmptyState icon={BellOff} title={hasActiveFilters ? "No notifications match these filters" : "No notifications yet"} description={hasActiveFilters ? "Try a different type or status." : "Updates about your activity on PanelScan will appear here."} />
  ) : (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
      {data.notifications.map((notification) => (
        <NotificationListItem key={notification.id} notification={notification} href={notificationHref(notification, user.role)} onMarkRead={handleMarkRead} />
      ))}
    </ul>
  )

  const pager = pagination && pagination.totalPages > 1 && (
    <nav className="mt-6 flex items-center justify-between" aria-label="Notification pages">
      <Button variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button>
      <p className="text-sm text-muted-foreground">Page {pagination.page} of {pagination.totalPages}</p>
      <Button variant="outline" disabled={page >= pagination.totalPages} onClick={() => setPage((value) => value + 1)}>Next</Button>
    </nav>
  )

  if (variant === "admin") {
    return (
      <div className="space-y-5">
        <AdminPageHeader eyebrow="Overview" title="Notifications" description="Orders, deliveries, installations, payments, inventory and system alerts for your account." actions={markAllButton} />
        {filters}
        {body}
        {pager}
      </div>
    )
  }

  return (
    <Container className="py-10 sm:py-14 lg:py-18">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-3xl"><p className="section-eyebrow">Customer account</p><h1 className="type-h1 mt-4">Notifications</h1><p className="mt-4 text-base leading-7 text-muted-foreground">Updates on your orders, deliveries, installations, payments and account.</p></div>
        {markAllButton}
      </div>
      <div className="mt-8">{filters}</div>
      <div className="mt-5">{body}</div>
      {pager}
    </Container>
  )
}
