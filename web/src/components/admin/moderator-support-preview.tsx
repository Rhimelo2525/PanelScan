import { ArrowLeft, ExternalLink, MessageSquare, Send, Star } from "lucide-react"
import { useMemo, useState } from "react"
import type { FormEvent } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"

import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { StatusBadge } from "@/components/admin/status-badge"
import { RatingStars } from "@/components/products/product-ratings"
import { ConversationThread } from "@/components/support/conversation-thread"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { customerPreviewOrders } from "@/data/customer-order-preview"
import { usePreviewRatings } from "@/preview/rating-store"
import { sendPreviewSupportMessage, updatePreviewConversationStatus, usePreviewConversations } from "@/preview/support-store"

const time = new Intl.DateTimeFormat("en-PH", { hour: "numeric", minute: "2-digit" })
const submittedDate = new Intl.DateTimeFormat("en-PH", { year: "numeric", month: "short", day: "numeric" })

export function ModeratorSupportPreview() {
  const conversations = usePreviewConversations()
  const ratings = usePreviewRatings()
  const [selectedId, setSelectedId] = useState(conversations[0]?.id ?? "")
  const [showThread, setShowThread] = useState(false)
  const [reply, setReply] = useState("")
  const [error, setError] = useState<string | null>(null)
  const selected = conversations.find((item) => item.id === selectedId) ?? conversations[0]
  const reviews = useMemo(() => ratings.map((rating) => {
    const order = customerPreviewOrders.find((item) => item.id === rating.orderId)
    const product = order?.items.find((item) => item.productId === rating.productId)
    return { ...rating, productName: product?.name ?? "Preview product" }
  }), [ratings])

  function submitReply(event: FormEvent) {
    event.preventDefault()
    if (!selected) return
    const problem = sendPreviewSupportMessage("MODERATOR", selected.id, reply)
    setError(problem)
    if (problem) return
    setReply("")
    toast.success("Reply sent to customer", { description: "The customer can see it in this preview session." })
  }

  return <>
    <AdminPageHeader eyebrow="Customer care" title="Support & Feedback" description="Reply to fictional customer conversations and review verified post-delivery product feedback." actions={<><Button variant="outline" size="sm" asChild><Link to="/support-preview"><ExternalLink aria-hidden="true" />Customer chat view</Link></Button><span className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground">Moderator only · Session preview</span></>} />
    <div className="mt-6 grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
      <section className={showThread ? "hidden xl:block" : undefined} aria-labelledby="conversation-list-title"><h2 id="conversation-list-title" className="text-sm font-semibold">Conversations</h2><div className="mt-3 space-y-2">{conversations.map((conversation) => { const last = conversation.messages.at(-1); return <button key={conversation.id} type="button" onClick={() => { setSelectedId(conversation.id); setError(null); setShowThread(true) }} className="w-full rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-secondary/50 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none" aria-pressed={selected?.id === conversation.id}><div className="flex items-start justify-between gap-2"><span className="text-sm font-semibold">{conversation.customerLabel}</span><StatusBadge status={conversation.status} /></div><div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground"><span className="min-w-0 truncate">{last?.body ?? "No messages"}</span>{last && <time className="shrink-0" dateTime={last.sentAt}>{time.format(new Date(last.sentAt))}</time>}</div></button> })}</div></section>
      {selected && <section className={`${showThread ? "block" : "hidden"} surface-card overflow-hidden xl:block`} aria-labelledby="selected-conversation-title"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5"><div className="flex items-center gap-2"><Button type="button" variant="ghost" size="icon-sm" className="xl:hidden" onClick={() => setShowThread(false)} aria-label="Back to conversations"><ArrowLeft aria-hidden="true" /></Button><div><h2 id="selected-conversation-title" className="font-semibold">{selected.customerLabel}</h2><p className="mt-1 text-xs text-muted-foreground">{selected.subject}</p></div></div><select aria-label="Conversation status" value={selected.status} onChange={(event) => { const problem = updatePreviewConversationStatus("MODERATOR", selected.id, event.target.value as typeof selected.status); if (problem) toast.error(problem) }} className="h-9 rounded-md border border-input bg-card px-3 text-xs"><option value="OPEN">Open</option><option value="AWAITING_CUSTOMER">Awaiting customer</option><option value="RESOLVED">Resolved</option></select></header><div className="max-h-[28rem] overflow-y-auto p-5"><ConversationThread conversation={selected} viewer="MODERATOR" /></div><form className="border-t border-border p-5" onSubmit={submitReply}><Label htmlFor="moderator-support-reply">Reply</Label><Textarea id="moderator-support-reply" value={reply} onChange={(event) => { setReply(event.target.value); setError(null) }} maxLength={1000} className="mt-2 min-h-24" placeholder="Write a helpful response…" />{error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}<div className="mt-3 flex justify-end"><Button type="submit"><Send aria-hidden="true" />Send reply</Button></div></form></section>}
    </div>
    <section className="mt-8" aria-labelledby="customer-reviews-title"><div className="flex items-center gap-2"><Star className="size-4 text-primary" aria-hidden="true" /><h2 id="customer-reviews-title" className="text-lg font-semibold">Customer reviews</h2></div><p className="mt-1 text-sm text-muted-foreground">Ratings submitted from delivered or completed fictional orders.</p>{reviews.length ? <ul className="mt-4 divide-y divide-border rounded-lg border border-border bg-card px-5">{reviews.map((review) => <li key={`${review.orderId}:${review.productId}`} className="py-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium">{review.productName}</p><p className="mt-1 text-xs text-muted-foreground">Sample Customer · Order {review.orderId}</p>{review.submittedAt && <p className="mt-1 text-xs text-muted-foreground">Submitted {submittedDate.format(new Date(review.submittedAt))}</p>}</div><RatingStars value={review.stars} /></div>{review.feedback && <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground [overflow-wrap:anywhere]">{review.feedback}</p>}<p className="mt-2 text-xs text-muted-foreground">Verified delivered purchase · Preview only</p></li>)}</ul> : <div className="mt-4 rounded-lg border border-dashed border-border p-8 text-center"><MessageSquare className="mx-auto size-5 text-muted-foreground" aria-hidden="true" /><p className="mt-3 text-sm font-medium">No customer reviews yet</p><p className="mt-1 text-xs text-muted-foreground">A submitted delivered-order rating will appear here immediately.</p></div>}</section>
  </>
}
