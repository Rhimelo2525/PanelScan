import type { DeliveryRecord, LalamoveServiceType } from "@/types/delivery"

/**
 * Lalamove's `description` field is a long raw marketing blurb (e.g. "Ex.
 * Kolong-kolong/Cargo tricycle - For local cargo, market goods & bulky
 * items") unsuited to a compact picker card. Rather than hand-write a name
 * for every possible vehicle key (which would eventually go stale or be
 * wrong for a key this account doesn't have yet), the short label is
 * DERIVED from the real key + maxWeightKg fields already on the record -
 * e.g. "800KG_PICK_UP_TRUCK" + 800 -> "800 kg Pick Up Truck". Mirrors
 * backend/src/modules/delivery/utils/vehicle-label.ts.
 */
export function vehicleLabel(vehicle: Pick<LalamoveServiceType, "key" | "maxWeightKg">): string {
  const name = vehicle.key
    .replace(/^\d+KG_/, "") // weight is shown separately via maxWeightKg, so it'd otherwise repeat
    .split("_")
    .filter(Boolean)
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ")
  return vehicle.maxWeightKg ? `${vehicle.maxWeightKg} kg ${name}` : name || vehicle.key
}

/**
 * Smallest/everyday vehicles first, "10HR_RENTAL" variants grouped last
 * (they're a different booking type, not just a bigger vehicle) - driven by
 * each vehicle's real maxWeightKg rather than a hardcoded key order, so it
 * stays correct if Lalamove adds or removes a vehicle type.
 */
export function sortVehicleTypes(vehicles: LalamoveServiceType[]): LalamoveServiceType[] {
  return [...vehicles].sort((a, b) => {
    const aIsRental = a.key.includes("RENTAL") ? 1 : 0
    const bIsRental = b.key.includes("RENTAL") ? 1 : 0
    if (aIsRental !== bIsRental) return aIsRental - bIsRental
    return (a.maxWeightKg ?? 0) - (b.maxWeightKg ?? 0)
  })
}

/** The vehicle the moderator chose for a delivery, as a display name - the label saved at selection time when available. */
export function deliveryVehicleName(delivery: Pick<DeliveryRecord, "vehicleType" | "providerMetadata">): string | null {
  const saved = delivery.providerMetadata?.vehicleLabel
  if (saved) return saved
  const key = delivery.vehicleType ?? delivery.providerMetadata?.vehicleType
  return key ? vehicleLabel({ key, maxWeightKg: null }) : null
}
