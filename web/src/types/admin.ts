import type { UserRole } from "@/types/auth"
import type { DeliveryApprovalStatus } from "@/types/delivery"
import type { OrderStatus } from "@/types/order"

/**
 * Backend-aligned admin contracts. Fields marked optional are omitted by the
 * backend for MODERATOR ("operational statistics only") rather than zeroed, so
 * `undefined` must always be rendered as "not available to your role" and never
 * as ₱0.00.
 */

export type ProjectStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"
export type BookingStatus = "PENDING" | "APPROVED" | "SCHEDULED" | "COMPLETED" | "CANCELLED"
/** CANCELLED = the submitting moderator withdrew it, distinct from an owner's REJECTED. */
export type RequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"
export type RequestType = "INVENTORY_RESTOCK" | "REFUND" | "DISCOUNT_APPROVAL" | "PROJECT_BUDGET_CHANGE" | "OTHER"

export interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface StatusBreakdown {
  status: string
  count: number
}

// ---------------------------------------------------------------- analytics

export interface DashboardStats {
  totalCustomers: number
  totalActiveProducts: number
  lowStockCount: number
  totalOrders: number
  ordersByStatus: StatusBreakdown[]
  totalBookings: number
  bookingsByStatus: StatusBreakdown[]
  totalProjects: number
  projectsByStatus: StatusBreakdown[]
  pendingRequests: number
  averageFeedbackRating: number | null
  /** OWNER only. */
  totalRevenue?: number
  /** OWNER only. */
  averageOrderValue?: number
}

export interface SalesStats {
  totalOrders: number
  ordersByStatus: StatusBreakdown[]
  totalRevenue?: number
  averageOrderValue?: number
  revenueByStatus?: Array<{ status: string; count: number; revenue: number }>
}

export interface TopProduct {
  productId: string
  name: string
  sku: string
  quantitySold: number
  revenue?: number
}

export interface ProductStats {
  totalActiveProducts: number
  lowStockCount: number
  topProducts: TopProduct[]
  pagination: Pagination
  totalInventoryValue?: number
}

export interface TopCustomer {
  customerId: string
  name: string
  orderCount: number
  totalSpent: number
}

export interface CustomerStats {
  totalCustomers: number
  activeCustomers: number
  newCustomers: number
  repeatCustomers: number
  topCustomers: TopCustomer[]
  pagination: Pagination
}

export interface ProjectStats {
  totalProjects: number
  projectsByStatus: StatusBreakdown[]
  unassignedProjects: number
  averageDurationDays: number | null
  moderatorWorkload: Array<{ moderatorId: string; name: string; projectCount: number }>
  pagination: Pagination
  totalBudget?: number
  averageBudget?: number
}

// ------------------------------------------------------------------ reports

/**
 * One order line - productName/quantity come from the immutable OrderItem
 * snapshot taken at purchase time; productImage is the PRODUCT's current
 * primary image (order items don't snapshot images, so a later re-upload
 * changes what's shown here - see backend reports.service.ts#toOrderRow).
 * unitPrice/lineTotal follow the same OWNER/MODERATOR visibility rule as
 * totalAmount below - absent entirely wherever totalAmount is.
 */
export interface OrderReportItem {
  id: string
  productId: string
  productName: string
  quantity: number
  productImage: { url: string; altText: string | null } | null
  unitPrice?: number
  lineTotal?: number
}

export interface OrderReportRow {
  id: string
  orderNumber: string
  customerId: string
  customerName: string
  status: OrderStatus
  moderatorApproved?: boolean
  isPaid?: boolean
  paymentStatus?: string | null
  shippingAddress?: string
  deliveryStatus?: string | null
  deliveryApprovalStatus?: DeliveryApprovalStatus
  deliveryRequestedAt?: string | null
  deliveryApprovedAt?: string | null
  deliveryDeclinedAt?: string | null
  deliveryDeclineReason?: string | null
  itemCount: number
  items: OrderReportItem[]
  createdAt: string
  totalAmount?: number
}

export interface SalesReport {
  summary: { totalOrders: number; ordersByStatus: StatusBreakdown[]; totalRevenue?: number; averageOrderValue?: number }
  orders: OrderReportRow[]
  pagination: Pagination
}

export interface OrdersReport {
  summary: { totalOrders: number; ordersByStatus: StatusBreakdown[] }
  orders: OrderReportRow[]
  pagination: Pagination
}

export interface InventoryReportRow {
  productId: string
  productName: string
  sku: string
  quantity: number
  reservedQty: number
  available: number
  reorderLevel: number
  isLowStock: boolean
  lastRestockedAt: string | null
  /** OWNER only. */
  unitPrice?: number
}

export interface InventoryReport {
  summary: { totalItems: number; lowStockCount: number; totalInventoryValue?: number }
  inventory: InventoryReportRow[]
  pagination: Pagination
}

// ---------------------------------------------------------------- inventory

export interface InventoryRecord {
  id: string
  productId: string
  quantity: number
  reservedQty: number
  reorderLevel: number
  warehouseLocation: string | null
  lastRestockedAt: string | null
  createdAt: string
  updatedAt: string
  product: { id: string; name: string; sku: string; slug: string }
}

// ----------------------------------------------------------------- projects

export interface ProjectPerson {
  id: string
  firstName: string
  lastName: string
  email: string
}

export type ProjectSource = "MANUAL" | "MOBILE_AR_3D"

export interface AdminProject {
  id: string
  customerId: string
  moderatorId: string | null
  ownerId: string | null
  name: string
  description: string | null
  notes: string | null
  status: ProjectStatus
  source?: ProjectSource
  externalProjectId?: string | null
  arDataUrl?: string | null
  arMetadata?: Record<string, unknown> | null
  threeDModelUrl?: string | null
  threeDMetadata?: Record<string, unknown> | null
  budget: string | null
  startDate: string | null
  endDate: string | null
  createdAt: string
  updatedAt: string
  customer?: ProjectPerson
  moderator?: ProjectPerson | null
  owner?: ProjectPerson | null
}

// ----------------------------------------------------------------- requests

export interface AdminRequest {
  id: string
  requestedById: string
  reviewedById: string | null
  type: RequestType
  status: RequestStatus
  title: string
  description: string | null
  reviewNote: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
  requestedBy?: ProjectPerson & { role: UserRole }
  reviewedBy?: (ProjectPerson & { role: UserRole }) | null
}

export interface CreateRequestInput {
  type: RequestType
  title: string
  description?: string
}

// -------------------------------------------------------------------- users

export interface AdminUser {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  role: UserRole
  isActive: boolean
  createdAt: string
  updatedAt: string
}

// --------------------------------------------------------------- installers

export interface Installer {
  id: string
  firstName: string
  lastName: string
  email: string | null
  phone: string
  specialty: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateInstallerInput {
  firstName: string
  lastName: string
  phone: string
  email?: string
  specialty?: string
}

// ----------------------------------------------------------------- feedback

export interface AdminFeedback {
  id: string
  customerId: string
  orderId: string | null
  rating: number
  comment: string | null
  createdAt: string
  updatedAt: string
  customer?: ProjectPerson
  order?: { id: string; orderNumber: string; status: OrderStatus } | null
}

// --------------------------------------------------------------------- chat

export interface ChatUser {
  id: string
  firstName: string
  lastName: string
  email?: string
  role: UserRole
}

/** Join row: the conversation's participants carry their own read state. */
export interface ChatParticipant {
  id: string
  chatRoomId: string
  userId: string
  joinedAt?: string
  lastReadAt?: string | null
  user: ChatUser
}

export interface ChatMessage {
  id: string
  chatRoomId: string
  senderId: string
  content: string
  isRead: boolean
  createdAt: string
  sender?: ChatUser
}

export interface ChatConversation {
  id: string
  subject: string | null
  isActive: boolean
  createdAt: string
  updatedAt: string
  participants: ChatParticipant[]
}

export interface AdminListQuery {
  page?: number
  limit?: number
  search?: string
  status?: string
  dateFrom?: string
  dateTo?: string
}

// ------------------------------------------------ installation requests / bookings

export interface AdminBookingOrderItem {
  id: string
  productId: string
  productName: string
  quantity: number
  unitPrice: number | string
  lineTotal: number | string
}

export interface AdminBookingOrder {
  id: string
  orderNumber: string
  status: OrderStatus
  totalAmount: number | string
  createdAt: string
  items: AdminBookingOrderItem[]
}

export interface AdminBookingCustomer {
  id: string
  firstName: string
  lastName: string
  email: string
  phone?: string | null
}

export interface AdminBooking {
  id: string
  customerId: string
  orderId: string | null
  installerId: string | null
  status: BookingStatus
  scheduledDate: string
  address: string
  notes: string | null
  createdAt: string
  updatedAt: string
  customer?: AdminBookingCustomer
  installer?: Installer | null
  order?: AdminBookingOrder | null
}

