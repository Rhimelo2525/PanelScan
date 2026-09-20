import { AlertTriangle, ArrowLeft, Hammer, MapPin } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import type { CartItem } from "@/types/cart"

import {
  getDeliveryBarangays,
  getDeliveryCities,
  getDeliveryProvinces,
  getDeliveryRegions,
} from "@/api/delivery"
import { createOrder } from "@/api/orders"
import { useAuth } from "@/auth/use-auth"
import { getCartProductWarning } from "@/cart/cart-utils"
import { useCart } from "@/cart/use-cart"
import { CartEmptyState, CartErrorState, CartPageSkeleton } from "@/components/cart/cart-states"
import { CheckoutOrderSummary } from "@/components/checkout/checkout-order-summary"
import { Container } from "@/components/layout/container"
import { Button } from "@/components/ui/button"
import { Combobox } from "@/components/ui/combobox"
import { DatePickerInput } from "@/components/ui/date-picker-input"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useDocumentTitle } from "@/hooks/use-document-title"
import {
  formatPhilippineDeliveryAddress,
  normalizePhilippinePhone,
} from "@/lib/delivery/address-formatter"
import { getOrderErrorMessage } from "@/orders/order-errors"
import type { DeliveryLocation, PsgcBarangay, PsgcCity, PsgcProvince, PsgcRegion } from "@/types/delivery"

interface CheckoutFields {
  recipientName: string
  phone: string
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
  notes: string
}

interface InstallationFields {
  choice: "no" | "yes"
  date: string
  sameAsShipping: boolean
  customAddress: string
  notes: string
}

type CheckoutErrors = Partial<Record<keyof CheckoutFields | "installationDate" | "installationAddress" | "form", string>>

function minimumDate(): string {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  return date.toISOString().slice(0, 10)
}

function validateCheckout(
  fields: CheckoutFields,
  isNcr: boolean,
  installation: InstallationFields,
): CheckoutErrors {
  const errors: CheckoutErrors = {}
  if (fields.recipientName.trim().length < 2) errors.recipientName = "Enter the recipient's full name."
  if (fields.recipientName.trim().length > 100) errors.recipientName = "Recipient name must be 100 characters or fewer."
  if (fields.phone.trim().length < 7) errors.phone = "Enter a contact phone number."
  if (fields.phone.trim().length > 30) errors.phone = "Phone number must be 30 characters or fewer."
  if (fields.addressLine1.trim().length < 3) errors.addressLine1 = "Enter a complete street, building, or unit address."

  if (!fields.regionCode) errors.regionCode = "Select a region."
  if (!isNcr && !fields.provinceCode) errors.provinceCode = "Select a province."
  if (!fields.cityCode) errors.cityCode = "Select a city or municipality."
  if (!fields.barangayCode) errors.barangayCode = "Select a barangay."
  if (fields.postalCode.trim().length < 3) errors.postalCode = "Enter a valid postal code."

  if (fields.notes.trim().length > 1000) errors.notes = "Order notes must be 1,000 characters or fewer."

  if (installation.choice === "yes") {
    if (!installation.date) {
      errors.installationDate = "Choose a preferred installation date."
    } else {
      const selected = new Date(`${installation.date}T09:00:00`).getTime()
      if (Number.isNaN(selected) || selected <= Date.now()) {
        errors.installationDate = "Preferred installation date must be in the future."
      }
    }

    if (!installation.sameAsShipping) {
      if (installation.customAddress.trim().length < 10) {
        errors.installationAddress = "Enter the full installation address (at least 10 characters)."
      } else if (installation.customAddress.trim().length > 500) {
        errors.installationAddress = "Installation address must be 500 characters or fewer."
      }
    }
  }

  return errors
}

export function CheckoutPage() {
  useDocumentTitle("Checkout | PanelScan")
  const { user } = useAuth()
  const { items, selectedItems, selectedItemCount, isLoading, error: cartError, refreshCart } = useCart()
  const location = useLocation()
  const navigate = useNavigate()

  const [directCheckoutItem] = useState<CartItem | null>(() => {
    const stateItem = (location.state as { directCheckout?: CartItem } | null)?.directCheckout
    if (stateItem && stateItem.productId) {
      return stateItem
    }
    const params = new URLSearchParams(location.search)
    if (params.get("direct") === "1") {
      const saved = sessionStorage.getItem("panelscan_direct_checkout")
      if (saved) {
        try {
          return JSON.parse(saved) as CartItem
        } catch {
          return null
        }
      }
    }
    return null
  })

  const isDirectCheckout = Boolean(directCheckoutItem)

  const [fields, setFields] = useState<CheckoutFields>({
    recipientName: "",
    phone: "",
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
    notes: "",
  })

  const [installation, setInstallation] = useState<InstallationFields>({
    choice: "no",
    date: "",
    sameAsShipping: true,
    customAddress: "",
    notes: "",
  })

  // Location data states
  const [regions, setRegions] = useState<PsgcRegion[]>([])
  const [provinces, setProvinces] = useState<PsgcProvince[]>([])
  const [cities, setCities] = useState<PsgcCity[]>([])
  const [barangays, setBarangays] = useState<PsgcBarangay[]>([])

  const [isLoadingRegions, setIsLoadingRegions] = useState(false)
  const [isLoadingProvinces, setIsLoadingProvinces] = useState(false)
  const [isLoadingCities, setIsLoadingCities] = useState(false)
  const [isLoadingBarangays, setIsLoadingBarangays] = useState(false)

  const [errors, setErrors] = useState<CheckoutErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showCartAction, setShowCartAction] = useState(false)
  const submissionLock = useRef(false)

  const isNcr = fields.regionCode === "130000000"

  // Load preliminary regions on mount
  useEffect(() => {
    let isMounted = true
    setIsLoadingRegions(true)
    getDeliveryRegions()
      .then((data) => {
        if (isMounted) setRegions(data)
      })
      .catch((err) => {
        console.error("Failed to load delivery regions:", err)
      })
      .finally(() => {
        if (isMounted) setIsLoadingRegions(false)
      })
    return () => {
      isMounted = false
    }
  }, [])

  // Auto-fill user contact info
  useEffect(() => {
    if (!user) return
    setFields((current) => ({
      ...current,
      recipientName: current.recipientName || `${user.firstName} ${user.lastName}`.trim(),
      phone: current.phone || user.phone || "",
    }))
  }, [user])

  const checkoutItems = useMemo(
    () => (directCheckoutItem ? [directCheckoutItem] : selectedItems),
    [directCheckoutItem, selectedItems]
  )
  const checkoutItemCount = useMemo(
    () => (directCheckoutItem ? directCheckoutItem.quantity : selectedItemCount),
    [directCheckoutItem, selectedItemCount]
  )

  const cartWarnings = useMemo(
    () =>
      checkoutItems
        .map((item) => getCartProductWarning(item.product, item.quantity))
        .filter((warning): warning is string => Boolean(warning)),
    [checkoutItems]
  )
  const canSubmit = checkoutItems.length > 0 && (isDirectCheckout || !cartError) && cartWarnings.length === 0

  function updateField<K extends keyof CheckoutFields>(name: K, value: CheckoutFields[K]) {
    setFields((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined, form: undefined }))
    setShowCartAction(false)
  }

  // Cascading handler: Region change
  async function handleRegionChange(newRegionCode: string) {
    const selectedRegion = regions.find((r) => r.code === newRegionCode)
    const isNowNcr = newRegionCode === "130000000"

    setFields((current) => ({
      ...current,
      regionCode: newRegionCode,
      regionName: selectedRegion?.name || "",
      provinceCode: "",
      provinceName: "",
      cityCode: "",
      cityName: "",
      barangayCode: "",
      barangayName: "",
    }))

    setErrors((current) => ({
      ...current,
      regionCode: undefined,
      provinceCode: undefined,
      cityCode: undefined,
      barangayCode: undefined,
      form: undefined,
    }))

    setProvinces([])
    setCities([])
    setBarangays([])

    if (!newRegionCode) return

    if (isNowNcr) {
      // NCR special flow: NCR -> City (no province)
      setIsLoadingCities(true)
      try {
        const cityList = await getDeliveryCities(newRegionCode, null)
        setCities(cityList)
      } catch (error) {
        console.error("Failed to load NCR cities:", error)
      } finally {
        setIsLoadingCities(false)
      }
    } else {
      // Provincial flow: Region -> Province -> City
      setIsLoadingProvinces(true)
      try {
        const provinceList = await getDeliveryProvinces(newRegionCode)
        setProvinces(provinceList)
      } catch (error) {
        console.error("Failed to load provinces:", error)
      } finally {
        setIsLoadingProvinces(false)
      }
    }
  }

  // Cascading handler: Province change
  async function handleProvinceChange(newProvinceCode: string) {
    const selectedProvince = provinces.find((p) => p.code === newProvinceCode)

    setFields((current) => ({
      ...current,
      provinceCode: newProvinceCode,
      provinceName: selectedProvince?.name || "",
      cityCode: "",
      cityName: "",
      barangayCode: "",
      barangayName: "",
    }))

    setErrors((current) => ({
      ...current,
      provinceCode: undefined,
      cityCode: undefined,
      barangayCode: undefined,
      form: undefined,
    }))

    setCities([])
    setBarangays([])

    if (!newProvinceCode || !fields.regionCode) return

    setIsLoadingCities(true)
    try {
      const cityList = await getDeliveryCities(fields.regionCode, newProvinceCode)
      setCities(cityList)
    } catch (error) {
      console.error("Failed to load cities:", error)
    } finally {
      setIsLoadingCities(false)
    }
  }

  // Cascading handler: City change
  async function handleCityChange(newCityCode: string) {
    const selectedCity = cities.find((c) => c.code === newCityCode)

    setFields((current) => ({
      ...current,
      cityCode: newCityCode,
      cityName: selectedCity?.name || "",
      barangayCode: "",
      barangayName: "",
      postalCode: selectedCity?.defaultPostalCode || current.postalCode,
    }))

    setErrors((current) => ({
      ...current,
      cityCode: undefined,
      barangayCode: undefined,
      postalCode: undefined,
      form: undefined,
    }))

    setBarangays([])

    if (!newCityCode) return

    setIsLoadingBarangays(true)
    try {
      const barangayList = await getDeliveryBarangays(newCityCode)
      setBarangays(barangayList)
    } catch (error) {
      console.error("Failed to load barangays:", error)
    } finally {
      setIsLoadingBarangays(false)
    }
  }

  // Cascading handler: Barangay change
  function handleBarangayChange(newBarangayCode: string) {
    const selectedBarangay = barangays.find((b) => b.code === newBarangayCode)

    setFields((current) => ({
      ...current,
      barangayCode: newBarangayCode,
      barangayName: selectedBarangay?.name || "",
      postalCode: selectedBarangay?.postalCode || current.postalCode,
    }))

    setErrors((current) => ({
      ...current,
      barangayCode: undefined,
      postalCode: undefined,
      form: undefined,
    }))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = validateCheckout(fields, isNcr, installation)

    if (!canSubmit) {
      nextErrors.form = cartWarnings[0] ?? "Your cart is not ready for checkout. Return to the cart and try again."
    }

    if (Object.values(nextErrors).some(Boolean)) {
      setErrors(nextErrors)
      setShowCartAction(!canSubmit)
      document.getElementById("checkout-error-summary")?.focus()
      return
    }

    // Build canonical structured DeliveryLocation snapshot
    const formattedAddress = formatPhilippineDeliveryAddress({
      addressLine1: fields.addressLine1,
      barangayName: fields.barangayName,
      cityMunicipalityName: fields.cityName,
      provinceName: isNcr ? null : (fields.provinceName || null),
      regionName: fields.regionName,
      postalCode: fields.postalCode,
    })

    const normalizedPhone = normalizePhilippinePhone(fields.phone)

    const deliveryLocation: DeliveryLocation = {
      addressLine1: fields.addressLine1.trim(),
      regionCode: fields.regionCode,
      regionName: fields.regionName,
      provinceCode: isNcr ? null : (fields.provinceCode || null),
      provinceName: isNcr ? null : (fields.provinceName || null),
      cityMunicipalityCode: fields.cityCode,
      cityMunicipalityName: fields.cityName,
      barangayCode: fields.barangayCode,
      barangayName: fields.barangayName,
      postalCode: fields.postalCode.trim(),
      formattedAddress,
      recipientName: fields.recipientName.trim(),
      recipientPhone: normalizedPhone,
      latitude: null, // Strictly null until authorized geocoder in Lalamove phase
      longitude: null, // Strictly null until authorized geocoder in Lalamove phase
      geocodingStatus: "pending",
      geocodingProvider: null,
      geocodingPlaceId: null,
    }

    if (formattedAddress.length > 500) {
      setErrors({ form: "The combined delivery address is too long. Shorten the address details." })
      return
    }

    if (submissionLock.current) return
    submissionLock.current = true
    setIsSubmitting(true)

    const installationPayload =
      installation.choice === "yes"
        ? {
            scheduledDate: new Date(`${installation.date}T09:00:00`).toISOString(),
            address: installation.sameAsShipping ? formattedAddress : installation.customAddress.trim(),
            notes: installation.notes.trim() || undefined,
          }
        : undefined

    try {
      const order = await createOrder({
        shippingAddress: formattedAddress,
        deliveryLocation,
        notes: fields.notes.trim() || undefined,
        installation: installationPayload,
        selectedItemIds: isDirectCheckout ? undefined : checkoutItems.map((item) => item.id),
        selectedProductIds: isDirectCheckout ? undefined : checkoutItems.map((item) => item.productId),
        directItem:
          isDirectCheckout && directCheckoutItem
            ? {
                productId: directCheckoutItem.productId,
                quantity: directCheckoutItem.quantity,
              }
            : undefined,
      })
      if (isDirectCheckout) {
        sessionStorage.removeItem("panelscan_direct_checkout")
      }
      await refreshCart()
      navigate(`/orders/${order.id}?created=1`, { replace: true, state: { createdOrder: order } })
    } catch (caughtError) {
      setErrors({ form: getOrderErrorMessage(caughtError) })
      setShowCartAction(true)
      document.getElementById("checkout-error-summary")?.focus()
    } finally {
      submissionLock.current = false
      setIsSubmitting(false)
    }
  }

  if (!isDirectCheckout && isLoading && !items.length) {
    return (
      <Container className="py-12 sm:py-16">
        <CartPageSkeleton />
      </Container>
    )
  }
  if (!isDirectCheckout && cartError && !items.length) {
    return (
      <Container className="py-16">
        <CartErrorState message={cartError} onRetry={() => void refreshCart()} />
      </Container>
    )
  }
  if (!isDirectCheckout && !items.length) {
    return (
      <Container className="py-16">
        <CartEmptyState />
      </Container>
    )
  }
  if (!isDirectCheckout && items.length > 0 && selectedItems.length === 0) {
    return (
      <Container className="py-16">
        <div className="mx-auto max-w-md text-center">
          <h2 className="text-xl font-semibold">No items selected for checkout</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Please return to your cart and select the products you would like to purchase.
          </p>
          <Button className="mt-6" asChild>
            <Link to="/cart">
              <ArrowLeft data-icon="inline-start" aria-hidden="true" />
              Return to cart
            </Link>
          </Button>
        </div>
      </Container>
    )
  }

  // Format options for comboboxes
  const regionOptions = regions.map((r) => ({
    value: r.code,
    label: r.name,
    secondaryText: r.shortName,
  }))

  const provinceOptions = provinces.map((p) => ({
    value: p.code,
    label: p.name,
  }))

  const cityOptions = cities.map((c) => ({
    value: c.code,
    label: c.name,
    secondaryText: c.defaultPostalCode ? `Postal: ${c.defaultPostalCode}` : undefined,
  }))

  const barangayOptions = barangays.map((b) => ({
    value: b.code,
    label: b.name,
    secondaryText: b.postalCode ? `Postal: ${b.postalCode}` : undefined,
  }))

  return (
    <Container className="py-10 sm:py-14 lg:py-18">
      <Button
        variant="ghost"
        onClick={() => {
          if (isDirectCheckout) {
            sessionStorage.removeItem("panelscan_direct_checkout")
          }
        }}
        asChild
      >
        <Link to={isDirectCheckout && directCheckoutItem ? `/products/${directCheckoutItem.productId}` : "/cart"}>
          <ArrowLeft data-icon="inline-start" aria-hidden="true" />
          {isDirectCheckout ? "Back to product" : "Return to cart"}
        </Link>
      </Button>

      <div className="mt-7 max-w-3xl">
        <p className="section-eyebrow">Secure order creation</p>
        <h1 className="type-h1 mt-4">Delivery information</h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">
          Enter your delivery destination. Your order is created before payment and verified against official delivery zones.
        </p>
      </div>

      <ol className="mt-8 flex flex-wrap gap-2 text-xs font-semibold" aria-label="Checkout progress">
        <li className="bg-primary px-3 py-2 text-primary-foreground">1. Delivery</li>
        <li className="rounded-md border border-border px-3 py-2 text-muted-foreground">2. Review</li>
        <li className="rounded-md border border-border px-3 py-2 text-muted-foreground">3. Confirmation</li>
      </ol>

      {!canSubmit && (
        <div className="mt-7 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {cartWarnings[0] ?? cartError ?? "Your cart is not ready for checkout."}
          </p>
          <Button variant="outline" size="sm" asChild>
            <Link to="/cart">Review cart</Link>
          </Button>
        </div>
      )}

      <form
        className="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-14"
        onSubmit={handleSubmit}
        noValidate
      >
        <div className="space-y-8">
          <section className="surface-card p-5 sm:p-8" aria-labelledby="delivery-form-title">
          <div className="flex items-center gap-2">
            <MapPin className="size-4 text-primary" aria-hidden="true" />
            <h2 id="delivery-form-title" className="text-sm font-semibold tracking-[0.12em] uppercase">
              Recipient and address
            </h2>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Delivery is currently available within selected areas in Luzon.
          </p>

          {errors.form && (
            <div
              id="checkout-error-summary"
              role="alert"
              tabIndex={-1}
              className="mt-6 rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive outline-none"
            >
              <p className="flex items-start gap-2 font-semibold">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                We couldn't place your order
              </p>
              <p className="mt-1 pl-6 leading-6">{errors.form}</p>
              {showCartAction && (
                <Button variant="outline" size="sm" className="mt-3 ml-6" asChild>
                  <Link to="/cart">Review cart</Link>
                </Button>
              )}
            </div>
          )}

          <div className="mt-7 grid gap-6 sm:grid-cols-2">
            {/* ROW 1: Recipient full name | Contact phone */}
            <div>
              <Label htmlFor="recipientName">Recipient full name</Label>
              <Input
                id="recipientName"
                name="recipientName"
                value={fields.recipientName}
                onChange={(e) => updateField("recipientName", e.target.value)}
                autoComplete="name"
                aria-invalid={Boolean(errors.recipientName)}
                aria-describedby={errors.recipientName ? "recipientName-error" : undefined}
                className="mt-2 h-11"
              />
              {errors.recipientName && (
                <p id="recipientName-error" className="motion-swap mt-1.5 text-xs text-destructive">
                  {errors.recipientName}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="phone">Contact phone</Label>
              <Input
                id="phone"
                name="phone"
                value={fields.phone}
                onChange={(e) => updateField("phone", e.target.value)}
                autoComplete="tel"
                inputMode="tel"
                placeholder="e.g. 0917 123 4567"
                aria-invalid={Boolean(errors.phone)}
                aria-describedby={errors.phone ? "phone-error" : undefined}
                className="mt-2 h-11"
              />
              {errors.phone && (
                <p id="phone-error" className="motion-swap mt-1.5 text-xs text-destructive">
                  {errors.phone}
                </p>
              )}
            </div>

            {/* ROW 2: Street, building, or unit — full width */}
            <div className="sm:col-span-2">
              <Label htmlFor="addressLine1">Street, building, or unit</Label>
              <Input
                id="addressLine1"
                name="addressLine1"
                value={fields.addressLine1}
                onChange={(e) => updateField("addressLine1", e.target.value)}
                autoComplete="street-address"
                placeholder="House / Unit / Block / Lot, Building name, Street"
                aria-invalid={Boolean(errors.addressLine1)}
                aria-describedby={errors.addressLine1 ? "addressLine1-error" : undefined}
                className="mt-2 h-11"
              />
              {errors.addressLine1 && (
                <p id="addressLine1-error" className="motion-swap mt-1.5 text-xs text-destructive">
                  {errors.addressLine1}
                </p>
              )}
            </div>

            {/* ROW 3: Region | Province */}
            <div>
              <Label htmlFor="region">Region</Label>
              <div className="mt-2">
                <Combobox
                  id="region"
                  placeholder={isLoadingRegions ? "Loading regions..." : "Select Region"}
                  searchPlaceholder="Search Luzon region..."
                  options={regionOptions}
                  value={fields.regionCode}
                  onChange={handleRegionChange}
                  disabled={isLoadingRegions || regions.length === 0}
                  error={errors.regionCode}
                />
              </div>
              {errors.regionCode && (
                <p id="region-error" className="motion-swap mt-1.5 text-xs text-destructive">
                  {errors.regionCode}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="province">Province</Label>
              <div className="mt-2">
                <Combobox
                  id="province"
                  placeholder={
                    isNcr
                      ? "— Not applicable (NCR) —"
                      : isLoadingProvinces
                      ? "Loading provinces..."
                      : !fields.regionCode
                      ? "Select a region first"
                      : "Select Province"
                  }
                  searchPlaceholder="Search province..."
                  options={provinceOptions}
                  value={fields.provinceCode}
                  onChange={handleProvinceChange}
                  disabled={isNcr || !fields.regionCode || isLoadingProvinces}
                  error={errors.provinceCode}
                />
              </div>
              {errors.provinceCode && !isNcr && (
                <p id="province-error" className="motion-swap mt-1.5 text-xs text-destructive">
                  {errors.provinceCode}
                </p>
              )}
            </div>

            {/* ROW 4: City / Municipality | Barangay */}
            <div>
              <Label htmlFor="city">City or municipality</Label>
              <div className="mt-2">
                <Combobox
                  id="city"
                  placeholder={
                    isLoadingCities
                      ? "Loading cities..."
                      : !fields.regionCode
                      ? "Select a region first"
                      : !isNcr && !fields.provinceCode
                      ? "Select a province first"
                      : "Search City / Municipality..."
                  }
                  searchPlaceholder="Type city or municipality..."
                  options={cityOptions}
                  value={fields.cityCode}
                  onChange={handleCityChange}
                  disabled={
                    isLoadingCities ||
                    !fields.regionCode ||
                    (!isNcr && !fields.provinceCode)
                  }
                  error={errors.cityCode}
                  emptyMessage="No matching city found in coverage."
                />
              </div>
              {errors.cityCode && (
                <p id="city-error" className="motion-swap mt-1.5 text-xs text-destructive">
                  {errors.cityCode}
                </p>
              )}
            </div>

            <div>
              <Label htmlFor="barangay">Barangay</Label>
              <div className="mt-2">
                <Combobox
                  id="barangay"
                  placeholder={
                    isLoadingBarangays
                      ? "Loading barangays..."
                      : !fields.cityCode
                      ? "Select a city first"
                      : "Search Barangay..."
                  }
                  searchPlaceholder="Type barangay..."
                  options={barangayOptions}
                  value={fields.barangayCode}
                  onChange={handleBarangayChange}
                  disabled={isLoadingBarangays || !fields.cityCode}
                  error={errors.barangayCode}
                  emptyMessage="No matching barangay found in coverage."
                />
              </div>
              {errors.barangayCode && (
                <p id="barangay-error" className="motion-swap mt-1.5 text-xs text-destructive">
                  {errors.barangayCode}
                </p>
              )}
            </div>

            {/* ROW 5: Postal code */}
            <div>
              <Label htmlFor="postalCode">Postal code</Label>
              <Input
                id="postalCode"
                name="postalCode"
                value={fields.postalCode}
                onChange={(e) => updateField("postalCode", e.target.value)}
                autoComplete="postal-code"
                inputMode="numeric"
                placeholder="4-digit postal code"
                aria-invalid={Boolean(errors.postalCode)}
                aria-describedby={errors.postalCode ? "postalCode-error" : undefined}
                className="mt-2 h-11"
              />
              {errors.postalCode && (
                <p id="postalCode-error" className="motion-swap mt-1.5 text-xs text-destructive">
                  {errors.postalCode}
                </p>
              )}
            </div>
          </div>

          {/* ROW 6: Order notes — full width */}
          <div className="mt-6 space-y-2">
            <Label htmlFor="notes">Order notes (optional)</Label>
            <Textarea
              id="notes"
              value={fields.notes}
              onChange={(event) => updateField("notes", event.target.value)}
              maxLength={1000}
              rows={4}
              aria-invalid={Boolean(errors.notes)}
              aria-describedby={errors.notes ? "notes-error" : "notes-help"}
              placeholder="Landmarks, access instructions, or helpful delivery notes"
            />
            <p
              id={errors.notes ? "notes-error" : "notes-help"}
              className={errors.notes ? "text-xs text-destructive" : "text-xs text-muted-foreground"}
            >
              {errors.notes ??
                "Do not include payment details. Delivery scheduling will be coordinated after order creation."}
            </p>
          </div>
        </section>

        <section className="surface-card p-5 sm:p-8" aria-labelledby="installation-service-title">
          <div className="flex items-center gap-2">
            <Hammer className="size-4 text-primary" aria-hidden="true" />
            <h2 id="installation-service-title" className="text-sm font-semibold tracking-[0.12em] uppercase">
              Installation service
            </h2>
          </div>
          <p className="mt-2 text-sm font-medium">
            Do you need an installer from iDISENYO Interior Solutions?
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label
              className={`relative flex cursor-pointer rounded-lg border p-4 transition-colors ${
                installation.choice === "no"
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="installationOption"
                  value="no"
                  checked={installation.choice === "no"}
                  onChange={() => {
                    setInstallation((prev) => ({ ...prev, choice: "no" }))
                    setErrors((prev) => ({ ...prev, installationDate: undefined, installationAddress: undefined }))
                  }}
                  className="mt-1 text-primary focus:ring-primary"
                />
                <div>
                  <span className="block text-sm font-semibold">No, materials only</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    Order panels only. You arrange or handle fitting yourself.
                  </span>
                </div>
              </div>
            </label>

            <label
              className={`relative flex cursor-pointer rounded-lg border p-4 transition-colors ${
                installation.choice === "yes"
                  ? "border-primary bg-primary/5 ring-1 ring-primary"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="installationOption"
                  value="yes"
                  checked={installation.choice === "yes"}
                  onChange={() => setInstallation((prev) => ({ ...prev, choice: "yes" }))}
                  className="mt-1 text-primary focus:ring-primary"
                />
                <div>
                  <span className="block text-sm font-semibold">Yes, I need installation</span>
                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                    Request professional installation arranged by the iDISENYO team.
                  </span>
                </div>
              </div>
            </label>
          </div>

          {installation.choice === "yes" && (
            <div className="mt-6 space-y-5 border-t border-border pt-6">
              <div>
                <Label htmlFor="installationDate">Preferred installation date</Label>
                <DatePickerInput
                  id="installationDate"
                  name="installationDate"
                  placeholder="MM DD, YY"
                  min={minimumDate()}
                  value={installation.date}
                  onChange={(dateValue) => {
                    setInstallation((prev) => ({ ...prev, date: dateValue }))
                    setErrors((prev) => ({ ...prev, installationDate: undefined }))
                  }}
                  error={Boolean(errors.installationDate)}
                  describedBy={errors.installationDate ? "installationDate-error" : "installationDate-help"}
                  className="mt-2 max-w-sm"
                />
                <p id="installationDate-help" className="mt-1.5 text-xs text-muted-foreground">
                  The final schedule will be confirmed by the iDISENYO team.
                </p>
                {errors.installationDate && (
                  <p id="installationDate-error" className="motion-swap mt-1 text-xs text-destructive">
                    {errors.installationDate}
                  </p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="customInstallationAddress">Installation address</Label>
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground">
                    <input
                      type="checkbox"
                      checked={installation.sameAsShipping}
                      onChange={(e) => {
                        setInstallation((prev) => ({ ...prev, sameAsShipping: e.target.checked }))
                        setErrors((prev) => ({ ...prev, installationAddress: undefined }))
                      }}
                      className="rounded border-border text-primary focus:ring-primary"
                    />
                    Same as shipping address
                  </label>
                </div>

                {installation.sameAsShipping ? (
                  <div className="mt-2 rounded-lg border border-border/80 bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
                    Using shipping address entered above. Uncheck &ldquo;Same as shipping address&rdquo; to provide a different installation site.
                  </div>
                ) : (
                  <div className="mt-2">
                    <Textarea
                      id="customInstallationAddress"
                      rows={3}
                      value={installation.customAddress}
                      onChange={(e) => {
                        setInstallation((prev) => ({ ...prev, customAddress: e.target.value }))
                        setErrors((prev) => ({ ...prev, installationAddress: undefined }))
                      }}
                      placeholder="Unit / house number, street, barangay, city"
                      maxLength={500}
                      aria-invalid={Boolean(errors.installationAddress)}
                      aria-describedby={errors.installationAddress ? "installationAddress-error" : undefined}
                    />
                    {errors.installationAddress && (
                      <p id="installationAddress-error" className="motion-swap mt-1 text-xs text-destructive">
                        {errors.installationAddress}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <Label htmlFor="installationNotes">Installation notes (optional)</Label>
                <Textarea
                  id="installationNotes"
                  rows={3}
                  value={installation.notes}
                  onChange={(e) => setInstallation((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Room, wall/ceiling area, access details, or other installation information"
                  maxLength={1000}
                  className="mt-2"
                />
              </div>
            </div>
          )}
        </section>
        </div>

        <CheckoutOrderSummary
          items={checkoutItems}
          itemCount={checkoutItemCount}
          isSubmitting={isSubmitting}
          canSubmit={canSubmit}
        />
      </form>
    </Container>
  )
}
