export type GeocodingStatus = 'pending' | 'completed' | 'failed' | 'not_required'

export interface DeliveryLocation {
  addressLine1: string
  regionCode: string
  regionName: string
  provinceCode: string | null
  provinceName: string | null
  cityMunicipalityCode: string
  cityMunicipalityName: string
  barangayCode: string
  barangayName: string
  postalCode: string
  formattedAddress: string
  recipientName?: string
  recipientPhone?: string
  latitude: number | null
  longitude: number | null
  geocodingStatus: GeocodingStatus
  geocodingProvider?: string | null
  geocodingPlaceId?: string | null
}

export interface PsgcRegion {
  code: string
  name: string
  shortName: string
  islandGroup: 'Luzon' | 'Visayas' | 'Mindanao'
  hasProvinces: boolean
}

export interface PsgcProvince {
  code: string
  name: string
  regionCode: string
}

export interface PsgcCity {
  code: string
  name: string
  regionCode: string
  provinceCode: string | null
  defaultPostalCode?: string
}

export interface PsgcBarangay {
  code: string
  name: string
  cityCode: string
  postalCode?: string
}

export interface DeliveryCoverage {
  market: string
  language: string
  includedRegions: string[]
  excludedRegions: string[]
  displayNotice: string
}

export interface DeliveryProviderMetadata {
  bookingId?: string
  driverName?: string
  driverPhone?: string
  driverPlateNumber?: string
  driverPhotoUrl?: string
  vehicleType?: string
  trackingUrl?: string
  estimatedDelivery?: string
  arrangedBy?: string
  arrangedAt?: string
  bookedAt?: string
  lastSyncedAt?: string
  lastWebhookEvent?: string
  destinationStop?: unknown
  pendingQuotation?: {
    quotationId: string
    expiresAt: string
    amount: number
    currency: string
    serviceType: string
  }
  [key: string]: unknown
}

export interface LalamoveServiceType {
  key: string
  description: string | null
  maxWeightKg: number | null
  dimensionsMeters: { length: number; width: number; height: number } | null
}

export interface DeliveryQuotation {
  quotationId: string
  amount: number
  currency: string
  serviceType: string
  expiresAt: string
}

export type DeliveryApprovalStatus = 'NOT_REQUESTED' | 'PENDING_APPROVAL' | 'APPROVED' | 'DECLINED'

export interface DeliveryRecord {
  id: string
  orderId: string
  approvalStatus?: DeliveryApprovalStatus
  requestedAt?: string | null
  approvedAt?: string | null
  approvedById?: string | null
  declinedAt?: string | null
  declineReason?: string | null
  courierName: string | null
  trackingNumber: string | null
  address: string
  deliveryProvider: string | null
  deliveryStatus: string | null
  lalamoveOrderId: string | null
  providerMetadata: DeliveryProviderMetadata | null
  scheduledDate: string | null
  deliveredAt: string | null
  createdAt: string
  updatedAt: string
  order?: { id: string; orderNumber: string; customerId: string; status: string; deliveryLocation?: DeliveryLocation | null }
}

export interface DeliveryActivityLog {
  id: string
  userId: string | null
  action: string
  metadata: Record<string, unknown> | null
  ipAddress: string | null
  userAgent: string | null
  createdAt: string
}

