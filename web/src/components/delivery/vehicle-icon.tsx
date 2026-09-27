import { Bike, Car, Truck } from "lucide-react"

export function VehicleIcon({ vehicleKey, className }: { vehicleKey: string; className?: string }) {
  if (vehicleKey.includes("MOTORCYCLE") || vehicleKey.includes("SIDECAR")) return <Bike className={className} aria-hidden="true" />
  if (vehicleKey.includes("SEDAN") || vehicleKey.includes("MPV")) return <Car className={className} aria-hidden="true" />
  return <Truck className={className} aria-hidden="true" />
}
