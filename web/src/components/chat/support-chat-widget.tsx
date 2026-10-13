import { Maximize2, Send, X } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"

import { useAuth } from "@/auth/use-auth"
import { MessageContent } from "@/components/chat/message-content"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useSupportConversation } from "@/hooks/use-support-conversation"
import { handleComposerKeyDown } from "@/lib/chat"
import { cn } from "@/lib/utils"
import { formatOrderDate } from "@/orders/order-format"

/**
 * A small support chat in the corner of the page, opened from "Chat with
 * Support". It is the same conversation as the Messages page, which the
 * expand button opens for the full view.
 */
export function SupportChatWidget({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { messages, isLoading, isLoadingThread, loadError, isSending, send } = useSupportConversation()
  const [draft, setDraft] = useState("")
  const threadRef = useRef<HTMLDivElement>(null)
  const wasAtBottomRef = useRef(true)
  const draftRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { draftRef.current?.focus() }, [])

  useEffect(() => {
    const thread = threadRef.current
    if (thread && wasAtBottomRef.current) thread.scrollTop = thread.scrollHeight
  }, [messages])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  async function handleSend() {
    if (await send(draft)) {
      setDraft("")
      wasAtBottomRef.current = true
    }
  }

  function expand() {
    onClose()
    navigate("/messages")
  }

  return (
    <section
      className="motion-swap fixed right-4 bottom-4 z-50 flex h-[min(34rem,calc(100dvh-6rem))] w-[min(23rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl"
      aria-label="Support chat"
    >
      <header className="flex items-center justify-between gap-2 border-b border-border bg-secondary/40 px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold">PanelScan Support</h2>
          <p className="text-xs text-muted-foreground">Answered by the Disenyo Interior Solution team</p>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button variant="ghost" size="icon" className="size-8" onClick={expand} aria-label="Open in Messages" title="Open in Messages">
            <Maximize2 className="size-4" aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="icon" className="size-8" onClick={onClose} aria-label="Close chat" title="Close">
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      </header>

      <div
        ref={threadRef}
        onScroll={(event) => { const thread = event.currentTarget; wasAtBottomRef.current = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 60 }}
        className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain p-3"
        aria-live="polite"
      >
        {loadError ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{loadError}</p>
        ) : isLoading || (isLoadingThread && messages.length === 0) ? (
          <div className="space-y-2.5"><Skeleton className="h-14 w-3/4" /><Skeleton className="ml-auto h-10 w-2/3" /></div>
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-sm leading-6 text-muted-foreground">Ask about panels, quantities, delivery, or installation. A person from the team will reply here.</p>
        ) : (
          messages.map((message) => {
            const isMine = message.senderId === user?.id
            const author = isMine ? "You" : message.sender ? `${message.sender.firstName} ${message.sender.lastName}` : message.senderId === null ? "Auto-reply" : "PanelScan team"
            return (
              <article key={message.id} className={cn("max-w-[88%] rounded-lg border border-border px-3 py-2", isMine ? "ml-auto bg-secondary/70" : "bg-background")}>
                <p className="text-[0.68rem] text-muted-foreground">{author} · {formatOrderDate(message.createdAt)}</p>
                <p className="mt-1 text-sm leading-5 break-words whitespace-pre-wrap"><MessageContent content={message.content} projectLink={(code) => `/projects?code=${code}`} /></p>
              </article>
            )
          })
        )}
      </div>

      <div className="flex items-end gap-2 border-t border-border p-2.5">
        <label htmlFor="support-chat-draft" className="sr-only">Message</label>
        <Textarea
          ref={draftRef}
          id="support-chat-draft"
          rows={1}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => handleComposerKeyDown(event, () => void handleSend())}
          placeholder="Type your message"
          maxLength={2000}
          className="max-h-28 min-h-10 resize-none text-sm"
        />
        <Button size="icon" className="size-10 shrink-0" onClick={() => void handleSend()} disabled={isSending || draft.trim().length === 0} aria-label="Send message">
          <Send className="size-4" aria-hidden="true" />
        </Button>
      </div>
    </section>
  )
}
