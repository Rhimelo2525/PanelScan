import type { Booking, CustomerFeedback } from "@/api/support"
import type { DeliveryLocation, DeliveryRecord } from "@/types/delivery"

export type OrderStatus = "PENDING" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED"

export interface OrderCustomer {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
}

export interface OrderItem {
  id: string
  orderId: string
  productId: string
  productName: string
  unitPrice: string
  quantity: number
  lineTotal: string
  createdAt: string
}

export interface Order {
  id: string
  orderNumber: string
  customerId: string
  status: OrderStatus
  subtotal: string
  shippingFee: string
  totalAmount: string
  shippingAddress: string
  deliveryLocation?: DeliveryLocation | null
  notes: string | null
  createdAt: string
  updatedAt: string
  items: OrderItem[]
  customer: OrderCustomer
  booking?: Booking | null
  delivery?: DeliveryRecord | null
  moderatorApproved?: boolean
  feedback?: CustomerFeedback | null
}

export interface OrderPagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface PaginatedOrders {
  orders: Order[]
  pagination: OrderPagination
}

export interface CreateOrderInstallationInput {
  scheduledDate: string
  address: string
  notes?: string
}

export interface CreateOrderDirectItemInput {
  productId: string
  quantity: number
}

export interface CreateOrderInput {
  shippingAddress: string
  deliveryLocation?: DeliveryLocation
  notes?: string
  installation?: CreateOrderInstallationInput
  selectedItemIds?: string[]
  selectedProductIds?: string[]
  directItem?: CreateOrderDirectItemInput
}

export interface OrderQuery {
  page?: number
  limit?: number
  status?: OrderStatus
}
