import type { OrderStatus } from "@/types/order"

const orderDateFormatter = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Manila",
})

export function formatOrderDate(value: string): string {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "Date unavailable" : orderDateFormatter.format(date)
}

export function formatOrderStatus(status: OrderStatus): string {
  return status.charAt(0) + status.slice(1).toLowerCase()
}
