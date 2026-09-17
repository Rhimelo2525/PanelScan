import { apiRequest } from "@/api/client"
import type { Product } from "@/types/product"
import type {
  AdminFeedback,
  AdminListQuery,
  AdminProject,
  AdminRequest,
  AdminUser,
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
  ProjectStats,
  ProjectStatus,
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
}

/** MODERATOR only. Creates products and synchronizes inventory atomically. */
export function createProduct(body: CreateProductAdminInput) {
  return apiRequest<{ product: Product }>("/products", { method: "POST", authenticated: true, body })
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
}

/** MODERATOR only. Updates product details and inventory synchronization. */
export function updateProduct(id: string, body: UpdateProductAdminInput) {
  return apiRequest<{ product: Product }>(`/products/${id}`, { method: "PATCH", authenticated: true, body })
}

/** MODERATOR only. Soft-deletes a product listing. */
export function deleteProduct(id: string) {
  return apiRequest<{ product: Product }>(`/products/${id}`, { method: "DELETE", authenticated: true })
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

export function addStock(productId: string, quantity: number) {
  return apiRequest<{ inventory: InventoryRecord }>(`/inventory/${productId}/add`, { method: "PATCH", authenticated: true, body: { quantity } })
}

export function reduceStock(productId: string, quantity: number) {
  return apiRequest<{ inventory: InventoryRecord }>(`/inventory/${productId}/reduce`, { method: "PATCH", authenticated: true, body: { quantity } })
}

// ----------------------------------------------------------------- projects

export function getProjects(query: AdminListQuery & { moderatorId?: string; customerId?: string } = {}, signal?: AbortSignal) {
  return apiRequest<{ projects: AdminProject[]; pagination: Pagination }>(`/projects${toQuery({ ...query })}`, { authenticated: true, signal })
}

export function getProjectById(id: string, signal?: AbortSignal) {
  return apiRequest<{ project: AdminProject }>(`/projects/${id}`, { authenticated: true, signal })
}

export function updateProjectStatus(id: string, status: ProjectStatus) {
  return apiRequest<{ project: AdminProject }>(`/projects/${id}/status`, { method: "PATCH", authenticated: true, body: { status } })
}

/** OWNER may edit every field; MODERATOR is restricted by the backend to notes/schedule on assigned projects. */
export function updateProject(id: string, body: { notes?: string; startDate?: string; endDate?: string; name?: string; description?: string; budget?: number }) {
  return apiRequest<{ project: AdminProject }>(`/projects/${id}`, { method: "PATCH", authenticated: true, body })
}

/** OWNER only. */
export function assignProject(id: string, body: { moderatorId?: string; ownerId?: string; customerId?: string }) {
  return apiRequest<{ project: AdminProject }>(`/projects/${id}/assign`, { method: "PATCH", authenticated: true, body })
}

/** OWNER only. */
export function createProject(body: { customerId: string; name: string; description?: string; moderatorId?: string; budget?: number; startDate?: string; endDate?: string }) {
  return apiRequest<{ project: AdminProject }>("/projects", { method: "POST", authenticated: true, body })
}

// ------------------------------------------------------------------- orders

/** OWNER/MODERATOR fulfilment update. Payment state is never changed from here. */
export function updateOrderStatus(orderId: string, status: string) {
  return apiRequest<{ order: { id: string; status: string } }>(`/orders/${orderId}/status`, { method: "PATCH", authenticated: true, body: { status } })
}

// ----------------------------------------------------------------- requests

export function getRequests(query: AdminListQuery & { type?: string } = {}, signal?: AbortSignal) {
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
  password: string
  phone?: string
  role?: "MODERATOR" | "OWNER"
}

/** OWNER only. Provisions a staff / moderator account. */
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
