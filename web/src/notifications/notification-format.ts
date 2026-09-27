import { Bell, Boxes, CreditCard, KeyRound, MessageSquare, Package, ShieldCheck, Star, TriangleAlert, Truck, UserRound, Wrench } from "lucide-react"
import type { LucideIcon } from "lucide-react"

import { isAdminRole } from "@/admin/admin-nav"
import type { UserRole } from "@/types/auth"
import type { AppNotification, NotificationType } from "@/types/notification"

export const notificationTypeLabels: Record<NotificationType, string> = {
  ORDER: "Orders & delivery",
  PAYMENT: "Payments",
  BOOKING: "Installation",
  CHAT: "Messages",
  SYSTEM: "System & account",
}

const eventIcons: Record<string, LucideIcon> = {
  LOW_STOCK: Boxes,
  OUT_OF_STOCK: Boxes,
  PRODUCT_BACK_IN_STOCK: Boxes,
  BACKUP_SYNC_FAILED: TriangleAlert,
  DELIVERY_API_ERROR: TriangleAlert,
  PAYMENT_API_ERROR: TriangleAlert,
  PASSWORD_CHANGED: KeyRound,
  PROFILE_UPDATED: UserRound,
  CUSTOMER_REGISTERED: UserRound,
  FEEDBACK_SUBMITTED: Star,
  REQUEST_SUBMITTED: ShieldCheck,
  REQUEST_APPROVED: ShieldCheck,
  REQUEST_REJECTED: ShieldCheck,
  REQUEST_CANCELLED: ShieldCheck,
}

const typeIcons: Record<NotificationType, LucideIcon> = {
  ORDER: Package,
  PAYMENT: CreditCard,
  BOOKING: Wrench,
  CHAT: MessageSquare,
  SYSTEM: Bell,
}

export function notificationIcon(notification: AppNotification): LucideIcon {
  const event = notification.metadata?.event
  if (event && eventIcons[event]) return eventIcons[event]
  if (event?.startsWith("DELIVERY") || notification.metadata?.deliveryId) return Truck
  return typeIcons[notification.type] ?? Bell
}

/** System problems get the critical tone so they stand out in the list. */
export function isAlertNotification(notification: AppNotification): boolean {
  const event = notification.metadata?.event ?? ""
  return event.endsWith("_API_ERROR") || event === "BACKUP_SYNC_FAILED" || event === "OUT_OF_STOCK"
}

/** Where clicking a notification takes each role, from the record pointers in its metadata. Null = nowhere more specific to go. */
export function notificationHref(notification: AppNotification, role: UserRole): string | null {
  const meta = notification.metadata ?? {}
  const event = meta.event ?? ""

  if (isAdminRole(role)) {
    if (meta.requestId) return "/admin/requests"
    if (meta.feedbackId) return "/admin/feedback"
    if (meta.chatRoomId) return "/admin/chat"
    if (meta.productId) return "/admin/inventory"
    if (meta.bookingId) return "/admin/installation-requests"
    if (meta.deliveryId || event.startsWith("DELIVERY")) return "/admin/deliveries"
    if (meta.projectId) return "/admin/projects"
    if (event === "CUSTOMER_REGISTERED") return role === "OWNER" ? "/admin/team" : null
    if (meta.orderId) return "/admin/sales"
    return null
  }

  if (event === "PASSWORD_CHANGED" || event === "PROFILE_UPDATED") return "/profile"
  if (meta.chatRoomId) return "/messages"
  if (meta.bookingId && !meta.orderId) return "/installation"
  if (meta.orderId) return `/orders/${meta.orderId}`
  if (meta.projectId) return "/projects"
  if (meta.productId) return `/products/${meta.productId}`
  return null
}

export function allNotificationsHref(role: UserRole): string {
  return isAdminRole(role) ? "/admin/notifications" : "/notifications"
}

const timeFormatter = new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" })
const dateTimeFormatter = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Manila" })
const fullDateTimeFormatter = new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Manila" })
const manilaDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" })

/** "Just now" / "5 minutes ago" / "Today, 9:00 AM" / "Yesterday, 4:12 PM" / "Sep 23, 9:00 AM", in Philippine time. */
export function formatNotificationTime(value: string, now: Date = new Date()): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60000)
  if (minutes < 1) return "Just now"
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`

  const day = manilaDay.format(date)
  if (day === manilaDay.format(now)) return `Today, ${timeFormatter.format(date)}`
  if (day === manilaDay.format(new Date(now.getTime() - 86_400_000))) return `Yesterday, ${timeFormatter.format(date)}`
  return dateTimeFormatter.format(date)
}

export function formatNotificationFullTime(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "" : fullDateTimeFormatter.format(date)
}
