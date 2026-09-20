/**
 * Philippine Phone Normalization and Validation Utility
 *
 * Normalizes phone numbers to standard E.164 format (+639XXXXXXXXX)
 * for carrier and logistics provider (Lalamove) interoperability.
 */

export function normalizePhilippinePhone(phone: string | null | undefined): string {
  if (!phone) return '';

  // Remove non-digit characters except leading plus
  let cleaned = phone.trim().replace(/[^\d+]/g, '');

  // If already starts with +63
  if (cleaned.startsWith('+63')) {
    const digits = cleaned.slice(3);
    if (digits.startsWith('0')) {
      return `+63${digits.slice(1)}`;
    }
    return `+63${digits}`;
  }

  // If starts with 63 (without plus)
  if (cleaned.startsWith('63')) {
    const digits = cleaned.slice(2);
    if (digits.startsWith('0')) {
      return `+63${digits.slice(1)}`;
    }
    return `+63${digits}`;
  }

  // If starts with 09 (e.g. 09171234567)
  if (cleaned.startsWith('09')) {
    return `+63${cleaned.slice(1)}`;
  }

  // If starts with 9 and is 10 digits (e.g. 9171234567)
  if (cleaned.startsWith('9') && cleaned.length === 10) {
    return `+63${cleaned}`;
  }

  // Fallback: return as-is with basic trimming if unrecognized format
  return cleaned;
}

export function isValidPhilippinePhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const normalized = normalizePhilippinePhone(phone);
  // Valid E.164 PH mobile: +63 followed by 9 and 9 digits (total 13 chars)
  return /^\+639\d{9}$/.test(normalized);
}
