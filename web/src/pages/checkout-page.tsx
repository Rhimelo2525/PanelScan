import { AlertTriangle, ArrowLeft, Hammer, MapPin, MapPinPlus } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import type { CartItem } from "@/types/cart"

import { getSavedAddresses } from "@/api/addresses"
import { createOrder } from "@/api/orders"
import { getCartProductWarning } from "@/cart/cart-utils"
import { useCart } from "@/cart/use-cart"
import { AddressDialog } from "@/components/addresses/address-dialog"
import { SavedAddressSummary } from "@/components/addresses/saved-address-summary"
import { CartEmptyState, CartErrorState, CartPageSkeleton } from "@/components/cart/cart-states"
import { CheckoutOrderSummary } from "@/components/checkout/checkout-order-summary"
import { useConfirm } from "@/components/confirm/use-confirm"
import { Container } from "@/components/layout/container"
import { Button } from "@/components/ui/button"
import { DatePickerInput } from "@/components/ui/date-picker-input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { calculateLineTotal, formatMinorUnits } from "@/lib/format-price"
import { getOrderErrorMessage } from "@/orders/order-errors"
import type { SavedAddress } from "@/types/address"

interface CheckoutFields {
  notes: string
}

interface InstallationFields {
  choice: "no" | "yes"
  date: string
  sameAsShipping: boolean
  customAddress: string
  notes: string
}

type CheckoutErrors = Partial<Record<keyof CheckoutFields | "address" | "installationDate" | "installationAddress" | "form", string>>

function minimumDate(): string {
  const date = new Date()
  date.setDate(date.getDate() + 1)
  return date.toISOString().slice(0, 10)
}

function validateCheckout(
  fields: CheckoutFields,
  selectedAddress: SavedAddress | null,
  installation: InstallationFields,
): CheckoutErrors {
  const errors: CheckoutErrors = {}
  if (!selectedAddress) errors.address = "Choose a shipping address, or add one."
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

  const [fields, setFields] = useState<CheckoutFields>({ notes: "" })

  const [installation, setInstallation] = useState<InstallationFields>({
    choice: "no",
    date: "",
    sameAsShipping: true,
    customAddress: "",
    notes: "",
  })

  // Saved shipping addresses (managed on the profile page). The default one
  // is preselected; the order receives a snapshot of whichever is chosen -
  // recipient, address, and its pinned coordinates - so nothing is retyped.
  const [addresses, setAddresses] = useState<SavedAddress[] | null>(null)
  const [addressLoadError, setAddressLoadError] = useState(false)
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null)
  const [isAddressDialogOpen, setIsAddressDialogOpen] = useState(false)

  const [errors, setErrors] = useState<CheckoutErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showCartAction, setShowCartAction] = useState(false)
  const submissionLock = useRef(false)
  const confirm = useConfirm()

  async function loadAddresses(preferredId?: string) {
    try {
      const list = await getSavedAddresses()
      setAddresses(list)
      setAddressLoadError(false)
      setSelectedAddressId((current) => {
        const keep = preferredId ?? current
        if (keep && list.some((address) => address.id === keep)) return keep
        return (list.find((address) => address.isDefault) ?? list[0])?.id ?? null
      })
    } catch {
      setAddressLoadError(true)
    }
  }

  useEffect(() => {
    void loadAddresses()
  }, [])

  const selectedAddress = addresses?.find((address) => address.id === selectedAddressId) ?? null

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

  function selectAddress(addressId: string) {
    setSelectedAddressId(addressId)
    setErrors((current) => ({ ...current, address: undefined, form: undefined }))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = validateCheckout(fields, selectedAddress, installation)

    if (!canSubmit) {
      nextErrors.form = cartWarnings[0] ?? "Your cart is not ready for checkout. Return to the cart and try again."
    }

    if (Object.values(nextErrors).some(Boolean) || !selectedAddress) {
      setErrors(nextErrors)
      setShowCartAction(!canSubmit)
      document.getElementById(nextErrors.form ? "checkout-error-summary" : "shipping-address-title")?.focus()
      return
    }

    if (submissionLock.current) return

    // Final review before the order is created. The shipping fee is quoted
    // after a moderator approves the order, so it is not part of this total.
    const subtotal = checkoutItems.reduce<number | null>((total, item) => {
      const line = calculateLineTotal(item.product.price, item.quantity)
      return total === null || line === null ? null : total + line
    }, 0)
    const confirmed = await confirm({
      title: "Place this order?",
      description: "Your order will be sent to PanelScan for approval. Once approved, the delivery fee is quoted and you pay products and shipping together in one GCash payment.",
      details: [
        ...checkoutItems.map((item) => ({ label: item.product.name, value: `× ${item.quantity}` })),
        { label: "Products total", value: subtotal === null ? "Unavailable" : formatMinorUnits(subtotal) },
        { label: "Shipping fee", value: "Quoted after approval" },
        { label: "Deliver to", value: selectedAddress.recipientName },
        { label: "Installation", value: installation.choice === "yes" ? "Requested" : "Not requested" },
      ],
      confirmLabel: "Place Order",
    })
    if (!confirmed || submissionLock.current) return

    submissionLock.current = true
    setIsSubmitting(true)

    const installationPayload =
      installation.choice === "yes"
        ? {
            scheduledDate: new Date(`${installation.date}T09:00:00`).toISOString(),
            address: installation.sameAsShipping ? selectedAddress.formattedAddress : installation.customAddress.trim(),
            notes: installation.notes.trim() || undefined,
          }
        : undefined

    try {
      const order = await createOrder({
        // The backend builds the order's delivery snapshot from the saved
        // address itself; shippingAddress is sent only for older API clients' parity.
        addressId: selectedAddress.id,
        shippingAddress: selectedAddress.formattedAddress,
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
          Choose where to deliver - your saved address, exact map pin included, is used automatically. Your order is created before payment and verified against official delivery zones.
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
          <section className="surface-card p-5 sm:p-8" aria-labelledby="shipping-address-title">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <MapPin className="size-4 text-primary" aria-hidden="true" />
              <h2 id="shipping-address-title" tabIndex={-1} className="text-sm font-semibold tracking-[0.12em] uppercase outline-none">
                Select shipping address
              </h2>
            </div>
            {addresses && addresses.length > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={() => setIsAddressDialogOpen(true)}>
                <MapPinPlus className="size-3.5" data-icon="inline-start" aria-hidden="true" />
                Add new address
              </Button>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Delivery is currently available within selected areas in Luzon. Manage your addresses anytime from your{" "}
            <Link to="/profile" className="font-medium text-primary hover:underline">profile</Link>.
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

          <div className="mt-6">
            {addresses === null && !addressLoadError ? (
              <div className="space-y-3" aria-label="Loading your saved addresses" aria-busy="true">
                <Skeleton className="h-28 w-full rounded-lg" />
                <Skeleton className="h-28 w-full rounded-lg" />
              </div>
            ) : addressLoadError ? (
              <div className="rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
                <p>Your saved addresses could not be loaded.</p>
                <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => { setAddressLoadError(false); setAddresses(null); void loadAddresses() }}>
                  Try again
                </Button>
              </div>
            ) : addresses && addresses.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-secondary/35 px-6 py-10 text-center">
                <p className="text-sm font-medium">No shipping address saved yet.</p>
                <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
                  Pin your delivery spot on the map once - we'll fill in the address and remember it for next time.
                </p>
                <Button type="button" className="mt-5" onClick={() => setIsAddressDialogOpen(true)}>
                  <MapPinPlus data-icon="inline-start" aria-hidden="true" />
                  Add shipping address
                </Button>
              </div>
            ) : (
              <div role="radiogroup" aria-labelledby="shipping-address-title" aria-invalid={Boolean(errors.address)} className="space-y-3">
                {addresses?.map((address) => {
                  const isSelected = address.id === selectedAddressId
                  return (
                    <label
                      key={address.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
                        isSelected ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="shippingAddress"
                        value={address.id}
                        checked={isSelected}
                        onChange={() => selectAddress(address.id)}
                        className="mt-1 text-primary focus:ring-primary"
                      />
                      <SavedAddressSummary address={address} />
                    </label>
                  )
                })}
              </div>
            )}
            {errors.address && (
              <p className="motion-swap mt-2 text-xs text-destructive" role="alert">
                {errors.address}
              </p>
            )}
          </div>

          {/* Order notes — full width */}
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
                    Using the shipping address selected above. Uncheck &ldquo;Same as shipping address&rdquo; to provide a different installation site.
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

      <AddressDialog
        open={isAddressDialogOpen}
        onOpenChange={setIsAddressDialogOpen}
        address={null}
        isFirstAddress={(addresses?.length ?? 0) === 0}
        onSaved={(saved) => {
          // Back to checkout with the new address already chosen.
          void loadAddresses(saved.id)
          selectAddress(saved.id)
        }}
      />
    </Container>
  )
}
