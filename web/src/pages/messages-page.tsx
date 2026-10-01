import { AlertCircle, RefreshCcw, Send } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { createConversation, getConversationMessages, getMyConversations, postMessage } from "@/api/support"
import { useAuth } from "@/auth/use-auth"
import { Container } from "@/components/layout/container"
import { useSilentPolling } from "@/hooks/use-silent-polling"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { formatOrderDate } from "@/orders/order-format"
import { handleComposerKeyDown, sortConversationsByActivity } from "@/lib/chat"
import { cn } from "@/lib/utils"
import type { ChatMessage } from "@/types/admin"

/**
 * Support messaging between the customer and the PanelScan team. Each
 * customer has one ongoing conversation, open as soon as they arrive here:
 * it is created with their first message (so the team's inbox never fills
 * with empty chats) and reused from then on. Replies come from a moderator in
 * the Admin inbox; the only automated message is a one-time "we'll reply
 * soon" when the team hasn't been in the conversation recently (backend).
 * There is no realtime transport, so the thread is refreshed on send, on a
 * quiet poll and on demand.
 */
export function MessagesPage() {
  useDocumentTitle("Messages | PanelScan")
  const { user } = useAuth()
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingThread, setIsLoadingThread] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [threadKey, setThreadKey] = useState(0)
  const threadEndRef = useRef<HTMLDivElement>(null)
  // Guards against a second send before the first finishes (e.g. Enter pressed twice quickly).
  const sendingRef = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    getMyConversations(controller.signal)
      .then((result) => setConversationId(sortConversationsByActivity(result)[0]?.id ?? null))
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        setLoadError("Your messages could not be loaded. Please try again.")
      })
      .finally(() => { if (!controller.signal.aborted) setIsLoading(false) })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    if (!conversationId) return
    const controller = new AbortController()
    setIsLoadingThread(true)
    getConversationMessages(conversationId, controller.signal)
      .then(setMessages)
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return
        toast.error("Messages could not be loaded")
      })
      .finally(() => { if (!controller.signal.aborted) setIsLoadingThread(false) })
    return () => controller.abort()
  }, [conversationId, threadKey])

  useEffect(() => { threadEndRef.current?.scrollIntoView({ block: "nearest" }) }, [messages])

  // A moderator's reply should appear without a manual refresh. Only a
  // successful response is applied - a transient failure leaves the thread
  // as it is, matching the manual "Refresh" button.
  useSilentPolling(
    useCallback(() => {
      if (!conversationId) return Promise.resolve()
      return getConversationMessages(conversationId).then(setMessages).catch(() => {})
    }, [conversationId]),
    conversationId ? 8_000 : false,
  )

  async function handleSend() {
    const content = draft.trim()
    if (content.length === 0 || sendingRef.current) return
    sendingRef.current = true
    setIsSending(true)
    try {
      // The first message opens the conversation (or finds the one already
      // open in another tab). The thread only starts loading once the message
      // is in, so the load never races the send.
      const id = conversationId ?? (await createConversation()).id
      await postMessage(id, content)
      setDraft("")
      if (conversationId) setThreadKey((value) => value + 1)
      else setConversationId(id)
    } catch {
      toast.error("Message not sent", { description: "Please try again in a moment." })
    } finally {
      sendingRef.current = false
      setIsSending(false)
    }
  }

  return (
    <Container className="py-12 lg:py-16">
      <header className="max-w-2xl">
        <p className="section-eyebrow">Support</p>
        <h1 className="type-h1 mt-4">Messages</h1>
        <p className="mt-4 text-base leading-7 text-muted-foreground">Ask about panel selection, quantities, delivery, or installation. Messages go to the Disenyo Interior Solution team and are answered by a person.</p>
      </header>

      {loadError ? (
        <div className="mt-10 rounded-lg border border-destructive/25 bg-destructive/5 p-8 text-center">
          <AlertCircle className="mx-auto size-6 text-destructive" aria-hidden="true" />
          <p className="mt-3 text-sm leading-6 text-muted-foreground">{loadError}</p>
        </div>
      ) : isLoading ? (
        <Skeleton className="mt-10 h-96 w-full" />
      ) : (
        <section className="mt-10 flex min-h-[30rem] flex-col surface-card motion-swap" aria-label="Conversation">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h2 className="truncate text-sm font-semibold">PanelScan Support</h2>
            {conversationId && (
              <Button variant="ghost" size="sm" onClick={() => setThreadKey((value) => value + 1)} disabled={isLoadingThread}>
                <RefreshCcw data-icon="inline-start" aria-hidden="true" />Refresh
              </Button>
            )}
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
            {isLoadingThread && messages.length === 0 ? <Skeleton className="h-32 w-full" /> : messages.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No messages yet. Send the first one below and the team will reply here.</p>
            ) : (
              messages.map((message) => {
                const isMine = message.senderId === user?.id
                const author = isMine ? "You" : message.sender ? `${message.sender.firstName} ${message.sender.lastName}` : message.senderId === null ? "PanelScan Support · Auto-reply" : "PanelScan team"
                return (
                  <article key={message.id} className={cn("motion-item max-w-[85%] rounded-lg border border-border px-3.5 py-2.5", isMine ? "ml-auto bg-secondary/70" : "bg-background")}>
                    <p className="text-xs text-muted-foreground">{author} · {formatOrderDate(message.createdAt)}</p>
                    <p className="mt-1.5 text-sm leading-6 whitespace-pre-wrap">{message.content}</p>
                  </article>
                )
              })
            )}
            <div ref={threadEndRef} />
          </div>

          <div className="border-t border-border p-3">
            <Label htmlFor="message-draft" className="sr-only">Message</Label>
            <Textarea id="message-draft" rows={3} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => handleComposerKeyDown(event, () => void handleSend())} placeholder="Type your message" maxLength={2000} />
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">Replies arrive from the PanelScan team. Refresh to check for new messages.</p>
              <Button size="sm" onClick={() => void handleSend()} disabled={isSending || draft.trim().length === 0}>
                <Send data-icon="inline-start" aria-hidden="true" />Send
              </Button>
            </div>
          </div>
        </section>
      )}
    </Container>
  )
}
