import { Loader2 } from "lucide-react"
import { useEffect, useState } from "react"

import { ApiRequestError } from "@/api/client"
import { getVehicleTypes, selectDeliveryVehicle } from "@/api/delivery"
import { useConfirm } from "@/components/confirm/use-confirm"
import { VehicleIcon } from "@/components/delivery/vehicle-icon"
import { Button } from "@/components/ui/button"
import { sortVehicleTypes, vehicleLabel } from "@/lib/delivery/vehicle-label"
import { cn } from "@/lib/utils"
import type { DeliveryRecord, LalamoveServiceType } from "@/types/delivery"

/**
 * MODERATOR vehicle selection. The options are exactly what Lalamove's live
 * vehicle list returns for PanelScan's area - nothing is invented when that
 * call fails. Selecting saves the vehicle on the delivery together with a
 * free Lalamove fee quote; nothing is booked here. Before the customer pays,
 * that quote becomes the order's shipping fee (see delivery.service.ts).
 */
export function VehiclePicker({
  orderId,
  currentVehicle,
  disabled,
  onSelected,
  actionLabel = "Select vehicle",
  hint = "Saves the vehicle and gets Lalamove's fee estimate. Nothing is booked yet.",
}: {
  orderId: string
  currentVehicle: string | null
  disabled?: boolean
  onSelected: (delivery: DeliveryRecord) => void
  actionLabel?: string
  hint?: string
}) {
  const [vehicles, setVehicles] = useState<LalamoveServiceType[]>([])
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading")
  const [loadKey, setLoadKey] = useState(0)
  const [selected, setSelected] = useState(currentVehicle ?? "")
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState("")
  const confirm = useConfirm()

  useEffect(() => {
    const controller = new AbortController()
    setLoadState("loading")
    getVehicleTypes(controller.signal)
      .then((services) => {
        setVehicles(sortVehicleTypes(services))
        setLoadState("ready")
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        setError(err instanceof ApiRequestError && err.message ? err.message : "Lalamove vehicle types could not be loaded.")
        setLoadState("error")
      })
    return () => controller.abort()
  }, [loadKey])

  async function handleSelect() {
    if (!(await confirm({
      title: `${actionLabel}?`,
      description: hint,
      details: [{ label: "Vehicle", value: (() => { const vehicle = vehicles.find((v) => v.key === selected); return vehicle ? vehicleLabel(vehicle) : selected })() }],
      confirmLabel: actionLabel,
    }))) return
    setIsSaving(true)
    setError("")
    try {
      const response = await selectDeliveryVehicle(orderId, selected)
      onSelected(response.delivery)
    } catch (err) {
      setError(err instanceof ApiRequestError && err.message ? err.message : "The vehicle could not be selected. Please try again.")
    } finally {
      setIsSaving(false)
    }
  }

  if (loadState === "loading") return <p className="text-xs text-muted-foreground">Loading Lalamove vehicles…</p>
  if (loadState === "error") {
    return (
      <div className="space-y-2">
        <p role="alert" className="rounded-md border border-destructive/20 bg-destructive/5 p-2 text-xs text-destructive">{error}</p>
        <Button size="sm" variant="outline" className="w-full" onClick={() => { setError(""); setLoadKey((key) => key + 1) }}>Try again</Button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div role="radiogroup" aria-label="Lalamove vehicle" className="grid grid-cols-2 gap-2">
        {vehicles.map((vehicle) => {
          const isSelected = selected === vehicle.key
          return (
            <button
              key={vehicle.key}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={disabled || isSaving}
              onClick={() => setSelected(vehicle.key)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60",
                isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-card hover:bg-muted",
              )}
            >
              <VehicleIcon vehicleKey={vehicle.key} className="size-5 shrink-0 text-primary" />
              <span className="text-xs leading-tight font-medium text-foreground">{vehicleLabel(vehicle)}</span>
            </button>
          )
        })}
      </div>
      {error && <p role="alert" className="rounded-md border border-destructive/20 bg-destructive/5 p-2 text-xs text-destructive">{error}</p>}
      <Button size="sm" className="w-full" onClick={() => void handleSelect()} disabled={disabled || isSaving || !selected}>
        {isSaving ? <><Loader2 className="size-3.5 animate-spin" aria-hidden="true" />Getting Lalamove fee…</> : currentVehicle && currentVehicle === selected ? "Refresh fee estimate" : actionLabel}
      </Button>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  )
}
