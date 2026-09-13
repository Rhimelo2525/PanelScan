import { ArrowLeft, ShieldCheck, Send } from "lucide-react"
import { useState } from "react"
import type { FormEvent } from "react"
import { Link } from "react-router-dom"
import { toast } from "sonner"

import { StatusBadge } from "@/components/admin/status-badge"
import { Container } from "@/components/layout/container"
import { ConversationThread } from "@/components/support/conversation-thread"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { getCustomerPreviewConversationId, sendPreviewSupportMessage, usePreviewConversations } from "@/preview/support-store"

export function SupportPreviewPage() {
  useDocumentTitle("Customer support preview | PanelScan")
  const conversations = usePreviewConversations()
  const conversation = conversations.find((item) => item.id === getCustomerPreviewConversationId())
  const [message, setMessage] = useState("")
  const [error, setError] = useState<string | null>(null)

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!conversation) return
    const problem = sendPreviewSupportMessage("CUSTOMER", conversation.id, message)
    setError(problem)
    if (problem) return
    setMessage("")
    toast.success("Message sent", { description: "It is now visible to the Moderator preview." })
  }

  return <Container className="py-10 sm:py-14">
    <div className="flex flex-wrap items-center justify-between gap-3"><Button variant="ghost" asChild><Link to="/customer-preview"><ArrowLeft aria-hidden="true" />Back to customer preview</Link></Button><Button variant="outline" size="sm" asChild><Link to="/moderator-preview?view=support"><ShieldCheck aria-hidden="true" />Moderator support view</Link></Button></div>
    <header className="mt-7"><p className="section-eyebrow">Customer care</p><h1 className="type-h1 mt-3">Chat with Support</h1><p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">Ask a question about a fictional order or product. Messages stay in this browser session and are never sent to a server.</p></header>
    <div className="mt-7 rounded-lg border border-border bg-secondary/40 p-4 text-sm"><p className="font-semibold">Frontend preview · Fictional conversation</p><p className="mt-1 text-muted-foreground">Avoid entering personal information. Reloading clears session changes.</p></div>
    {conversation ? <section className="mt-6 min-w-0 overflow-hidden surface-card" aria-labelledby="customer-support-thread-title"><header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-5"><div className="min-w-0"><h2 id="customer-support-thread-title" className="font-semibold">PanelScan Support</h2><p className="mt-1 text-xs text-muted-foreground">Moderator support preview</p></div><StatusBadge status={conversation.status} /></header><ConversationThread conversation={conversation} viewer="CUSTOMER" /><form className="border-t border-border p-5 sm:p-6" onSubmit={submit}><Label htmlFor="customer-support-message">Your message</Label><Textarea id="customer-support-message" value={message} onChange={(event) => { setMessage(event.target.value); setError(null) }} maxLength={1000} className="mt-2 min-h-28" placeholder="How can we help?" /><div className="mt-2 flex justify-between gap-4 text-xs text-muted-foreground"><span>Do not include private details.</span><span>{message.length}/1000</span></div>{error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}<div className="mt-4 flex justify-end"><Button type="submit"><Send aria-hidden="true" />Send message</Button></div></form></section> : <p className="mt-6 rounded-lg border border-border p-5 text-sm text-muted-foreground">The preview conversation is unavailable.</p>}
  </Container>
}
