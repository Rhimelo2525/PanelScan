import { apiRequest } from '@/api/client'
import type {
  DeliveryCoverage,
  DeliveryRecord,
  PsgcBarangay,
  PsgcCity,
  PsgcProvince,
  PsgcRegion,
} from '@/types/delivery'

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

