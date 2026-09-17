import { AlertCircle, ArrowLeft, MessageSquarePlus, RefreshCcw, Send } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { createConversation, getConversationMessages, getMyConversations, postMessage } from "@/api/support"
import { useAuth } from "@/auth/use-auth"
import { Container } from "@/components/layout/container"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { formatOrderDate } from "@/orders/order-format"
import { cn } from "@/lib/utils"
import type { ChatConversation, ChatMessage } from "@/types/admin"

/**
 * Human support messaging between the customer and the PanelScan team. There is
 * no bot: every reply comes from a moderator working the same conversation in
 * the Admin inbox. The backend exposes no realtime transport, so the thread is
 * refreshed on send and on demand rather than pretending to stream.
 */
export function MessagesPage() {
  useDocumentTitle("Messages | PanelScan")
  const { user } = useAuth()
  const [conversations, setConversations] = useState<ChatConversation[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoadingList, setIsLoadingList] = useState(true)
  const [isLoadingThread, setIsLoadingThread] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [subject, setSubject] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [threadKey, setThreadKey] = useState(0)
  const threadEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    getMyConversations(controller.signal)
      .then((result) => {
        const sorted = [...result].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        setConversations(sorted)
        setActiveId((current) => current ?? sorted[0]?.id ?? null)
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        setListError("Your conversations could not be loaded. Please try again.")
      })
      .finally(() => { if (!controller.signal.aborted) setIsLoadingList(false) })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!activeId) return
    const controller = new AbortController()
    setIsLoadingThread(true)
    getConversationMessages(activeId, controller.signal)
      .then(setMessages)
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        toast.error("Messages could not be loaded")
      })
      .finally(() => { if (!controller.signal.aborted) setIsLoadingThread(false) })
    return () => controller.abort()
  }, [activeId, threadKey])

  useEffect(() => { threadEndRef.current?.scrollIntoView({ block: "nearest" }) }, [messages])

  async function handleStart() {
    setIsStarting(true)
    try {
      const conversation = await createConversation(subject.trim() || undefined)
      setConversations((current) => [...current, conversation])
      setActiveId(conversation.id)
      setMessages([])
      setSubject("")
      toast.success("Conversation started. Send your first message below.")
    } catch {
      toast.error("Conversation could not be started", { description: "Please try again in a moment." })
    } finally {
      setIsStarting(false)
    }
  }

  async function handleSend() {
    if (!activeId || draft.trim().length === 0) return
    setIsSending(true)
    try {
      await postMessage(activeId, draft.trim())
      setDraft("")
      setThreadKey((value) => value + 1)
    } catch {
      toast.error("Message not sent", { description: "Please try again in a moment." })
    } finally {
      setIsSending(false)
    }
  }

  const hasConversations = conversations.length > 0

  return (
    <Container className="py-12 lg:py-16">
      <header className="max-w-2xl">
        <p className="section-eyebrow">Support</p>
        <h1 className="type-h1 mt-4">Messages</h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">Ask about panel selection, quantities, delivery, or installation. Messages go to the Disenyo Interior Solution team and are answered by a person.</p>
      </header>

      {listError ? (
        <div className="mt-10 rounded-lg border border-destructive/25 bg-destructive/5 p-8 text-center">
          <AlertCircle className="mx-auto size-6 text-destructive" aria-hidden="true" />
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{listError}</p>
        </div>
      ) : isLoadingList ? (
        <div className="mt-10 grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]"><Skeleton className="h-72 w-full" /><Skeleton className="h-96 w-full" /></div>
      ) : (
        <div className="mt-10 grid items-start gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
          {/* One pane at a time below lg: the list, then the selected thread.
              Both panes are always rendered from lg upwards. */}
          <aside className={cn("space-y-4 motion-in-left lg:animate-none", activeId && "hidden lg:block")}>
            <section className="surface-card p-5" aria-labelledby="new-conversation-title">
              <h2 id="new-conversation-title" className="text-sm font-semibold">Start a conversation</h2>
              <div className="mt-3 space-y-2">
                <Label htmlFor="conversation-subject" className="text-xs">Subject (optional)</Label>
                <Input id="conversation-subject" value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Ceiling panels for a 3 × 4 m room" maxLength={150} />
              </div>
              <Button className="mt-3 w-full" onClick={() => void handleStart()} disabled={isStarting}>
                <MessageSquarePlus data-icon="inline-start" aria-hidden="true" />New conversation
              </Button>
            </section>

            {hasConversations && (
              <nav className="surface-card p-2" aria-label="Your conversations">
                <ul className="space-y-1">
                  {conversations.map((conversation) => (
                    <li key={conversation.id}>
                      <button
                        type="button"
                        onClick={() => setActiveId(conversation.id)}
                        aria-current={conversation.id === activeId ? "true" : undefined}
                        className={cn("w-full rounded-md px-3 py-2.5 text-left transition-colors duration-(--motion-fast) ease-(--ease-standard) hover:bg-secondary/70", conversation.id === activeId && "bg-secondary")}
                      >
                        <span className="block truncate text-sm font-medium">{conversation.subject ?? "Support conversation"}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{formatOrderDate(conversation.updatedAt)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </aside>

          <section key={activeId ?? "empty"} className={cn("min-h-[30rem] flex-col surface-card motion-in-right lg:motion-swap lg:flex", activeId || !hasConversations ? "flex" : "hidden lg:flex")} aria-label="Conversation">
            {!activeId ? (
              <div className="flex flex-1 items-center justify-center p-10 text-center">
                <div className="max-w-sm">
                  <h2 className="text-lg font-semibold">No conversations yet</h2>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">Start a conversation and the team will reply here. You will also see replies to any enquiry you started earlier.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <Button variant="ghost" size="sm" className="-ml-2 lg:hidden" onClick={() => setActiveId(null)}>
                      <ArrowLeft data-icon="inline-start" aria-hidden="true" />Conversations
                    </Button>
                    <h2 className="truncate text-sm font-semibold">{conversations.find((conversation) => conversation.id === activeId)?.subject ?? "Support conversation"}</h2>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setThreadKey((value) => value + 1)} disabled={isLoadingThread}>
                    <RefreshCcw data-icon="inline-start" aria-hidden="true" />Refresh
                  </Button>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
                  {isLoadingThread && messages.length === 0 ? <Skeleton className="h-32 w-full" /> : messages.length === 0 ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">No messages yet. Send the first one below.</p>
                  ) : (
                    messages.map((message) => {
                      const isMine = message.senderId === user?.id
                      return (
                        <article key={message.id} className={cn("motion-item max-w-[85%] rounded-lg border border-border px-3.5 py-2.5", isMine ? "ml-auto bg-secondary/70" : "bg-background")}>
                          <p className="text-xs text-muted-foreground">{isMine ? "You" : message.sender ? `${message.sender.firstName} ${message.sender.lastName}` : "PanelScan team"} · {formatOrderDate(message.createdAt)}</p>
                          <p className="mt-1.5 text-sm leading-6 whitespace-pre-wrap">{message.content}</p>
                        </article>
                      )
                    })
                  )}
                  <div ref={threadEndRef} />
                </div>

                <div className="border-t border-border p-3">
                  <Label htmlFor="message-draft" className="sr-only">Message</Label>
                  <Textarea id="message-draft" rows={3} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Type your message" maxLength={2000} />
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">Replies arrive from the PanelScan team. Refresh to check for new messages.</p>
                    <Button size="sm" onClick={() => void handleSend()} disabled={isSending || draft.trim().length === 0}>
                      <Send data-icon="inline-start" aria-hidden="true" />Send
                    </Button>
                  </div>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </Container>
  )
}
