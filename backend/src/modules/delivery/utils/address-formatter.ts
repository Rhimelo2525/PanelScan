/**
 * Single Authoritative Address Normalization Utility
 *
 * Formats structured Philippine delivery locations into a standardized,
 * geocoding- and provider-ready string.
 *
 * Normalizes provincial and NCR addresses cleanly:
 * - Provincial: "Street, Barangay, City/Municipality, Province PostalCode, Philippines"
 * - NCR: "Street, Barangay, City/Municipality PostalCode, Philippines" (no fake province)
 */

export interface FormatAddressInput {
  addressLine1: string;
  barangayName: string;
  cityMunicipalityName: string;
  provinceName?: string | null;
  regionName?: string | null;
  postalCode?: string | null;
}

export function formatPhilippineDeliveryAddress(input: FormatAddressInput): string {
  const street = input.addressLine1?.trim() || '';
  const barangay = input.barangayName?.trim() || '';
  const city = input.cityMunicipalityName?.trim() || '';
  const province = input.provinceName?.trim() || '';
  const postal = input.postalCode?.trim() || '';

  const segments: string[] = [];

  if (street) segments.push(street);
  if (barangay) segments.push(barangay);

  // If province exists and is not NCR/Metro Manila
  const isNcr = !province || /^(ncr|national capital region|metro manila)$/i.test(province);

  if (isNcr) {
    if (city && postal) {
      segments.push(`${city} ${postal}`.trim());
    } else if (city) {
      segments.push(city);
    } else if (postal) {
      segments.push(postal);
    }
  } else {
    if (city) segments.push(city);
    if (province && postal) {
      segments.push(`${province} ${postal}`.trim());
    } else if (province) {
      segments.push(province);
    } else if (postal) {
      segments.push(postal);
    }
  }

  segments.push('Philippines');

  return segments.filter(Boolean).join(', ');
}
