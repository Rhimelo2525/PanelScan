/** A customer's saved shipping address (backend `customer_addresses`). Coordinates are always the customer's own confirmed map pin. */
export interface SavedAddress {
  id: string
  customerId: string
  label: string | null
  recipientName: string
  /** E.164, e.g. +639171234567. */
  recipientPhone: string
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
  latitude: number
  longitude: number
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

export interface SavedAddressInput {
  label?: string | null
  recipientName: string
  recipientPhone: string
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
  latitude: number
  longitude: number
  isDefault?: boolean
}

/**
 * What the backend could read off a map pin. `complete` fills every field;
 * `partial` leaves some null for the customer; `failed`/`unavailable` fill
 * nothing - the pin itself is still kept either way.
 */
export interface AddressSuggestion {
  latitude: number
  longitude: number
  status: "complete" | "partial" | "failed" | "unavailable"
  detectedAddress: string | null
  addressLine1: string | null
  regionCode: string | null
  regionName: string | null
  provinceCode: string | null
  provinceName: string | null
  cityMunicipalityCode: string | null
  cityMunicipalityName: string | null
  barangayCode: string | null
  barangayName: string | null
  postalCode: string | null
  inCoverage: boolean | null
}
