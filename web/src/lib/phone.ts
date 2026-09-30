/**
 * The one contact-number rule for the website, mirroring the API's
 * parsePhilippinePhone: +63 followed by exactly 10 digits (a Philippine mobile
 * number, so the first is 9). Values are stored as "+639XXXXXXXXX" and shown
 * as "+63 912 345 6789".
 */
export const PHILIPPINE_PHONE_MESSAGE = "Please enter a valid Philippine mobile number with 10 digits."

const LOCAL_DIGITS = 10

/** Returns the stored form "+639XXXXXXXXX", or null when the value is not exactly a valid number. */
export function parsePhilippinePhone(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!/^\+?[\d -]+$/.test(trimmed)) return null

  const digits = trimmed.replace(/[ -]/g, "")
  let local: string
  if (digits.startsWith("+")) {
    if (!digits.startsWith("+63")) return null
    local = digits.slice(3)
  } else if (digits.length === 11 && digits.startsWith("0")) {
    local = digits.slice(1)
  } else {
    return null
  }
  return /^9\d{9}$/.test(local) ? `+63${local}` : null
}

export function isValidPhilippinePhone(value: string | null | undefined): boolean {
  return parsePhilippinePhone(value) !== null
}

/**
 * The local digits (at most 10) a field should show for a value: the field's
 * own "+63…" value, a saved legacy value ("0917…", "+63 917…"), or whatever
 * was pasted or autofilled. Letters and symbols are dropped, a leading +63,
 * 63 or 0 prefix is removed, and anything past 10 digits is cut off.
 */
export function phoneLocalDigits(value: string | null | undefined): string {
  if (!value) return ""
  const trimmed = value.trim()
  let digits: string
  digits = trimmed.startsWith("+63") ? trimmed.slice(3).replace(/\D/g, "") : trimmed.replace(/\D/g, "")
  // "63…" / "+63 +63 …": a country code pasted into the local part is dropped, never kept as digits.
  if (digits.length > LOCAL_DIGITS && digits.startsWith("63")) digits = digits.slice(2)
  // A PH mobile number never starts with 0 after +63: "0917…" typed from habit becomes "917…".
  return digits.replace(/^0+/, "").slice(0, LOCAL_DIGITS)
}

/** Starting value for a PhoneInput from a saved number in any older format ("0917…", "+63 917…"). */
export function toPhoneFieldValue(value: string | null | undefined): string {
  const local = phoneLocalDigits(value)
  return local ? `+63${local}` : ""
}

/** "9123456789" -> "912 345 6789" (partial input is grouped as typed). */
export function groupPhoneLocalDigits(local: string): string {
  return [local.slice(0, 3), local.slice(3, 6), local.slice(6, LOCAL_DIGITS)].filter(Boolean).join(" ")
}

/** Display form: "+63 912 345 6789". Values that can't be read as a PH number are shown as stored. */
export function formatPhoneForDisplay(value: string | null | undefined): string {
  if (!value) return ""
  const stored = parsePhilippinePhone(value)
  return stored ? `+63 ${groupPhoneLocalDigits(stored.slice(3))}` : value
}
