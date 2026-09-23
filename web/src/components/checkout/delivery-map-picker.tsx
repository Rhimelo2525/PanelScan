import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { Loader2, MapPin } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined

// Generic Luzon-wide fallback (roughly Bulacan/Metro Manila) - only used when
// no better starting point is available (see `initialCenter` prop). Never
// treated as a real delivery point; it's just where the map opens before the
// customer drags the pin to their actual location.
const DEFAULT_CENTER: [number, number] = [120.9842, 14.5995]
const DEFAULT_ZOOM = 12
const PINNED_ZOOM = 16

export interface ConfirmedPin {
  latitude: number
  longitude: number
  /** Mapbox's own reverse-geocoded guess at this point - shown for the customer's confirmation only, never stored as the authoritative address. */
  reverseGeocodedAddress: string | null
}

interface DeliveryMapPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Approximate starting point (e.g. from the typed city/barangay) - the customer still has to drag/confirm the exact spot. */
  initialCenter: { latitude: number; longitude: number } | null
  onConfirm: (pin: ConfirmedPin) => void
}

async function reverseGeocode(longitude: number, latitude: number, signal: AbortSignal): Promise<string | null> {
  if (!MAPBOX_TOKEN) return null
  const params = new URLSearchParams({
    longitude: String(longitude),
    latitude: String(latitude),
    access_token: MAPBOX_TOKEN,
    language: "en",
  })
  try {
    const response = await fetch(`https://api.mapbox.com/search/geocode/v6/reverse?${params.toString()}`, { signal })
    if (!response.ok) return null
    const body = (await response.json()) as { features?: Array<{ properties?: { full_address?: string } }> }
    return body.features?.[0]?.properties?.full_address ?? null
  } catch {
    return null
  }
}

/**
 * Interactive map for the customer to drop/drag a pin on their exact
 * delivery point - drag, tap, zoom, and (if the browser grants permission)
 * jump to their current location. Reverse geocoding here is display-only,
 * to help the customer confirm they're in the right spot; the coordinates
 * that actually get saved always come from the pin's own position, never
 * from a geocoded guess (same "never invent/substitute coordinates" rule
 * the backend's forward-geocoding already follows - see geocoding.service.ts).
 */
export function DeliveryMapPicker({ open, onOpenChange, initialCenter, onConfirm }: DeliveryMapPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markerRef = useRef<mapboxgl.Marker | null>(null)
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(null)
  const [address, setAddress] = useState<string | null>(null)
  const [isResolvingAddress, setIsResolvingAddress] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)

  // Initialize the map once per time the dialog opens - and fully tear it down on close, mapbox-gl instances don't like being reused across Dialog mount/unmount cycles.
  useEffect(() => {
    if (!open || !mapContainerRef.current) return

    if (!MAPBOX_TOKEN) {
      setMapError("Map is not available right now (missing configuration). You can still complete checkout - PanelScan staff will confirm your exact location manually.")
      return
    }

    mapboxgl.accessToken = MAPBOX_TOKEN
    const startCenter: [number, number] = initialCenter ? [initialCenter.longitude, initialCenter.latitude] : DEFAULT_CENTER
    const startZoom = initialCenter ? PINNED_ZOOM : DEFAULT_ZOOM

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
      center: startCenter,
      zoom: startZoom,
    })
    mapRef.current = map

    map.addControl(new mapboxgl.NavigationControl(), "top-right")
    map.addControl(new mapboxgl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: false, showUserHeading: false }), "top-right")

    const marker = new mapboxgl.Marker({ draggable: true, color: "#ea580c" }).setLngLat(startCenter).addTo(map)
    markerRef.current = marker

    const commitPosition = (lngLat: mapboxgl.LngLat) => {
      setPin({ latitude: lngLat.lat, longitude: lngLat.lng })
    }

    marker.on("dragend", () => commitPosition(marker.getLngLat()))
    map.on("click", (event) => {
      marker.setLngLat(event.lngLat)
      commitPosition(event.lngLat)
    })

    commitPosition(marker.getLngLat())

    return () => {
      marker.remove()
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Debounced reverse geocode whenever the pin settles on a new spot.
  useEffect(() => {
    if (!pin) return
    const controller = new AbortController()
    setIsResolvingAddress(true)
    const timeoutId = window.setTimeout(() => {
      reverseGeocode(pin.longitude, pin.latitude, controller.signal)
        .then((result) => setAddress(result))
        .finally(() => setIsResolvingAddress(false))
    }, 500)
    return () => {
      window.clearTimeout(timeoutId)
      controller.abort()
      setIsResolvingAddress(false)
    }
  }, [pin])

  function handleConfirm() {
    if (!pin) return
    onConfirm({ latitude: pin.latitude, longitude: pin.longitude, reverseGeocodedAddress: address })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MapPin className="size-4 text-primary" aria-hidden="true" />
            Pin your exact delivery location
          </DialogTitle>
          <DialogDescription>Drag the pin, tap the map, or use your current location. This gives your rider your exact spot - not just the general barangay.</DialogDescription>
        </DialogHeader>

        {mapError ? (
          <p className="rounded-lg border border-border bg-secondary/35 p-4 text-sm text-muted-foreground">{mapError}</p>
        ) : (
          <>
            <div ref={mapContainerRef} className="h-72 w-full overflow-hidden rounded-lg border border-border sm:h-96" />

            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Location selected</p>
              <p className="mt-1.5 flex items-start gap-1.5 font-medium text-foreground">
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden="true" />
                {isResolvingAddress ? <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Loader2 className="size-3 animate-spin" aria-hidden="true" />Looking up address…</span> : address ?? "Address not found for this exact spot - your pin position is still saved."}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Coordinates: {pin ? `${pin.latitude.toFixed(7)}, ${pin.longitude.toFixed(7)}` : "—"}
              </p>
            </div>
          </>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {!mapError && (
            <Button type="button" onClick={handleConfirm} disabled={!pin}>
              Confirm location
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
