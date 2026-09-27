import { AlertTriangle, CheckCircle2, Loader2, MapPin, RotateCw } from "lucide-react"
import { lazy, Suspense, useEffect, useRef, useState } from "react"

import { ApiRequestError } from "@/api/client"
import { createSavedAddress, lookupAddressForPin, updateSavedAddress } from "@/api/addresses"
import { getDeliveryBarangays, getDeliveryCities, getDeliveryProvinces, getDeliveryRegions } from "@/api/delivery"
import { useAuth } from "@/auth/use-auth"
import type { MapPin as Pin } from "@/components/addresses/address-map-picker"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { normalizePhilippinePhone } from "@/lib/delivery/address-formatter"
import { cn } from "@/lib/utils"
import type { AddressSuggestion, SavedAddress, SavedAddressInput } from "@/types/address"
import type { PsgcBarangay, PsgcCity, PsgcProvince, PsgcRegion } from "@/types/delivery"

// mapbox-gl is large - load it only when an address form is actually open.
const AddressMapPicker = lazy(() => import("@/components/addresses/address-map-picker").then((module) => ({ default: module.AddressMapPicker })))

const NCR_REGION_CODE = "130000000"
const LOOKUP_DEBOUNCE_MS = 600
const ADDRESS_LABELS = ["Home", "Work", "Office", "Other"] as const

interface AddressFields {
  label: string
  recipientName: string
  recipientPhone: string
  addressLine1: string
  regionCode: string
  regionName: string
  provinceCode: string
  provinceName: string
  cityCode: string
  cityName: string
  barangayCode: string
  barangayName: string
  postalCode: string
  isDefault: boolean
}

type FieldErrors = Partial<Record<keyof AddressFields | "pin" | "form", string>>

type LookupState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; suggestion: AddressSuggestion }
  | { kind: "error" }

function fieldsFromAddress(address: SavedAddress): AddressFields {
  return {
    label: address.label ?? "",
    recipientName: address.recipientName,
    recipientPhone: address.recipientPhone,
    addressLine1: address.addressLine1,
    regionCode: address.regionCode,
    regionName: address.regionName,
    provinceCode: address.provinceCode ?? "",
    provinceName: address.provinceName ?? "",
    cityCode: address.cityMunicipalityCode,
    cityName: address.cityMunicipalityName,
    barangayCode: address.barangayCode,
    barangayName: address.barangayName,
    postalCode: address.postalCode,
    isDefault: address.isDefault,
  }
}

function validate(fields: AddressFields, pin: Pin | null, isNcr: boolean): FieldErrors {
  const errors: FieldErrors = {}
  if (!pin) errors.pin = "Pin your exact location on the map."
  if (fields.recipientName.trim().length < 2) errors.recipientName = "Enter the recipient's full name."
  if (!/^\+639\d{9}$/.test(normalizePhilippinePhone(fields.recipientPhone))) errors.recipientPhone = "Enter a valid Philippine mobile number (e.g. 0917 123 4567)."
  if (fields.addressLine1.trim().length < 2) errors.addressLine1 = "Enter the house/unit number, building, or street."
  if (!fields.regionCode) errors.regionCode = "Select a region."
  if (!isNcr && !fields.provinceCode) errors.provinceCode = "Select a province."
  if (!fields.cityCode) errors.cityCode = "Select a city or municipality."
  if (!fields.barangayCode) errors.barangayCode = "Select a barangay."
  if (fields.postalCode.trim().length < 3) errors.postalCode = "Enter a valid postal code."
  return errors
}

function saveErrorMessage(error: unknown): string {
  // 4xx messages are written for customers (coverage, invalid barangay...); never surface anything else verbatim.
  if (error instanceof ApiRequestError && error.status >= 400 && error.status < 500 && error.status !== 401) return error.message
  if (error instanceof ApiRequestError && error.status === 0) return "We couldn't connect to PanelScan. Check your connection and try again."
  return "Your address couldn't be saved right now. Please try again."
}

interface AddressFormProps {
  /** The address being edited, or null to add a new one. */
  address: SavedAddress | null
  /** True when the customer has no saved addresses yet - the new one becomes the default automatically. */
  isFirstAddress: boolean
  onSaved: (address: SavedAddress) => void
  onCancel: () => void
}

/**
 * The one shipping-address form, used from the profile and from checkout.
 * The map comes first: the customer pins their exact spot, the backend reads
 * a readable, PSGC-coded address off that pin, and the fields below are
 * filled in for them - they only correct or complete what's missing. The
 * saved coordinates are always the pin's own.
 */
export function AddressForm({ address, isFirstAddress, onSaved, onCancel }: AddressFormProps) {
  const { user } = useAuth()
  const [pin, setPin] = useState<Pin | null>(address ? { latitude: address.latitude, longitude: address.longitude } : null)
  const [lookup, setLookup] = useState<LookupState>({ kind: "idle" })
  const [mapUnavailable, setMapUnavailable] = useState<string | null>(null)
  const [fields, setFields] = useState<AddressFields>(() =>
    address
      ? fieldsFromAddress(address)
      : {
          label: isFirstAddress ? "Home" : "",
          recipientName: user ? `${user.firstName} ${user.lastName}`.trim() : "",
          recipientPhone: user?.phone ?? "",
          addressLine1: "",
          regionCode: "",
          regionName: "",
          provinceCode: "",
          provinceName: "",
          cityCode: "",
          cityName: "",
          barangayCode: "",
          barangayName: "",
          postalCode: "",
          isDefault: isFirstAddress,
        },
  )
  const [errors, setErrors] = useState<FieldErrors>({})
  const [isSaving, setIsSaving] = useState(false)

  const [regions, setRegions] = useState<PsgcRegion[]>([])
  const [provinces, setProvinces] = useState<PsgcProvince[]>([])
  const [cities, setCities] = useState<PsgcCity[]>([])
  const [barangays, setBarangays] = useState<PsgcBarangay[]>([])
  const [loadingList, setLoadingList] = useState<"regions" | "provinces" | "cities" | "barangays" | null>("regions")

  const isNcr = fields.regionCode === NCR_REGION_CODE
  const lookupTimer = useRef<number | undefined>(undefined)
  const lookupController = useRef<AbortController | null>(null)

  /** Loads the dropdown lists that sit under an already-chosen region/province/city (a detected address, or one being edited). */
  async function loadListsFor(regionCode: string, provinceCode: string, cityCode: string) {
    try {
      if (regionCode && regionCode !== NCR_REGION_CODE) {
        setLoadingList("provinces")
        setProvinces(await getDeliveryProvinces(regionCode))
      } else {
        setProvinces([])
      }
      if (regionCode && (regionCode === NCR_REGION_CODE || provinceCode)) {
        setLoadingList("cities")
        setCities(await getDeliveryCities(regionCode, regionCode === NCR_REGION_CODE ? null : provinceCode))
      } else {
        setCities([])
      }
      if (cityCode) {
        setLoadingList("barangays")
        setBarangays(await getDeliveryBarangays(cityCode))
      } else {
        setBarangays([])
      }
    } catch (error) {
      console.error("Failed to load address lists:", error)
    } finally {
      setLoadingList(null)
    }
  }

  useEffect(() => {
    let isMounted = true
    getDeliveryRegions()
      .then((data) => { if (isMounted) setRegions(data) })
      .catch((error) => console.error("Failed to load delivery regions:", error))
      .finally(() => {
        if (!isMounted) return
        setLoadingList(null)
        if (address) void loadListsFor(address.regionCode, address.provinceCode ?? "", address.cityMunicipalityCode)
      })
    return () => {
      isMounted = false
      window.clearTimeout(lookupTimer.current)
      lookupController.current?.abort()
    }
    // Runs once per form - `address` is fixed for the form's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function applySuggestion(suggestion: AddressSuggestion) {
    setFields((current) => ({
      ...current,
      addressLine1: suggestion.addressLine1 ?? current.addressLine1,
      regionCode: suggestion.regionCode ?? "",
      regionName: suggestion.regionName ?? "",
      provinceCode: suggestion.provinceCode ?? "",
      provinceName: suggestion.provinceName ?? "",
      cityCode: suggestion.cityMunicipalityCode ?? "",
      cityName: suggestion.cityMunicipalityName ?? "",
      barangayCode: suggestion.barangayCode ?? "",
      barangayName: suggestion.barangayName ?? "",
      postalCode: suggestion.postalCode ?? current.postalCode,
    }))
    setErrors({})
    void loadListsFor(suggestion.regionCode ?? "", suggestion.provinceCode ?? "", suggestion.cityMunicipalityCode ?? "")
  }

  async function runLookup(target: Pin) {
    lookupController.current?.abort()
    const controller = new AbortController()
    lookupController.current = controller
    setLookup({ kind: "loading" })
    try {
      const suggestion = await lookupAddressForPin(target.latitude, target.longitude, controller.signal)
      if (controller.signal.aborted) return
      setLookup({ kind: "done", suggestion })
      // Nothing detected: keep whatever the customer already entered rather than blanking it.
      if (suggestion.status === "complete" || suggestion.status === "partial") applySuggestion(suggestion)
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      setLookup({ kind: "error" })
    }
  }

  function handlePinChange(next: Pin) {
    setPin(next)
    setErrors((current) => ({ ...current, pin: undefined }))
    window.clearTimeout(lookupTimer.current)
    lookupTimer.current = window.setTimeout(() => void runLookup(next), LOOKUP_DEBOUNCE_MS)
  }

  function updateField<K extends keyof AddressFields>(name: K, value: AddressFields[K]) {
    setFields((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined, form: undefined }))
  }

  async function handleRegionChange(regionCode: string) {
    const region = regions.find((r) => r.code === regionCode)
    setFields((current) => ({ ...current, regionCode, regionName: region?.name ?? "", provinceCode: "", provinceName: "", cityCode: "", cityName: "", barangayCode: "", barangayName: "" }))
    setErrors((current) => ({ ...current, regionCode: undefined, provinceCode: undefined, cityCode: undefined, barangayCode: undefined }))
    await loadListsFor(regionCode, "", "")
  }

  async function handleProvinceChange(provinceCode: string) {
    const province = provinces.find((p) => p.code === provinceCode)
    setFields((current) => ({ ...current, provinceCode, provinceName: province?.name ?? "", cityCode: "", cityName: "", barangayCode: "", barangayName: "" }))
    setErrors((current) => ({ ...current, provinceCode: undefined, cityCode: undefined, barangayCode: undefined }))
    setBarangays([])
    if (!provinceCode) return setCities([])
    setLoadingList("cities")
    try {
      setCities(await getDeliveryCities(fields.regionCode, provinceCode))
    } catch (error) {
      console.error("Failed to load cities:", error)
    } finally {
      setLoadingList(null)
    }
  }

  async function handleCityChange(cityCode: string) {
    const city = cities.find((c) => c.code === cityCode)
    setFields((current) => ({ ...current, cityCode, cityName: city?.name ?? "", barangayCode: "", barangayName: "", postalCode: city?.defaultPostalCode || current.postalCode }))
    setErrors((current) => ({ ...current, cityCode: undefined, barangayCode: undefined, postalCode: undefined }))
    if (!cityCode) return setBarangays([])
    setLoadingList("barangays")
    try {
      setBarangays(await getDeliveryBarangays(cityCode))
    } catch (error) {
      console.error("Failed to load barangays:", error)
    } finally {
      setLoadingList(null)
    }
  }

  function handleBarangayChange(barangayCode: string) {
    const barangay = barangays.find((b) => b.code === barangayCode)
    setFields((current) => ({ ...current, barangayCode, barangayName: barangay?.name ?? "", postalCode: barangay?.postalCode || current.postalCode }))
    setErrors((current) => ({ ...current, barangayCode: undefined, postalCode: undefined }))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = validate(fields, pin, isNcr)
    if (Object.values(nextErrors).some(Boolean) || !pin) {
      setErrors(nextErrors)
      return
    }

    const input: SavedAddressInput = {
      label: fields.label.trim() || null,
      recipientName: fields.recipientName.trim(),
      recipientPhone: fields.recipientPhone.trim(),
      addressLine1: fields.addressLine1.trim(),
      regionCode: fields.regionCode,
      regionName: fields.regionName,
      provinceCode: isNcr ? null : fields.provinceCode || null,
      provinceName: isNcr ? null : fields.provinceName || null,
      cityMunicipalityCode: fields.cityCode,
      cityMunicipalityName: fields.cityName,
      barangayCode: fields.barangayCode,
      barangayName: fields.barangayName,
      postalCode: fields.postalCode.trim(),
      latitude: pin.latitude,
      longitude: pin.longitude,
      isDefault: fields.isDefault,
    }

    setIsSaving(true)
    setErrors({})
    try {
      const saved = address ? await updateSavedAddress(address.id, input) : await createSavedAddress(input)
      onSaved(saved)
    } catch (error) {
      setErrors({ form: saveErrorMessage(error) })
    } finally {
      setIsSaving(false)
    }
  }

  const suggestion = lookup.kind === "done" ? lookup.suggestion : null
  const outOfCoverage = suggestion?.inCoverage === false

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6">
      {/* 1. Exact delivery location - first, so the rest can be filled in from it. */}
      <section aria-labelledby="address-pin-title">
        <h3 id="address-pin-title" className="flex items-center gap-2 text-sm font-semibold">
          <MapPin className="size-4 text-primary" aria-hidden="true" />
          Exact delivery location
        </h3>
        <div className="mt-3">
          <Suspense fallback={<Skeleton className="h-64 w-full rounded-lg sm:h-80" />}>
            <AddressMapPicker initialPin={pin} onPinChange={handlePinChange} onUnavailable={setMapUnavailable} />
          </Suspense>
        </div>
        {errors.pin && !mapUnavailable && <p className="mt-1.5 text-xs text-destructive" role="alert">{errors.pin}</p>}

        {pin && (
          <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm" aria-live="polite">
            {lookup.kind === "loading" ? (
              <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-3.5 animate-spin" aria-hidden="true" />Finding the address at your pin…</p>
            ) : lookup.kind === "error" || suggestion?.status === "failed" ? (
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-muted-foreground">We couldn't read an address for this spot. Your pin is kept - retry, or fill in the details below.</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void runLookup(pin)}><RotateCw className="size-3.5" data-icon="inline-start" aria-hidden="true" />Retry</Button>
              </div>
            ) : suggestion?.status === "unavailable" ? (
              <p className="text-muted-foreground">Automatic address detection isn't available right now. Your pin is kept - fill in the details below.</p>
            ) : suggestion ? (
              <p className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                <span>
                  <span className="block font-medium">{suggestion.status === "complete" ? "Address detected from your pin" : "Address partly detected - please complete the missing fields"}</span>
                  {suggestion.detectedAddress && <span className="mt-0.5 block text-xs text-muted-foreground">{suggestion.detectedAddress}</span>}
                </span>
              </p>
            ) : (
              <p className="text-muted-foreground">Drag the pin to update this address.</p>
            )}
            <p className="mt-2 text-xs text-muted-foreground">Coordinates: {pin.latitude.toFixed(7)}, {pin.longitude.toFixed(7)}</p>
          </div>
        )}
        {outOfCoverage && (
          <p className="mt-2 flex items-start gap-2 text-xs text-destructive"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />This spot is outside PanelScan's delivery area. Delivery is currently available within selected areas in Luzon.</p>
        )}
      </section>

      {/* 2. Detected address - pre-filled from the pin; the customer only corrects or completes it. */}
      <section aria-labelledby="address-details-title" className="border-t border-border pt-6">
        <h3 id="address-details-title" className="text-sm font-semibold">Address details</h3>
        <p className="mt-1 text-xs text-muted-foreground">Filled in from your pin. Add your house or unit number, or correct anything that's off.</p>

        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="address-line1">Street, building, or unit</Label>
            <Input id="address-line1" value={fields.addressLine1} onChange={(e) => updateField("addressLine1", e.target.value)} autoComplete="street-address" placeholder="House / Unit / Block / Lot, Building name, Street" aria-invalid={Boolean(errors.addressLine1)} className="mt-2 h-11" />
            {errors.addressLine1 && <p className="mt-1.5 text-xs text-destructive">{errors.addressLine1}</p>}
          </div>

          <div>
            <Label htmlFor="address-region">Region</Label>
            <div className="mt-2">
              <Combobox id="address-region" placeholder={loadingList === "regions" ? "Loading regions..." : "Select Region"} searchPlaceholder="Search Luzon region..." options={regions.map((r) => ({ value: r.code, label: r.name, secondaryText: r.shortName }))} value={fields.regionCode} onChange={(value) => void handleRegionChange(value)} disabled={loadingList === "regions"} error={errors.regionCode} />
            </div>
            {errors.regionCode && <p className="mt-1.5 text-xs text-destructive">{errors.regionCode}</p>}
          </div>

          <div>
            <Label htmlFor="address-province">Province</Label>
            <div className="mt-2">
              <Combobox id="address-province" placeholder={isNcr ? "— Not applicable (NCR) —" : loadingList === "provinces" ? "Loading provinces..." : !fields.regionCode ? "Select a region first" : "Select Province"} searchPlaceholder="Search province..." options={provinces.map((p) => ({ value: p.code, label: p.name }))} value={fields.provinceCode} onChange={(value) => void handleProvinceChange(value)} disabled={isNcr || !fields.regionCode || loadingList === "provinces"} error={errors.provinceCode} />
            </div>
            {errors.provinceCode && !isNcr && <p className="mt-1.5 text-xs text-destructive">{errors.provinceCode}</p>}
          </div>

          <div>
            <Label htmlFor="address-city">City or municipality</Label>
            <div className="mt-2">
              <Combobox id="address-city" placeholder={loadingList === "cities" ? "Loading cities..." : !fields.regionCode ? "Select a region first" : !isNcr && !fields.provinceCode ? "Select a province first" : "Search City / Municipality..."} searchPlaceholder="Type city or municipality..." options={cities.map((c) => ({ value: c.code, label: c.name, secondaryText: c.defaultPostalCode ? `Postal: ${c.defaultPostalCode}` : undefined }))} value={fields.cityCode} onChange={(value) => void handleCityChange(value)} disabled={loadingList === "cities" || !fields.regionCode || (!isNcr && !fields.provinceCode)} error={errors.cityCode} emptyMessage="No matching city found in coverage." />
            </div>
            {errors.cityCode && <p className="mt-1.5 text-xs text-destructive">{errors.cityCode}</p>}
          </div>

          <div>
            <Label htmlFor="address-barangay">Barangay</Label>
            <div className="mt-2">
              <Combobox id="address-barangay" placeholder={loadingList === "barangays" ? "Loading barangays..." : !fields.cityCode ? "Select a city first" : "Search Barangay..."} searchPlaceholder="Type barangay..." options={barangays.map((b) => ({ value: b.code, label: b.name, secondaryText: b.postalCode ? `Postal: ${b.postalCode}` : undefined }))} value={fields.barangayCode} onChange={handleBarangayChange} disabled={loadingList === "barangays" || !fields.cityCode} error={errors.barangayCode} emptyMessage="No matching barangay found in coverage." />
            </div>
            {errors.barangayCode && <p className="mt-1.5 text-xs text-destructive">{errors.barangayCode}</p>}
          </div>

          <div>
            <Label htmlFor="address-postal">Postal code</Label>
            <Input id="address-postal" value={fields.postalCode} onChange={(e) => updateField("postalCode", e.target.value)} autoComplete="postal-code" inputMode="numeric" placeholder="4-digit postal code" aria-invalid={Boolean(errors.postalCode)} className="mt-2 h-11" />
            {errors.postalCode && <p className="mt-1.5 text-xs text-destructive">{errors.postalCode}</p>}
          </div>
        </div>
      </section>

      {/* 3. Recipient and label */}
      <section aria-labelledby="address-recipient-title" className="border-t border-border pt-6">
        <h3 id="address-recipient-title" className="text-sm font-semibold">Recipient</h3>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="address-recipient">Recipient full name</Label>
            <Input id="address-recipient" value={fields.recipientName} onChange={(e) => updateField("recipientName", e.target.value)} autoComplete="name" aria-invalid={Boolean(errors.recipientName)} className="mt-2 h-11" />
            {errors.recipientName && <p className="mt-1.5 text-xs text-destructive">{errors.recipientName}</p>}
          </div>
          <div>
            <Label htmlFor="address-phone">Contact number</Label>
            <Input id="address-phone" value={fields.recipientPhone} onChange={(e) => updateField("recipientPhone", e.target.value)} autoComplete="tel" inputMode="tel" placeholder="e.g. 0917 123 4567" aria-invalid={Boolean(errors.recipientPhone)} className="mt-2 h-11" />
            {errors.recipientPhone && <p className="mt-1.5 text-xs text-destructive">{errors.recipientPhone}</p>}
          </div>
        </div>

        <fieldset className="mt-5">
          <legend className="text-sm font-medium">Label <span className="font-normal text-muted-foreground">(optional)</span></legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {ADDRESS_LABELS.map((option) => {
              const selected = fields.label === option
              return (
                <button key={option} type="button" aria-pressed={selected} onClick={() => updateField("label", selected ? "" : option)} className={cn("rounded-md border px-3 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none", selected ? "border-primary bg-primary/5 font-medium text-foreground ring-1 ring-primary" : "border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground")}>
                  {option}
                </button>
              )
            })}
          </div>
        </fieldset>

        <label className="mt-5 flex cursor-pointer items-start gap-2.5 text-sm">
          <input type="checkbox" checked={fields.isDefault} disabled={isFirstAddress || Boolean(address?.isDefault)} onChange={(e) => updateField("isDefault", e.target.checked)} className="mt-0.5 rounded border-border text-primary focus:ring-primary" />
          <span>
            <span className="block font-medium">Use as my default address</span>
            <span className="block text-xs text-muted-foreground">
              {isFirstAddress ? "Your first address is your default. It's preselected at checkout." : address?.isDefault ? "This is your default. To change it, set another address as default." : "It will be preselected at checkout."}
            </span>
          </span>
        </label>
      </section>

      {mapUnavailable && <p className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive" role="alert">An address can't be saved without a map pin, and the map isn't available right now.</p>}
      {errors.form && <p className="rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm text-destructive" role="alert">{errors.form}</p>}

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-5 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSaving}>Cancel</Button>
        <Button type="submit" disabled={isSaving || lookup.kind === "loading" || Boolean(mapUnavailable)}>
          {isSaving && <Loader2 className="size-4 animate-spin" data-icon="inline-start" aria-hidden="true" />}
          {address ? "Save changes" : "Save address"}
        </Button>
      </div>
    </form>
  )
}
