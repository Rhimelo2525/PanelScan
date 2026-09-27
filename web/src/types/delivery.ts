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
  /** Display name derived from Lalamove's vehicle key + capacity when the moderator selected it, e.g. "1000 kg Van". */
  vehicleLabel?: string
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

export type DeliveryPaymentStatus = 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED'

/** The delivery-fee charge - separate from the product Payment. `method` is "PayMongo" (GCash) or "Cash" (Cash on Delivery). */
export interface DeliveryFeePayment {
  id: string
  deliveryId: string
  status: DeliveryPaymentStatus
  method: string
  amount: string
  transactionRef: string | null
  paidAt: string | null
  createdAt: string
  updatedAt: string
}

/** The order fields every delivery read carries - enough for the moderator to act from the Deliveries page alone. */
export interface DeliveryOrderSummary {
  id: string
  orderNumber: string
  customerId: string
  status: string
  deliveryLocation?: DeliveryLocation | null
  shippingAddress?: string
  subtotal?: string
  totalAmount?: string
  moderatorApproved?: boolean
  createdAt?: string
  customer?: { id: string; firstName: string; lastName: string; email: string; phone: string | null }
  items?: { id: string; productName: string; quantity: number; unitPrice: string; lineTotal: string }[]
  payment?: { status: DeliveryPaymentStatus; method: string; amount: string; paidAt: string | null } | null
}

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
  /** Lalamove vehicle key the moderator selected (e.g. "VAN"). */
  vehicleType?: string | null
  /** The fee Lalamove returned for the booking (decimal string); null until booked. Separate from the product payment. */
  shippingFee?: string | null
  /** Lalamove's real share link; may arrive a little after the booking. */
  trackingUrl?: string | null
  bookedAt?: string | null
  bookedById?: string | null
  /** Last failed booking attempt, cleared on success. */
  bookingError?: string | null
  bookingFailedAt?: string | null
  providerMetadata: DeliveryProviderMetadata | null
  scheduledDate: string | null
  deliveredAt: string | null
  createdAt: string
  updatedAt: string
  order?: DeliveryOrderSummary
  deliveryPayment?: DeliveryFeePayment | null
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

