const phpFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const wholePesoFormatter = new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", maximumFractionDigits: 0 })

/** Major-unit amounts for reports and estimates; never performs currency conversion. */
export function formatPesos(amount: number, whole = false): string {
  return Number.isFinite(amount) ? (whole ? wholePesoFormatter : phpFormatter).format(amount) : "Pricing unavailable"
}

export function formatProductPrice(price: string | null | undefined): string {
  const minorUnits = parsePriceToMinorUnits(price)
  return minorUnits === null ? "Pricing unavailable" : formatMinorUnits(minorUnits)
}

export function parsePriceToMinorUnits(price: string | null | undefined): number | null {
  if (!price) return null
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(price.trim())
  if (!match) return null

  const whole = Number(match[1])
  const fraction = (match[2] ?? "").padEnd(2, "0")
  const minorUnits = whole * 100 + Number(fraction)
  return Number.isSafeInteger(minorUnits) ? minorUnits : null
}

export function formatMinorUnits(minorUnits: number): string {
  return Number.isSafeInteger(minorUnits) ? formatPesos(minorUnits / 100) : "Pricing unavailable"
}

export function calculateLineTotal(price: string, quantity: number): number | null {
  const unitPrice = parsePriceToMinorUnits(price)
  if (unitPrice === null || !Number.isSafeInteger(quantity) || quantity < 0) return null
  const total = unitPrice * quantity
  return Number.isSafeInteger(total) ? total : null
}
