import type { Pagination } from "@/types/admin"

/** Mirrors the backend's NotificationType enum. Finer detail (delivery, stock, account...) lives in `metadata.event`. */
export type NotificationType = "ORDER" | "PAYMENT" | "BOOKING" | "CHAT" | "SYSTEM"

/** Pointers back to the record a notification is about. Every field is optional - each trigger sets only what applies. */
export interface NotificationMetadata {
  event?: string
  status?: string
  orderId?: string
  orderNumber?: string
  deliveryId?: string
  paymentId?: string
  bookingId?: string
  chatRoomId?: string
  productId?: string
  requestId?: string
  feedbackId?: string
  projectId?: string
  userId?: string
}

export interface AppNotification {
  id: string
  userId: string
  type: NotificationType
  title: string
  message: string
  isRead: boolean
  metadata: NotificationMetadata | null
  createdAt: string
}

export interface NotificationPage {
  notifications: AppNotification[]
  pagination: Pagination
}

export interface NotificationQuery {
  page?: number
  limit?: number
  type?: NotificationType
  isRead?: boolean
}
