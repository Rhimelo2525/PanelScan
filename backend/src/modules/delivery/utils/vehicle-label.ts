import type { LalamoveServiceType } from '../delivery.domain.js';

/**
 * Short display name for a Lalamove vehicle, derived from the real key and
 * maxWeightKg Lalamove returns (e.g. "800KG_PICK_UP_TRUCK" + 800 -> "800 kg
 * Pick Up Truck") rather than a hand-written table that would go stale.
 * Mirrors web/src/lib/delivery/vehicle-label.ts.
 */
export function vehicleDisplayName(vehicle: Pick<LalamoveServiceType, 'key' | 'maxWeightKg'>): string {
  const name = vehicle.key
    .replace(/^\d+KG_/, '')
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(' ');
  return vehicle.maxWeightKg ? `${vehicle.maxWeightKg} kg ${name}` : name || vehicle.key;
}
