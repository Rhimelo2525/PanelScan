import { apiRequest } from "@/api/client"
import type { AppNotification, NotificationPage, NotificationQuery } from "@/types/notification"

/** Every role reads only its own notifications - the backend scopes all of these to the signed-in user. */

export async function getNotifications(query: NotificationQuery = {}, signal?: AbortSignal): Promise<NotificationPage> {
  const params = new URLSearchParams()
  if (query.page) params.set("page", String(query.page))
  if (query.limit) params.set("limit", String(query.limit))
  if (query.type) params.set("type", query.type)
  if (query.isRead !== undefined) params.set("isRead", String(query.isRead))
  const search = params.toString()
  return apiRequest<NotificationPage>(`/notifications${search ? `?${search}` : ""}`, { authenticated: true, signal })
}

export async function getUnreadNotificationCount(signal?: AbortSignal): Promise<number> {
  const response = await apiRequest<{ count: number }>("/notifications/unread/count", { authenticated: true, signal })
  return response.count
}

export async function markNotificationRead(id: string): Promise<AppNotification> {
  const response = await apiRequest<{ notification: AppNotification }>(`/notifications/${id}/read`, { method: "PATCH", authenticated: true })
  return response.notification
}

export async function markAllNotificationsRead(): Promise<number> {
  const response = await apiRequest<{ count: number }>("/notifications/read-all", { method: "PATCH", authenticated: true })
  return response.count
}
