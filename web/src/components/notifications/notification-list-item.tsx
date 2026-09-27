import { Check } from "lucide-react"
import { Link } from "react-router-dom"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatNotificationFullTime, formatNotificationTime, isAlertNotification, notificationIcon, notificationTypeLabels } from "@/notifications/notification-format"
import type { AppNotification } from "@/types/notification"

export function NotificationIcon({ notification, className }: { notification: AppNotification; className?: string }) {
  const Icon = notificationIcon(notification)
  const isAlert = isAlertNotification(notification)
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-full",
        isAlert ? "bg-[var(--status-critical-surface)] text-[var(--status-critical)]" : "bg-secondary text-primary",
        className,
      )}
      aria-hidden="true"
    >
      <Icon className="size-4" />
    </span>
  )
}

interface NotificationListItemProps {
  notification: AppNotification
  href: string | null
  onMarkRead: (notification: AppNotification) => void
}

/** One row of the "View all notifications" page: type, message, date and read state, with a mark-as-read action. */
export function NotificationListItem({ notification, href, onMarkRead }: NotificationListItemProps) {
  const title = <span className={cn("text-sm leading-5", notification.isRead ? "font-medium" : "font-semibold")}>{notification.title}</span>

  return (
    <li className={cn("flex gap-3 px-4 py-4 sm:px-5", !notification.isRead && "bg-primary/5")}>
      <NotificationIcon notification={notification} className="mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {href ? (
            <Link to={href} onClick={() => onMarkRead(notification)} className="hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">{title}</Link>
          ) : title}
          {!notification.isRead && <span className="size-2 rounded-full bg-primary" aria-hidden="true" />}
        </div>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{notification.message}</p>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <time dateTime={notification.createdAt} title={formatNotificationFullTime(notification.createdAt)}>{formatNotificationTime(notification.createdAt)}</time>
          <span aria-hidden="true">·</span>
          <span>{notificationTypeLabels[notification.type]}</span>
          <span aria-hidden="true">·</span>
          <span>{notification.isRead ? "Read" : "Unread"}</span>
        </p>
      </div>
      {!notification.isRead && (
        <Button variant="ghost" size="icon-sm" className="shrink-0 text-muted-foreground" onClick={() => onMarkRead(notification)} aria-label={`Mark "${notification.title}" as read`} title="Mark as read">
          <Check aria-hidden="true" />
        </Button>
      )}
    </li>
  )
}
