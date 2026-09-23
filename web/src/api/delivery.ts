import { apiRequest } from '@/api/client'
import type {
  DeliveryActivityLog,
  DeliveryCoverage,
  DeliveryQuotation,
  DeliveryRecord,
  LalamoveServiceType,
  PsgcBarangay,
  PsgcCity,
  PsgcProvince,
  PsgcRegion,
} from '@/types/delivery'

interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

interface CoverageResponse {
  coverage: DeliveryCoverage
}

interface RegionsResponse {
  regions: PsgcRegion[]
}

interface ProvincesResponse {
  provinces: PsgcProvince[]
}

interface CitiesResponse {
  cities: PsgcCity[]
}

interface BarangaysResponse {
  barangays: PsgcBarangay[]
}

// Client-side in-memory caches
const cache = {
  coverage: null as DeliveryCoverage | null,
  regions: null as PsgcRegion[] | null,
  provinces: new Map<string, PsgcProvince[]>(),
  cities: new Map<string, PsgcCity[]>(),
  barangays: new Map<string, PsgcBarangay[]>(),
}

export async function getDeliveryCoverage(): Promise<DeliveryCoverage> {
  if (cache.coverage) return cache.coverage
  const response = await apiRequest<CoverageResponse>('/delivery/coverage')
  cache.coverage = response.coverage
  return response.coverage
}

export async function getDeliveryRegions(): Promise<PsgcRegion[]> {
  if (cache.regions) return cache.regions
  const response = await apiRequest<RegionsResponse>('/delivery/regions')
  cache.regions = response.regions
  return response.regions
}

export async function getDeliveryProvinces(regionCode: string): Promise<PsgcProvince[]> {
  if (!regionCode) return []
  if (cache.provinces.has(regionCode)) return cache.provinces.get(regionCode)!
  const response = await apiRequest<ProvincesResponse>(`/delivery/provinces?regionCode=${encodeURIComponent(regionCode)}`)
  cache.provinces.set(regionCode, response.provinces)
  return response.provinces
}

export async function getDeliveryCities(regionCode: string, provinceCode?: string | null): Promise<PsgcCity[]> {
  if (!regionCode) return []
  const cacheKey = `${regionCode}:${provinceCode || ''}`
  if (cache.cities.has(cacheKey)) return cache.cities.get(cacheKey)!

  const params = new URLSearchParams({ regionCode })
  if (provinceCode) params.set('provinceCode', provinceCode)

  const response = await apiRequest<CitiesResponse>(`/delivery/cities?${params.toString()}`)
  cache.cities.set(cacheKey, response.cities)
  return response.cities
}

export async function getDeliveryBarangays(cityCode: string): Promise<PsgcBarangay[]> {
  if (!cityCode) return []
  if (cache.barangays.has(cityCode)) return cache.barangays.get(cityCode)!
  const response = await apiRequest<BarangaysResponse>(`/delivery/barangays?cityCode=${encodeURIComponent(cityCode)}`)
  cache.barangays.set(cityCode, response.barangays)
  return response.barangays
}

/** CUSTOMER action: Requests delivery for an order. */
export function requestDelivery(orderId: string) {
  return apiRequest<{ delivery: DeliveryRecord }>(`/delivery/orders/${orderId}/request`, {
    method: "POST",
    authenticated: true,
  })
}

/** CUSTOMER action: Proceeds with delivery for an approved order. */
export function proceedWithDelivery(orderId: string) {
  return apiRequest<{ success: boolean; message: string; orderId: string; delivery: DeliveryRecord }>(
    `/delivery/orders/${orderId}/proceed`,
    {
      method: "POST",
      authenticated: true,
    },
  )
}

/** MODERATOR/OWNER staff action: Approves a customer delivery request. */
export function approveDeliveryRequest(orderId: string) {
  return apiRequest<{ delivery: DeliveryRecord }>(`/delivery/orders/${orderId}/approve`, {
    method: "PATCH",
    authenticated: true,
  })
}

/** MODERATOR/OWNER staff action: Declines a customer delivery request. */
export function declineDeliveryRequest(orderId: string, reason?: string) {
  return apiRequest<{ delivery: DeliveryRecord }>(`/delivery/orders/${orderId}/decline`, {
    method: "PATCH",
    authenticated: true,
    body: reason ? { reason } : {},
  })
}

// ---------------------------------------------------------------- live Lalamove integration

/** Live Lalamove vehicle lineup for the quotation UI. Always succeeds - the backend falls back to a static list if the provider call fails. */
export async function getVehicleTypes(signal?: AbortSignal): Promise<LalamoveServiceType[]> {
  const response = await apiRequest<{ services: LalamoveServiceType[] }>("/delivery/vehicle-types", { authenticated: true, signal })
  return response.services
}

/** Free, non-committal: requests a live fee quote from Lalamove without booking anything. Requires the delivery request to already be APPROVED. */
export function requestQuotation(orderId: string, serviceType: string, signal?: AbortSignal) {
  return apiRequest<{ quotation: DeliveryQuotation }>(`/delivery/orders/${orderId}/quotation`, {
    method: "POST",
    authenticated: true,
    body: { serviceType },
    signal,
  })
}

/** Opens a PayMongo GCash checkout session for the delivery fee shown in the current quotation - a separate charge from the product payment. */
export function payDeliveryFeeWithGcash(orderId: string, signal?: AbortSignal) {
  return apiRequest<{ checkoutUrl: string }>(`/delivery/orders/${orderId}/fee/gcash`, { method: "POST", authenticated: true, signal })
}

/** Selects Cash on Delivery for the delivery fee - the rider collects it at drop-off. */
export function selectDeliveryFeeCash(orderId: string, signal?: AbortSignal) {
  return apiRequest<{ amount: number }>(`/delivery/orders/${orderId}/fee/cash`, { method: "POST", authenticated: true, signal })
}

/** Redeems the quotation from requestQuotation() into a real, billable Lalamove booking. Requires the delivery fee to be paid (GCash) or Cash on Delivery selected first - see delivery.service.ts#confirmBooking. */
export function confirmDeliveryBooking(orderId: string, signal?: AbortSignal) {
  return apiRequest<{ delivery: DeliveryRecord }>(`/delivery/orders/${orderId}/book`, { method: "POST", authenticated: true, signal })
}

/** Pulls live status + driver info from Lalamove and syncs it onto the record. Safe to call repeatedly - read-only against the provider. */
export function refreshDeliveryStatus(deliveryId: string, signal?: AbortSignal) {
  return apiRequest<{ delivery: DeliveryRecord }>(`/delivery/${deliveryId}/refresh`, { method: "POST", authenticated: true, signal })
}

/** MODERATOR-only: cancels the real Lalamove booking (not the local record). */
export function cancelDeliveryBooking(deliveryId: string, signal?: AbortSignal) {
  return apiRequest<{ delivery: DeliveryRecord }>(`/delivery/${deliveryId}/cancel-booking`, { method: "POST", authenticated: true, signal })
}

/** MODERATOR/OWNER interim bridge until a real geocoder is wired in: manually sets an order's dropoff coordinates. */
export function setDeliveryCoordinates(orderId: string, latitude: number, longitude: number, signal?: AbortSignal) {
  return apiRequest<void>(`/delivery/orders/${orderId}/coordinates`, { method: "PATCH", authenticated: true, body: { latitude, longitude }, signal })
}

export interface DeliveryListFilters {
  page?: number
  limit?: number
  search?: string
  deliveryState?: "active" | "completed" | "cancelled"
  sortBy?: "scheduledDate" | "createdAt"
  sortOrder?: "asc" | "desc"
}

/** Admin deliveries list: MODERATOR/OWNER see every delivery; a CUSTOMER sees only their own orders' deliveries. */
export function getDeliveries(filters: DeliveryListFilters = {}, signal?: AbortSignal) {
  const params = new URLSearchParams()
  if (filters.page) params.set("page", String(filters.page))
  if (filters.limit) params.set("limit", String(filters.limit))
  if (filters.search) params.set("search", filters.search)
  if (filters.deliveryState) params.set("deliveryState", filters.deliveryState)
  if (filters.sortBy) params.set("sortBy", filters.sortBy)
  if (filters.sortOrder) params.set("sortOrder", filters.sortOrder)
  const query = params.toString()
  return apiRequest<{ deliveries: DeliveryRecord[]; pagination: PaginationMeta }>(`/delivery${query ? `?${query}` : ""}`, { authenticated: true, signal })
}

export function getDeliveryById(deliveryId: string, signal?: AbortSignal) {
  return apiRequest<{ delivery: DeliveryRecord }>(`/delivery/${deliveryId}`, { authenticated: true, signal })
}

/** MODERATOR/OWNER: "Failed API requests" admin view - failed Lalamove calls (quotation, booking, refresh, cancel). */
export function getFailedDeliveryRequests(page = 1, limit = 20, signal?: AbortSignal) {
  return apiRequest<{ logs: DeliveryActivityLog[]; pagination: PaginationMeta }>(`/delivery/failed-requests?page=${page}&limit=${limit}`, { authenticated: true, signal })
}

