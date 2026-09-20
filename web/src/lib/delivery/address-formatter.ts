export interface FormatAddressInput {
  addressLine1: string
  barangayName: string
  cityMunicipalityName: string
  provinceName?: string | null
  regionName?: string | null
  postalCode?: string | null
}

export function formatPhilippineDeliveryAddress(input: FormatAddressInput): string {
  const street = input.addressLine1?.trim() || ''
  const barangay = input.barangayName?.trim() || ''
  const city = input.cityMunicipalityName?.trim() || ''
  const province = input.provinceName?.trim() || ''
  const postal = input.postalCode?.trim() || ''

  const segments: string[] = []

  if (street) segments.push(street)
  if (barangay) segments.push(barangay)

  const isNcr = !province || /^(ncr|national capital region|metro manila)$/i.test(province)

  if (isNcr) {
    if (city && postal) {
      segments.push(`${city} ${postal}`.trim())
    } else if (city) {
      segments.push(city)
    } else if (postal) {
      segments.push(postal)
    }
  } else {
    if (city) segments.push(city)
    if (province && postal) {
      segments.push(`${province} ${postal}`.trim())
    } else if (province) {
      segments.push(province)
    } else if (postal) {
      segments.push(postal)
    }
  }

  segments.push('Philippines')

  return segments.filter(Boolean).join(', ')
}

export function normalizePhilippinePhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const cleaned = phone.trim().replace(/[^\d+]/g, '')

  if (cleaned.startsWith('+63')) {
    const digits = cleaned.slice(3)
    return digits.startsWith('0') ? `+63${digits.slice(1)}` : `+63${digits}`
  }

  if (cleaned.startsWith('63')) {
    const digits = cleaned.slice(2)
    return digits.startsWith('0') ? `+63${digits.slice(1)}` : `+63${digits}`
  }

  if (cleaned.startsWith('09')) {
    return `+63${cleaned.slice(1)}`
  }

  if (cleaned.startsWith('9') && cleaned.length === 10) {
    return `+63${cleaned}`
  }

  return cleaned
}
