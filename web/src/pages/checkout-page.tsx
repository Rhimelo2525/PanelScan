import { AlertTriangle, ArrowLeft, MapPin } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useNavigate } from "react-router-dom"

import { createOrder } from "@/api/orders"
import { useAuth } from "@/auth/use-auth"
import { getCartProductWarning } from "@/cart/cart-utils"
import { useCart } from "@/cart/use-cart"
import { CartEmptyState, CartErrorState, CartPageSkeleton } from "@/components/cart/cart-states"
import { CheckoutOrderSummary } from "@/components/checkout/checkout-order-summary"
import { Container } from "@/components/layout/container"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { getOrderErrorMessage } from "@/orders/order-errors"

interface CheckoutFields {
  recipientName: string
  phone: string
  addressLine: string
  barangay: string
  city: string
  province: string
  postalCode: string
  notes: string
}

type CheckoutErrors = Partial<Record<keyof CheckoutFields | "form", string>>

function validateCheckout(fields: CheckoutFields): CheckoutErrors {
  const errors: CheckoutErrors = {}
  if (fields.recipientName.trim().length < 2) errors.recipientName = "Enter the recipient's full name."
  if (fields.recipientName.trim().length > 100) errors.recipientName = "Recipient name must be 100 characters or fewer."
  if (fields.phone.trim().length < 7) errors.phone = "Enter a contact phone number."
  if (fields.phone.trim().length > 30) errors.phone = "Phone number must be 30 characters or fewer."
  if (fields.addressLine.trim().length < 5) errors.addressLine = "Enter a complete street or building address."
  if (fields.city.trim().length < 2) errors.city = "Enter the city or municipality."
  if (fields.province.trim().length < 2) errors.province = "Enter the province."
  if (fields.notes.trim().length > 1000) errors.notes = "Order notes must be 1,000 characters or fewer."
  return errors
}

function buildShippingAddress(fields: CheckoutFields): string {
  const locality = [fields.barangay.trim(), fields.city.trim(), fields.province.trim(), fields.postalCode.trim()].filter(Boolean).join(", ")
  return [`Recipient: ${fields.recipientName.trim()}`, `Contact: ${fields.phone.trim()}`, fields.addressLine.trim(), locality].join("\n")
}

export function CheckoutPage() {
  useDocumentTitle("Checkout | PanelScan")
  const { user } = useAuth()
  const { items, itemCount, isLoading, error: cartError, refreshCart } = useCart()
  const navigate = useNavigate()
  const [fields, setFields] = useState<CheckoutFields>({ recipientName: "", phone: "", addressLine: "", barangay: "", city: "", province: "", postalCode: "", notes: "" })
  const [errors, setErrors] = useState<CheckoutErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showCartAction, setShowCartAction] = useState(false)
  const submissionLock = useRef(false)

  useEffect(() => {
    if (!user) return
    setFields((current) => ({ ...current, recipientName: current.recipientName || `${user.firstName} ${user.lastName}`, phone: current.phone || user.phone || "" }))
  }, [user])

  const cartWarnings = useMemo(() => items.map((item) => getCartProductWarning(item.product, item.quantity)).filter((warning): warning is string => Boolean(warning)), [items])
  const canSubmit = items.length > 0 && !cartError && cartWarnings.length === 0

  function updateField(name: keyof CheckoutFields, value: string) {
    setFields((current) => ({ ...current, [name]: value }))
    setErrors((current) => ({ ...current, [name]: undefined, form: undefined }))
    setShowCartAction(false)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = validateCheckout(fields)
    const shippingAddress = buildShippingAddress(fields)
    if (shippingAddress.length > 500) nextErrors.form = "The combined delivery address is too long. Shorten the address details."
    if (!canSubmit) nextErrors.form = cartWarnings[0] ?? "Your cart is not ready for checkout. Return to the cart and try again."

    if (Object.values(nextErrors).some(Boolean)) {
      setErrors(nextErrors)
      setShowCartAction(!canSubmit)
      document.getElementById("checkout-error-summary")?.focus()
      return
    }

    if (submissionLock.current) return
    submissionLock.current = true
    setIsSubmitting(true)
    try {
      const order = await createOrder({ shippingAddress, notes: fields.notes.trim() || undefined })
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

  if (isLoading && !items.length) return <Container className="py-12 sm:py-16"><CartPageSkeleton /></Container>
  if (cartError && !items.length) return <Container className="py-16"><CartErrorState message={cartError} onRetry={() => void refreshCart()} /></Container>
  if (!items.length) return <Container className="py-16"><CartEmptyState /></Container>

  return (
    <Container className="py-10 sm:py-14 lg:py-18">
      <Button variant="ghost" asChild><Link to="/cart"><ArrowLeft data-icon="inline-start" aria-hidden="true" />Return to cart</Link></Button>
      <div className="mt-7 max-w-3xl"><p className="section-eyebrow">Secure order creation</p><h1 className="type-h1 mt-4">Delivery information</h1><p className="mt-4 text-base leading-7 text-muted-foreground">These fields are combined into the single shipping-address record supported by the backend. Your order is created before payment.</p></div>

      <ol className="mt-8 flex flex-wrap gap-2 text-xs font-semibold" aria-label="Checkout progress"><li className="bg-primary px-3 py-2 text-primary-foreground">1. Delivery</li><li className="rounded-md border border-border px-3 py-2 text-muted-foreground">2. Review</li><li className="rounded-md border border-border px-3 py-2 text-muted-foreground">3. Confirmation</li></ol>

      {!canSubmit && <div className="mt-7 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive"><p className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />{cartWarnings[0] ?? cartError ?? "Your cart is not ready for checkout."}</p><Button variant="outline" size="sm" asChild><Link to="/cart">Review cart</Link></Button></div>}

      <form className="mt-10 grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_23rem] lg:gap-14" onSubmit={handleSubmit} noValidate>
        <section className="surface-card p-5 sm:p-8" aria-labelledby="delivery-form-title">
          <div className="flex items-center gap-2"><MapPin className="size-4 text-primary" aria-hidden="true" /><h2 id="delivery-form-title" className="text-sm font-semibold tracking-[0.12em] uppercase">Recipient and address</h2></div>

          {errors.form && <div id="checkout-error-summary" role="alert" tabIndex={-1} className="mt-6 rounded-lg border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive outline-none"><p className="flex items-start gap-2 font-semibold"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />We couldn't place your order</p><p className="mt-1 pl-6 leading-6">{errors.form}</p>{showCartAction && <Button variant="outline" size="sm" className="mt-3 ml-6" asChild><Link to="/cart">Review cart</Link></Button>}</div>}

          <div className="mt-7 grid gap-6 sm:grid-cols-2">
            <CheckoutField label="Recipient full name" name="recipientName" value={fields.recipientName} error={errors.recipientName} autoComplete="name" onChange={updateField} />
            <CheckoutField label="Contact phone" name="phone" value={fields.phone} error={errors.phone} autoComplete="tel" inputMode="tel" onChange={updateField} />
            <CheckoutField className="sm:col-span-2" label="Street, building, or unit" name="addressLine" value={fields.addressLine} error={errors.addressLine} autoComplete="street-address" onChange={updateField} />
            <CheckoutField label="Barangay (optional)" name="barangay" value={fields.barangay} error={errors.barangay} autoComplete="address-level3" onChange={updateField} />
            <CheckoutField label="City or municipality" name="city" value={fields.city} error={errors.city} autoComplete="address-level2" onChange={updateField} />
            <CheckoutField label="Province" name="province" value={fields.province} error={errors.province} autoComplete="address-level1" onChange={updateField} />
            <CheckoutField label="Postal code (optional)" name="postalCode" value={fields.postalCode} error={errors.postalCode} autoComplete="postal-code" inputMode="numeric" onChange={updateField} />
          </div>

          <div className="mt-6 space-y-2">
            <Label htmlFor="notes">Order notes (optional)</Label>
            <Textarea id="notes" value={fields.notes} onChange={(event) => updateField("notes", event.target.value)} maxLength={1000} rows={5} aria-invalid={Boolean(errors.notes)} aria-describedby={errors.notes ? "notes-error" : "notes-help"} placeholder="Access instructions or helpful order notes" />
            <p id={errors.notes ? "notes-error" : "notes-help"} className={errors.notes ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{errors.notes ?? "Do not include payment details. Delivery scheduling will be coordinated after order creation."}</p>
          </div>
        </section>

        <CheckoutOrderSummary items={items} itemCount={itemCount} isSubmitting={isSubmitting} canSubmit={canSubmit} />
      </form>
    </Container>
  )
}

interface CheckoutFieldProps {
  label: string
  name: keyof CheckoutFields
  value: string
  error?: string
  autoComplete?: string
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]
  className?: string
  onChange: (name: keyof CheckoutFields, value: string) => void
}

function CheckoutField({ label, name, value, error, autoComplete, inputMode, className, onChange }: CheckoutFieldProps) {
  const errorId = `${name}-error`
  return <div className={className}><Label htmlFor={name}>{label}</Label><Input id={name} name={name} value={value} onChange={(event) => onChange(name, event.target.value)} autoComplete={autoComplete} inputMode={inputMode} aria-invalid={Boolean(error)} aria-describedby={error ? errorId : undefined} className="mt-2 h-11" />{error && <p id={errorId} className="motion-swap mt-1.5 text-xs text-destructive">{error}</p>}</div>
}
