import mapboxgl from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { LocateFixed, Loader2 } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"

import { Button } from "@/components/ui/button"

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN as string | undefined

// Generic Luzon-wide starting view (roughly Bulacan/Metro Manila) for a new
// address. Never treated as a delivery point - no pin exists until the
// customer places one.
const DEFAULT_CENTER: [number, number] = [120.9842, 14.5995]
const DEFAULT_ZOOM = 11
const PINNED_ZOOM = 17
const PIN_COLOR = "#ea580c"

export interface MapPin {
  latitude: number
  longitude: number
}

interface AddressMapPickerProps {
  /** The pin to start with (editing an address), or null for a new address. */
  initialPin: MapPin | null
  /** Called every time the customer places or moves the pin. */
  onPinChange: (pin: MapPin) => void
  /** Called when the map itself can't load, so the form can say why it can't be saved. */
  onUnavailable?: (message: string) => void
}

/**
 * Inline map for pinning an exact delivery point - tap to drop the pin, drag
 * it, zoom, or jump to the customer's current location. The coordinates the
 * form saves are always this pin's own position; the readable address is
 * looked up FROM it (see address-form.tsx), never the other way round.
 */
export function AddressMapPicker({ initialPin, onPinChange, onUnavailable }: AddressMapPickerProps) {
  // A callback ref stored in state, not a plain ref: inside a Radix Dialog the
  // container can mount a render or two after this component does, and a
  // plain ref read once in an effect would miss it and leave the map
  // permanently blank. State makes a late mount re-run the effect below.
  const [mapNode, setMapNode] = useState<HTMLDivElement | null>(null)
  const mapContainerRef = useCallback((node: HTMLDivElement | null) => setMapNode(node), [])
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markerRef = useRef<mapboxgl.Marker | null>(null)
  const onPinChangeRef = useRef(onPinChange)
  onPinChangeRef.current = onPinChange
  const initialPinRef = useRef(initialPin)
  const [mapError, setMapError] = useState<string | null>(null)
  const [isLocating, setIsLocating] = useState(false)
  const [locateMessage, setLocateMessage] = useState<string | null>(null)

  const reportUnavailable = useRef(onUnavailable)
  reportUnavailable.current = onUnavailable

  const createMarker = useCallback((map: mapboxgl.Map, lngLat: mapboxgl.LngLatLike) => {
    const marker = new mapboxgl.Marker({ draggable: true, color: PIN_COLOR }).setLngLat(lngLat).addTo(map)
    marker.on("dragend", () => {
      const position = marker.getLngLat()
      onPinChangeRef.current({ latitude: position.lat, longitude: position.lng })
    })
    markerRef.current = marker
  }, [])

  /** Places (or moves) the pin and reports it. */
  const placePin = useCallback((lngLat: mapboxgl.LngLatLike) => {
    const map = mapRef.current
    if (!map) return
    if (markerRef.current) markerRef.current.setLngLat(lngLat)
    else createMarker(map, lngLat)
    if (!markerRef.current) return
    const position = markerRef.current.getLngLat()
    onPinChangeRef.current({ latitude: position.lat, longitude: position.lng })
  }, [createMarker])

  useEffect(() => {
    if (!mapNode) return

    const fail = (message: string) => {
      setMapError(message)
      reportUnavailable.current?.(message)
    }

    if (!MAPBOX_TOKEN) {
      fail("The map is not available right now (missing configuration), so a new location can't be pinned. Please try again later.")
      return
    }

    // StrictMode double-invokes effects in dev; clear any canvas a previous
    // instance left in this same node before creating a fresh map.
    mapNode.innerHTML = ""

    const start = initialPinRef.current
    let map: mapboxgl.Map
    try {
      mapboxgl.accessToken = MAPBOX_TOKEN
      map = new mapboxgl.Map({
        container: mapNode,
        style: "mapbox://styles/mapbox/streets-v12",
        center: start ? [start.longitude, start.latitude] : DEFAULT_CENTER,
        zoom: start ? PINNED_ZOOM : DEFAULT_ZOOM,
      })
    } catch (error) {
      // The constructor is the one thing that can throw synchronously (e.g. no WebGL).
      console.error("[AddressMapPicker] Failed to create the map:", error)
      fail("The map could not be started in this browser, so a location can't be pinned. Try another browser or device.")
      return
    }
    mapRef.current = map

    map.on("error", (event) => {
      console.error("[AddressMapPicker] Mapbox error:", event.error)
      fail("The map ran into a problem loading. Please close this form and try again.")
    })
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right")
    map.on("click", (event) => placePin(event.lngLat))

    // An existing pin is shown as-is, without reporting it - that would re-run the address lookup and overwrite the saved fields.
    if (start) createMarker(map, [start.longitude, start.latitude])

    // A dialog animates in; re-measure once it has settled so the map isn't stuck at a mid-transition size.
    const resizeTimeoutId = window.setTimeout(() => map.resize(), 250)

    return () => {
      window.clearTimeout(resizeTimeoutId)
      markerRef.current?.remove()
      map.remove()
      mapRef.current = null
      markerRef.current = null
    }
  }, [mapNode, placePin, createMarker])

  function locateCustomer() {
    if (!("geolocation" in navigator)) {
      setLocateMessage("Your browser can't share its location. Tap the map to place your pin instead.")
      return
    }
    setIsLocating(true)
    setLocateMessage(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false)
        const lngLat: [number, number] = [position.coords.longitude, position.coords.latitude]
        mapRef.current?.flyTo({ center: lngLat, zoom: PINNED_ZOOM })
        placePin(lngLat)
        setLocateMessage("Pinned at your current location - drag the pin if it's slightly off.")
      },
      (error) => {
        setIsLocating(false)
        setLocateMessage(
          error.code === error.PERMISSION_DENIED
            ? "Location access was not allowed. That's fine - tap the map to place your pin."
            : "Your current location couldn't be found. Tap the map to place your pin instead.",
        )
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  if (mapError) {
    return <p role="alert" className="rounded-lg border border-border bg-secondary/35 p-4 text-sm text-muted-foreground">{mapError}</p>
  }

  return (
    <div>
      <div ref={mapContainerRef} className="h-64 w-full overflow-hidden rounded-lg border border-border sm:h-80" />
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Tap the map to drop your pin, then drag it onto your exact door or gate.</p>
        <Button type="button" variant="outline" size="sm" onClick={locateCustomer} disabled={isLocating}>
          {isLocating ? <Loader2 className="size-3.5 animate-spin" data-icon="inline-start" aria-hidden="true" /> : <LocateFixed className="size-3.5" data-icon="inline-start" aria-hidden="true" />}
          Use my current location
        </Button>
      </div>
      {locateMessage && <p className="mt-1.5 text-xs text-muted-foreground" role="status">{locateMessage}</p>}
    </div>
  )
}
