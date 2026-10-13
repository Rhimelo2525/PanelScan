import { AlertCircle, RefreshCcw, Send } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { useAuth } from "@/auth/use-auth"
import { MessageContent } from "@/components/chat/message-content"
import { Container } from "@/components/layout/container"
import { useSupportConversation } from "@/hooks/use-support-conversation"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useDocumentTitle } from "@/hooks/use-document-title"
import { formatOrderDate } from "@/orders/order-format"
import { handleComposerKeyDown } from "@/lib/chat"
import { cn } from "@/lib/utils"

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
  const { conversationId, messages, isLoading, isLoadingThread, loadError, isSending, refresh, send } = useSupportConversation()
  const [draft, setDraft] = useState("")
  // The thread scrolls inside its panel; it follows new messages only while
  // the customer is already at the bottom, so reading older ones isn't interrupted.
  const threadRef = useRef<HTMLDivElement>(null)
  const wasAtBottomRef = useRef(true)

  useEffect(() => {
    const thread = threadRef.current
    if (thread && wasAtBottomRef.current) thread.scrollTop = thread.scrollHeight
  }, [messages])

  async function handleSend() {
    if (await send(draft)) {
      setDraft("")
      wasAtBottomRef.current = true
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
        <section className="mt-10 flex h-[calc(100dvh-12rem)] min-h-[28rem] max-h-[52rem] flex-col surface-card motion-swap" aria-label="Conversation">
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h2 className="truncate text-sm font-semibold">PanelScan Support</h2>
            {conversationId && (
              <Button variant="ghost" size="sm" onClick={refresh} disabled={isLoadingThread}>
                <RefreshCcw data-icon="inline-start" aria-hidden="true" />Refresh
              </Button>
            )}
          </div>

          <div ref={threadRef} onScroll={(event) => { const thread = event.currentTarget; wasAtBottomRef.current = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 80 }} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4" aria-live="polite">
            {isLoadingThread && messages.length === 0 ? <Skeleton className="h-32 w-full" /> : messages.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No messages yet. Send the first one below and the team will reply here.</p>
            ) : (
              messages.map((message) => {
                const isMine = message.senderId === user?.id
                const author = isMine ? "You" : message.sender ? `${message.sender.firstName} ${message.sender.lastName}` : message.senderId === null ? "PanelScan Support · Auto-reply" : "PanelScan team"
                return (
                  <article key={message.id} className={cn("motion-item max-w-[85%] rounded-lg border border-border px-3.5 py-2.5", isMine ? "ml-auto bg-secondary/70" : "bg-background")}>
                    <p className="text-xs text-muted-foreground">{author} · {formatOrderDate(message.createdAt)}</p>
                    <p className="mt-1.5 text-sm leading-6 whitespace-pre-wrap"><MessageContent content={message.content} projectLink={(code) => `/projects?code=${code}`} /></p>
                  </article>
                )
              })
            )}
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
