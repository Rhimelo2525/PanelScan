import { apiRequest } from "@/api/client"
import type { PanelProfile, Product } from "@/types/product"
import type {
  AdminBooking,
  DashboardArchiveDetail,
  DashboardArchiveSummary,
  DashboardRangeReport,
  DashboardCycle,
  AdminFeedback,
  AdminListQuery,
  AdminProject,
  ProjectSource,
  AdminRequest,
  AdminUser,
  BookingStatus,
  ChatConversation,
  ChatMessage,
  CreateInstallerInput,
  CreateRequestInput,
  CustomerStats,
  DashboardStats,
  InventoryRecord,
  InventoryReport,
  Installer,
  OrdersReport,
  Pagination,
  ProductStats,
  ProjectCustomer,
  ProjectStats,
  SalesReport,
  SalesStats,
} from "@/types/admin"

/**
 * Every call here goes through the shared authenticated client, so admin
 * requests reuse the same access token, refresh lock, and error envelope as the
 * storefront. There is no separate admin token system.
 *
 * Role scoping is the backend's job: MODERATOR responses simply omit financial
 * fields, and endpoints a role may not touch return 403. Nothing here assumes a
 * role - the pages ask for what they need and render what comes back.
 */

function toQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value))
  }
  return search.size ? `?${search.toString()}` : ""
}

// ---------------------------------------------------------------- analytics

export function getDashboardStats(signal?: AbortSignal) {
  return apiRequest<DashboardStats>("/analytics/dashboard", { authenticated: true, signal })
}

export function getSalesStats(query: AdminListQuery = {}, signal?: AbortSignal) {
  return apiRequest<SalesStats>(`/analytics/sales${toQuery({ dateFrom: query.dateFrom, dateTo: query.dateTo })}`, { authenticated: true, signal })
}

export function getProductStats(query: AdminListQuery = {}, signal?: AbortSignal) {
  return apiRequest<ProductStats>(`/analytics/products${toQuery({ ...query })}`, { authenticated: true, signal })
}

export function getCustomerStats(query: AdminListQuery = {}, signal?: AbortSignal) {
  return apiRequest<CustomerStats>(`/analytics/customers${toQuery({ ...query })}`, { authenticated: true, signal })
}

export function getProjectStats(query: AdminListQuery = {}, signal?: AbortSignal) {
  return apiRequest<ProjectStats>(`/analytics/projects${toQuery({ ...query })}`, { authenticated: true, signal })
}

// ------------------------------------------------------------------ reports

export function getSalesReport(query: AdminListQuery = {}, signal?: AbortSignal) {
  return apiRequest<SalesReport>(`/reports/sales${toQuery({ ...query })}`, { authenticated: true, signal })
}

export function getOrdersReport(query: AdminListQuery = {}, signal?: AbortSignal) {
  return apiRequest<OrdersReport>(`/reports/orders${toQuery({ ...query })}`, { authenticated: true, signal })
}

export function getInventoryReport(query: AdminListQuery = {}, signal?: AbortSignal) {
  return apiRequest<InventoryReport>(`/reports/inventory${toQuery({ ...query })}`, { authenticated: true, signal })
}

// ----------------------------------------------------------------- products

export interface CreateProductAdminInput {
  categoryId: string
  name: string
  sku: string
  price: number
  description?: string
  width?: number
  height?: number
  thickness?: number
  unit?: string
  material?: string
  stock?: number
  reorderLevel?: number
  isFeatured?: boolean
  images?: Array<{ url: string; altText?: string; isPrimary?: boolean; sortOrder?: number }>
  /** 3D preview settings (admin/panel-3d.ts); null clears one. */
  panelProfile?: PanelProfile | null
  grooveCount?: number | null
  surfaceImageUrl?: string | null
}

/** Creates products. For MODERATOR, creates an approval request. */
export function createProduct(body: CreateProductAdminInput) {
  return apiRequest<{ product?: Product; request?: AdminRequest; requiresApproval?: boolean }>("/products", { method: "POST", authenticated: true, body })
}

export interface UpdateProductAdminInput {
  name?: string
  categoryId?: string
  sku?: string
  price?: number
  material?: string
  description?: string
  unit?: string
  width?: number
  height?: number
  thickness?: number
  stock?: number
  reorderLevel?: number
  isActive?: boolean
  isFeatured?: boolean
  images?: Array<{ url: string; altText?: string; isPrimary?: boolean; sortOrder?: number }>
  /** 3D preview settings (admin/panel-3d.ts); null clears one. */
  panelProfile?: PanelProfile | null
  grooveCount?: number | null
  surfaceImageUrl?: string | null
}

/** Updates product details. For MODERATOR, creates an approval request. */
export function updateProduct(id: string, body: UpdateProductAdminInput) {
  return apiRequest<{ product?: Product; request?: AdminRequest; requiresApproval?: boolean }>(`/products/${id}`, { method: "PATCH", authenticated: true, body })
}

/** Soft-deletes a product listing. For MODERATOR, creates an approval request. */
export function deleteProduct(id: string) {
  return apiRequest<{ product?: Product; request?: AdminRequest; requiresApproval?: boolean }>(`/products/${id}`, { method: "DELETE", authenticated: true })
}

/** OWNER and MODERATOR can upload persisted product imagery. */
export function uploadProductImage(file: File) {
  const formData = new FormData()
  formData.append("image", file)
  return apiRequest<{ url: string; relativeUrl: string; filename: string }>("/upload", {
    method: "POST",
    authenticated: true,
    body: formData,
  })
}

// ---------------------------------------------------------------- inventory

/** The backend accepts page/limit only here - search and low-stock filtering are applied in the UI. */
export function getInventory(query: { page?: number; limit?: number } = {}, signal?: AbortSignal) {
  return apiRequest<{ inventory: InventoryRecord[]; pagination: Pagination }>(`/inventory${toQuery({ ...query })}`, { authenticated: true, signal })
}

export function getLowStock(signal?: AbortSignal) {
  return apiRequest<{ inventory: InventoryRecord[] }>("/inventory/low-stock", { authenticated: true, signal })
}

export interface CreateInventoryAdminInput {
  productId: string
  quantity: number
  reorderLevel?: number
  warehouseLocation?: string
}

export function createInventory(body: CreateInventoryAdminInput) {
  return apiRequest<{ inventory?: InventoryRecord; request?: AdminRequest; requiresApproval?: boolean }>("/inventory", {
    method: "POST",
    authenticated: true,
    body,
  })
}

export function deleteInventory(productId: string) {
  return apiRequest<{ request?: AdminRequest; requiresApproval?: boolean }>(`/inventory/${productId}`, {
    method: "DELETE",
    authenticated: true,
  })
}

export function getAvailableProductsForRecordStock(signal?: AbortSignal) {
  return apiRequest<{ products: Product[] }>("/inventory/available-products", { authenticated: true, signal })
}

export function addStock(productId: string, quantity: number) {
  return apiRequest<{ inventory?: InventoryRecord; request?: AdminRequest; requiresApproval?: boolean }>(`/inventory/${productId}/add`, { method: "PATCH", authenticated: true, body: { quantity } })
}

export function reduceStock(productId: string, quantity: number) {
  return apiRequest<{ inventory?: InventoryRecord; request?: AdminRequest; requiresApproval?: boolean }>(`/inventory/${productId}/reduce`, { method: "PATCH", authenticated: true, body: { quantity } })
}

export function adjustStock(productId: string, targetQuantity: number) {
  return apiRequest<{ inventory?: InventoryRecord; request?: AdminRequest; requiresApproval?: boolean }>(`/inventory/${productId}/adjust`, { method: "PATCH", authenticated: true, body: { targetQuantity } })
}

// ----------------------------------------------------------------- projects

/** Customer projects are view-only for staff: the backend has no staff route that changes one. ?code= finds one by its reference code. */
export function getProjects(query: AdminListQuery & { moderatorId?: string; customerId?: string; source?: ProjectSource; externalProjectId?: string; code?: string } = {}, signal?: AbortSignal) {
  return apiRequest<{ projects: AdminProject[]; pagination: Pagination }>(`/projects${toQuery({ ...query })}`, { authenticated: true, signal })
}

/** Staff only: the photo of the wall a customer measured (wallPhotoUrl from the project), with the outline and size drawn on it. */
export function fetchProjectWallPhoto(path: string, signal?: AbortSignal) {
  return apiRequest<Blob>(path, { authenticated: true, responseType: "blob", signal })
}

export function getProjectById(id: string, signal?: AbortSignal) {
  return apiRequest<{ project: AdminProject }>(`/projects/${id}`, { authenticated: true, signal })
}

/** OWNER/MODERATOR: customers who have projects, most recently active first. */
export function getProjectCustomers(query: { page?: number; limit?: number; search?: string; source?: ProjectSource } = {}, signal?: AbortSignal) {
  return apiRequest<{ customers: ProjectCustomer[]; pagination: Pagination }>(`/projects/customers${toQuery({ ...query })}`, { authenticated: true, signal })
}

// ------------------------------------------------------------------- orders

/** OWNER/MODERATOR fulfilment update. Payment state is never changed from here. */
export function updateOrderStatus(orderId: string, status: string) {
  return apiRequest<{ order: { id: string; status: string } }>(`/orders/${orderId}/status`, { method: "PATCH", authenticated: true, body: { status } })
}

/** MODERATOR only. Approves the order; its delivery then waits for the moderator's shipping quote. */
export function approveOrder(orderId: string) {
  return apiRequest<{ order: { id: string; status: string; moderatorApproved: boolean } }>(`/orders/${orderId}/approve`, { method: "PATCH", authenticated: true })
}


// ----------------------------------------------------------------- requests

export function getRequests(query: AdminListQuery & { type?: string; kind?: string; sortBy?: "title" | "createdAt" | "reviewedAt"; sortOrder?: "asc" | "desc" } = {}, signal?: AbortSignal) {
  return apiRequest<{ requests: AdminRequest[]; pagination: Pagination }>(`/requests${toQuery({ ...query })}`, { authenticated: true, signal })
}

/** MODERATOR only. */
export function createRequest(body: CreateRequestInput) {
  return apiRequest<{ request: AdminRequest }>("/requests", { method: "POST", authenticated: true, body })
}

/** OWNER only. */
export function approveRequest(id: string, reviewNote?: string) {
  return apiRequest<{ request: AdminRequest }>(`/requests/${id}/approve`, { method: "PATCH", authenticated: true, body: reviewNote ? { reviewNote } : {} })
}

/** OWNER only. */
export function rejectRequest(id: string, reviewNote?: string) {
  return apiRequest<{ request: AdminRequest }>(`/requests/${id}/reject`, { method: "PATCH", authenticated: true, body: reviewNote ? { reviewNote } : {} })
}

// -------------------------------------------------------------------- users

export interface CreateModeratorInput {
  firstName: string
  lastName: string
  email: string
  phone?: string
  role?: "MODERATOR" | "OWNER"
}

/** OWNER only: runs every staff-email rule (provider, temp mail, mailbox, already used) without inviting anyone. */
export function checkStaffEmail(email: string) {
  return apiRequest<void>("/users/check-email", { method: "POST", authenticated: true, body: { email } })
}

/** OWNER only. Invites a staff member: the account stays pending until they verify the emailed code and set a password. */
export function createModerator(body: CreateModeratorInput) {
  return apiRequest<{ user: AdminUser }>("/users", { method: "POST", authenticated: true, body })
}

/** OWNER only. The backend returns every user; role filtering happens in the UI. */
export function getUsers(signal?: AbortSignal) {
  return apiRequest<{ users: AdminUser[] }>("/users", { authenticated: true, signal })
}

/** OWNER only. Sets isActive=false; there is no reactivate endpoint. */
export function deactivateUser(id: string) {
  return apiRequest<{ user: AdminUser }>(`/users/${id}`, { method: "DELETE", authenticated: true })
}

/** OWNER: edits an account's name or phone (`phone: null` clears it). */
export function updateUser(id: string, body: { firstName?: string; lastName?: string; phone?: string | null }) {
  return apiRequest<{ user: AdminUser }>(`/users/${id}`, { method: "PATCH", authenticated: true, body })
}

/** OWNER only: lets a restricted account sign in again. */
export function reactivateUser(id: string) {
  return apiRequest<{ user: AdminUser }>(`/users/${id}/reactivate`, { method: "PATCH", authenticated: true })
}

/** OWNER only: emails a new invitation code to a staff member who has not activated their account. */
export function resendStaffInvitation(id: string) {
  return apiRequest<{ user: AdminUser }>(`/users/${id}/resend-invitation`, { method: "POST", authenticated: true })
}

/** OWNER only: emails an active moderator a code to choose a new password (the owner never sees it). */
export function sendStaffPasswordReset(id: string) {
  return apiRequest<void>(`/users/${id}/send-password-reset`, { method: "POST", authenticated: true })
}

/** OWNER only: permanently removes a restricted account, or cancels a pending invitation. */
export function removeUser(id: string) {
  return apiRequest<void>(`/users/${id}/permanent`, { method: "DELETE", authenticated: true })
}

// --------------------------------------------------------------- installers

/** MODERATOR only - the backend 403s an OWNER on every installer route. */
export function getInstallers(query: AdminListQuery = {}, signal?: AbortSignal) {
  return apiRequest<{ installers: Installer[]; pagination: Pagination }>(`/installers${toQuery({ ...query })}`, { authenticated: true, signal })
}

export function createInstaller(body: CreateInstallerInput) {
  return apiRequest<{ installer: Installer }>("/installers", { method: "POST", authenticated: true, body })
}

export function deactivateInstaller(id: string) {
  return apiRequest<{ installer: Installer }>(`/installers/${id}/deactivate`, { method: "PATCH", authenticated: true })
}

// ----------------------------------------------------------------- feedback

export function getFeedback(query: AdminListQuery = {}, signal?: AbortSignal) {
  return apiRequest<{ feedbacks: AdminFeedback[]; pagination: Pagination }>(`/feedback${toQuery({ ...query })}`, { authenticated: true, signal })
}

// --------------------------------------------------------------------- chat

export function getConversations(query: AdminListQuery = {}, signal?: AbortSignal) {
  return apiRequest<{ conversations: ChatConversation[]; pagination: Pagination }>(`/chat${toQuery({ ...query })}`, { authenticated: true, signal })
}

export function getMessages(conversationId: string, query: AdminListQuery = {}, signal?: AbortSignal) {
  return apiRequest<{ messages: ChatMessage[]; pagination: Pagination }>(`/chat/${conversationId}/messages${toQuery({ ...query })}`, { authenticated: true, signal })
}

/** CUSTOMER or MODERATOR only - OWNER is read-only on chat by backend rule. */
export function sendMessage(conversationId: string, content: string) {
  return apiRequest<{ message: ChatMessage }>(`/chat/${conversationId}/messages`, { method: "POST", authenticated: true, body: { content } })
}

// ------------------------------------------------ installation requests / bookings

export function getBookings(query: AdminListQuery & { onlyOrders?: boolean } = {}, signal?: AbortSignal) {
  return apiRequest<{ bookings: AdminBooking[]; pagination: Pagination }>(`/bookings/all${toQuery({ ...query, onlyOrders: query.onlyOrders ? "true" : undefined })}`, { authenticated: true, signal })
}

export function getBookingById(id: string, signal?: AbortSignal) {
  return apiRequest<{ booking: AdminBooking }>(`/bookings/${id}`, { authenticated: true, signal })
}

/** MODERATOR only. Backend rejects OWNER with 403. */
export function updateBookingStatus(id: string, status: BookingStatus, scheduledDate?: string) {
  return apiRequest<{ booking: AdminBooking }>(`/bookings/${id}/status`, {
    method: "PATCH",
    authenticated: true,
    body: { status, ...(scheduledDate ? { scheduledDate } : {}) },
  })
}

/** MODERATOR only. Backend rejects OWNER with 403. */
export function assignBookingInstaller(id: string, installerId: string) {
  return apiRequest<{ booking: AdminBooking }>(`/bookings/${id}/assign-installer`, {
    method: "PATCH",
    authenticated: true,
    body: { installerId },
  })
}

// ---------------------------------------------------- monthly cycles / archives

/** OWNER/MODERATOR: the dashboard's current monthly cycle (revenue omitted for a moderator). */
export function getDashboardCycle(signal?: AbortSignal) {
  return apiRequest<{ cycle: DashboardCycle }>("/admin/archives/current-cycle", { authenticated: true, signal })
}

/** OWNER only: every archived monthly cycle, newest first. */
export function getDashboardArchives(signal?: AbortSignal) {
  return apiRequest<{ archives: DashboardArchiveSummary[] }>("/admin/archives", { authenticated: true, signal })
}

/** OWNER only: one archived cycle with its frozen figures, to view it on the dashboard. */
export function getDashboardArchive(archiveId: string, signal?: AbortSignal) {
  return apiRequest<{ archive: DashboardArchiveDetail }>(`/admin/archives/${archiveId}`, { authenticated: true, signal })
}

/** OWNER only: the cycle figures for the Philippine dates dateFrom to dateTo (YYYY-MM-DD, both included), computed live. */
export function getDashboardRangeReport(dateFrom: string, dateTo: string, signal?: AbortSignal) {
  return apiRequest<{ report: DashboardRangeReport }>(`/admin/archives/range${toQuery({ dateFrom, dateTo })}`, { authenticated: true, signal })
}

/** OWNER only: that date range report as one Excel workbook (.xlsx), laid out like an archived cycle's. */
export function downloadDashboardRangeReport(dateFrom: string, dateTo: string) {
  return apiRequest<Blob>(`/admin/archives/range/download${toQuery({ dateFrom, dateTo })}`, { authenticated: true, responseType: "blob" })
}

/** OWNER only: one archived cycle as a single Excel workbook (.xlsx) - an overview sheet plus one sheet per dashboard widget. */
export function downloadDashboardArchive(archiveId: string) {
  return apiRequest<Blob>(`/admin/archives/${archiveId}/download`, { authenticated: true, responseType: "blob" })
}
