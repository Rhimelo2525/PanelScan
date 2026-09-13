import { apiRequest } from "@/api/client"
import type { CreateOrderInput, Order, OrderQuery, PaginatedOrders } from "@/types/order"

interface OrderResponse {
  order: Order
}

export async function getOrders(query: OrderQuery = {}, signal?: AbortSignal): Promise<PaginatedOrders> {
  const search = new URLSearchParams()
  if (query.page) search.set("page", String(query.page))
  if (query.limit) search.set("limit", String(query.limit))
  if (query.status) search.set("status", query.status)
  const suffix = search.size ? `?${search.toString()}` : ""
  return apiRequest<PaginatedOrders>(`/orders${suffix}`, { authenticated: true, signal })
}

export async function getOrderById(orderId: string, signal?: AbortSignal): Promise<Order> {
  const response = await apiRequest<OrderResponse>(`/orders/${orderId}`, { authenticated: true, signal })
  return response.order
}

export async function createOrder(input: CreateOrderInput): Promise<Order> {
  const response = await apiRequest<OrderResponse>("/orders", { method: "POST", authenticated: true, body: input })
  return response.order
}

export async function cancelOrder(orderId: string): Promise<Order> {
  const response = await apiRequest<OrderResponse>(`/orders/${orderId}/cancel`, { method: "PATCH", authenticated: true })
  return response.order
}
