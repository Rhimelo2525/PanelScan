import { Bell, CheckCheck } from "lucide-react"
import { useState } from "react"
import { Link, useNavigate } from "react-router-dom"

import { useAuth } from "@/auth/use-auth"
import { NotificationIcon } from "@/components/notifications/notification-list-item"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { allNotificationsHref, formatNotificationFullTime, formatNotificationTime, notificationHref } from "@/notifications/notification-format"
import { useNotifications } from "@/notifications/use-notifications"
import type { AppNotification } from "@/types/notification"

interface NotificationBellProps {
  /** Matches the neighbouring header controls: the storefront's cart button, or the admin header's compact buttons. */
  size?: "icon-lg" | "icon-sm"
  className?: string
}

export function NotificationBell({ size = "icon-lg", className }: NotificationBellProps) {
  const { user } = useAuth()
  const { unreadCount, recent, isLoadingRecent, recentError, refresh, markRead, markAllRead } = useNotifications()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  if (!user) return null

  const hasUnread = (unreadCount ?? 0) > 0
  const label = unreadCount === null ? "Notifications" : `Notifications, ${unreadCount} unread`

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (next) void refresh({ includeRecent: true })
  }

  function handleSelect(notification: AppNotification) {
    void markRead(notification)
    const href = user ? notificationHref(notification, user.role) : null
    if (href) navigate(href)
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size={size} className={cn("relative", className)} aria-label={label}>
          <Bell aria-hidden="true" />
          {hasUnread && (
            <span className={cn("absolute flex min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[0.65rem] leading-5 font-semibold text-primary-foreground ring-2 ring-background", size === "icon-sm" ? "-top-2 -right-2" : "-top-1.5 -right-1.5")}>
              {(unreadCount ?? 0) > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" collisionPadding={16} className="w-[min(23rem,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
          <DropdownMenuLabel className="p-0 text-sm font-semibold text-foreground">Notifications</DropdownMenuLabel>
          <DropdownMenuItem
            disabled={!hasUnread}
            onSelect={(event) => {
              event.preventDefault()
              void markAllRead()
            }}
            className="h-7 px-2 text-xs font-medium text-primary"
          >
            <CheckCheck aria-hidden="true" />Mark all as read
          </DropdownMenuItem>
        </div>
        <DropdownMenuSeparator className="mx-0 my-0" />

        <div className="max-h-[min(24rem,60vh)] overflow-y-auto p-1">
          {isLoadingRecent && recent.length === 0 ? (
            <div className="space-y-3 p-2" aria-label="Loading notifications" aria-busy="true">
              {Array.from({ length: 3 }).map((_, index) => <div key={index} className="flex gap-3"><Skeleton className="size-8 rounded-full" /><div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-2/5" /><Skeleton className="h-3 w-4/5" /></div></div>)}
            </div>
          ) : recentError && recent.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">{recentError}</p>
          ) : recent.length === 0 ? (
            <div className="px-3 py-10 text-center">
              <Bell className="mx-auto size-6 text-muted-foreground" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium">You're all caught up</p>
              <p className="mt-1 text-xs text-muted-foreground">New updates will appear here.</p>
            </div>
          ) : (
            recent.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                onSelect={() => handleSelect(notification)}
                className={cn("items-start gap-3 rounded-md px-2.5 py-2.5", !notification.isRead && "bg-primary/5")}
              >
                <NotificationIcon notification={notification} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className={cn("text-sm leading-5", notification.isRead ? "font-medium text-foreground/85" : "font-semibold text-foreground")}>{notification.title}</span>
                    {!notification.isRead && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-xs leading-5 text-muted-foreground">{notification.message}</span>
                  <time dateTime={notification.createdAt} title={formatNotificationFullTime(notification.createdAt)} className="mt-1 block text-[0.7rem] text-muted-foreground">
                    {formatNotificationTime(notification.createdAt)}
                  </time>
                </span>
              </DropdownMenuItem>
            ))
          )}
        </div>

        <DropdownMenuSeparator className="mx-0 my-0" />
        <div className="p-1">
          <DropdownMenuItem asChild className="justify-center py-2 text-sm font-medium text-primary">
            <Link to={allNotificationsHref(user.role)}>View all notifications</Link>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
