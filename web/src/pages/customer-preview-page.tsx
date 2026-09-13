import { ArrowLeft, LockKeyhole, PackageCheck, Star } from "lucide-react"
import { useRef, useState } from "react"
import type { FormEvent } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"

import { StatusBadge } from "@/components/admin/status-badge"
import { Container } from "@/components/layout/container"
import { RatingStars } from "@/components/products/product-ratings"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { customerPreviewOrders } from "@/data/customer-order-preview"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { calculateLineTotal, formatMinorUnits, formatProductPrice } from "@/lib/format-price"
import { isDelivered } from "@/preview/rating-policy"
import { submitPreviewRating, usePreviewRatings } from "@/preview/rating-store"

export function CustomerPreviewPage() {
  useDocumentTitle("Customer order preview | PanelScan")
  const ratings = usePreviewRatings()
  const [selected, setSelected] = useState<{ orderId: string; productId: string; name: string } | null>(null)
  const [stars, setStars] = useState(0)
  const [feedback, setFeedback] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState("ALL")
  const headingRef = useRef<HTMLHeadingElement>(null)

  function closeRating() { setSelected(null); setStars(0); setFeedback(""); setError(null) }
  function submit(event: FormEvent) {
    event.preventDefault()
    if (!selected) return
    const problem = submitPreviewRating({ orderId: selected.orderId, productId: selected.productId, stars, feedback })
    setError(problem)
    if (problem) return
    closeRating()
    toast.success("Thank you for your rating", { description: "Your preview rating is now visible with this product until reload." })
  }

  const visible = customerPreviewOrders.filter((order) => filter === "ALL" || (filter === "DELIVERED" ? isDelivered(order.status) : !isDelivered(order.status)))
  return <Container className="py-10 sm:py-14">
    <Button variant="ghost" asChild><Link to="/"><ArrowLeft aria-hidden="true" />Back to storefront</Link></Button>
    <Button variant="outline" asChild><Link to="/support-preview">Chat with Support</Link></Button>
    <div className="mt-7 flex flex-wrap items-end justify-between gap-5"><div><p className="section-eyebrow">Customer preview</p><h1 ref={headingRef} tabIndex={-1} className="type-h1 mt-3">Your orders, at a glance.</h1><p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">Follow your materials from preparation to delivery. Once an order is delivered, share how the product worked for you.</p></div><Button variant="outline" asChild><Link to="/projects-preview">Your project results</Link></Button></div>
    <div className="mt-7 rounded-lg border border-border bg-secondary/40 p-4 text-sm leading-6"><p className="font-semibold">Fictional customer orders · Session preview</p><p className="mt-1 text-muted-foreground">This is not an account or a live shipment. Ratings and feedback stay in memory, are never sent to a server, and clear on reload. Avoid entering personal information.</p></div>
    <div className="my-6 max-w-xs"><Label htmlFor="customer-order-filter">Show orders</Label><select id="customer-order-filter" value={filter} onChange={(event) => setFilter(event.target.value)} className="mt-2 h-11 w-full rounded-md border border-input bg-card px-3 text-sm"><option value="ALL">All orders</option><option value="DELIVERED">Delivered / completed</option><option value="IN_PROGRESS">Awaiting delivery</option></select></div>
    <div className="space-y-5">{visible.map((order) => <article key={order.id} className="surface-card overflow-hidden" aria-label={`Order ${order.orderNumber}`}>
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-secondary/35 p-5"><div><h2 className="font-semibold">{order.orderNumber}</h2><p className="mt-1 text-xs text-muted-foreground">Sample order · {order.date}</p></div><StatusBadge status={order.status} /></header>
      <div className="divide-y divide-border px-5">{order.items.map((item) => {
        const rating = ratings.find((entry) => entry.orderId === order.id && entry.productId === item.productId)
        return <div key={item.productId} className="grid gap-5 py-5 sm:grid-cols-[minmax(0,1fr)_auto]"><div className="min-w-0"><Link className="font-medium underline-offset-4 hover:underline" to={`/products/${item.productId}`}>{item.name}</Link><p className="mt-2 text-sm text-muted-foreground">{item.quantity} pieces × {formatProductPrice(item.price)}</p><p className="mt-2 font-semibold tabular-nums">{formatMinorUnits(calculateLineTotal(item.price, item.quantity) ?? 0)}</p></div><div className="min-w-0 sm:max-w-xs sm:text-right">{rating ? <div role="status"><p className="mb-2 text-sm font-medium">Your submitted rating</p><RatingStars value={rating.stars} />{rating.feedback && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">{rating.feedback}</p>}<p className="mt-2 text-xs text-muted-foreground">One rating per product per order · Preview only</p></div> : isDelivered(order.status) ? <div><p className="mb-3 flex items-center gap-2 text-xs text-muted-foreground sm:justify-end"><PackageCheck className="size-4" aria-hidden="true" />Delivered — ready for your feedback</p><Button variant="outline" onClick={() => { setStars(0); setFeedback(""); setError(null); setSelected({ orderId: order.id, productId: item.productId, name: item.name }) }}><Star aria-hidden="true" />Rate this product</Button></div> : <p className="flex items-start gap-2 text-xs leading-6 text-muted-foreground"><LockKeyhole className="mt-1 size-4 shrink-0" aria-hidden="true" />Rating unlocks after delivery is complete.</p>}</div></div>
      })}</div>
    </article>)}</div>
    <Sheet open={Boolean(selected)} onOpenChange={(open) => { if (!open) closeRating() }}><SheetContent className="w-[calc(100vw-1rem)]! max-w-none! overflow-y-auto sm:max-w-lg!" onCloseAutoFocus={(event) => { event.preventDefault(); headingRef.current?.focus() }}><SheetHeader className="pr-12"><SheetTitle>Rate this product</SheetTitle><SheetDescription>{selected?.name} · Delivered purchase preview</SheetDescription></SheetHeader><form className="space-y-6 px-4 pb-6" onSubmit={submit}>
      <fieldset><legend className="text-sm font-medium">Your rating</legend><div className="mt-3 flex flex-wrap gap-2">{[1, 2, 3, 4, 5].map((value) => <label key={value} className="relative cursor-pointer"><input type="radio" name="product-stars" value={value} checked={stars === value} onChange={() => { setStars(value); setError(null) }} className="peer sr-only" aria-label={`${value} ${value === 1 ? "star" : "stars"}`} /><span className="flex size-11 items-center justify-center rounded-md border border-border bg-card text-primary transition-colors hover:bg-secondary peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 peer-checked:border-primary"><Star className="size-6" fill={value <= stars ? "currentColor" : "none"} aria-hidden="true" /></span></label>)}</div><p className="mt-3 text-sm text-muted-foreground" aria-live="polite">{stars ? `${stars} out of 5 stars selected` : "Choose 1–5 stars."}</p></fieldset>
      <div><Label htmlFor="rating-feedback">Feedback <span className="font-normal text-muted-foreground">(optional)</span></Label><Textarea id="rating-feedback" value={feedback} onChange={(event) => setFeedback(event.target.value)} maxLength={500} className="mt-2 min-h-28" placeholder="How did the panels work in your space?" /><p className="mt-2 text-xs text-muted-foreground">{feedback.length}/500 · Do not include personal details.</p></div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <p className="rounded-lg border border-border bg-secondary/40 p-4 text-xs leading-6 text-muted-foreground">One rating per purchased product and order. Your submission is final for this preview and will appear on the product page. Reloading clears it.</p>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="outline" type="button" onClick={closeRating}>Cancel</Button><Button type="submit">Submit rating</Button></div>
    </form></SheetContent></Sheet>
  </Container>
}
