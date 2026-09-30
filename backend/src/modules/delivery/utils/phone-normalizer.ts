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

export const PHILIPPINE_PHONE_MESSAGE = 'Please enter a valid Philippine mobile number with 10 digits.';

/**
 * Strict parser behind every contact-number field (users, moderators,
 * installers, addresses, order recipients). Returns the stored form
 * "+639XXXXXXXXX" or null.
 *
 * Accepts "+63 912 345 6789" (spaces/hyphens optional) and, for API clients,
 * the local "0912 345 6789". Exactly 10 digits must follow +63. Unlike
 * normalizePhilippinePhone (which stays lenient for legacy stored data), any
 * letter, stray symbol, second "+" or hidden character is rejected rather than
 * stripped, and "+63 0912..." is not silently shortened.
 */
export function parsePhilippinePhone(phone: string | null | undefined): string | null {
  if (typeof phone !== 'string') return null;
  const trimmed = phone.trim();
  if (!/^\+?[\d \-]+$/.test(trimmed)) return null;

  const digits = trimmed.replace(/[ \-]/g, '');
  let local: string;
  if (digits.startsWith('+')) {
    if (!digits.startsWith('+63')) return null;
    local = digits.slice(3);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    local = digits.slice(1);
  } else {
    return null;
  }
  return /^9\d{9}$/.test(local) ? `+63${local}` : null;
}

export function isValidPhilippinePhone(phone: string | null | undefined): boolean {
  return parsePhilippinePhone(phone) !== null;
}
