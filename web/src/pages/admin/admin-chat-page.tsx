import { MessageSquare, Send } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { getConversations, getMessages, sendMessage } from "@/api/admin"
import { formatDateTime } from "@/admin/admin-format"
import { getAdminErrorMessage, useAdminResource } from "@/admin/use-admin-resource"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { EmptyState, ErrorState } from "@/components/admin/empty-state"
import { useAuth } from "@/auth/use-auth"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"
import { useDocumentTitle } from "@/hooks/use-document-title"
import type { ChatConversation } from "@/types/admin"

/**
 * Support inbox. Moderators can reply; the owner is read-only on chat by
 * backend rule, so the composer is not rendered for an owner rather than
 * failing on submit.
 */
export function AdminChatPage() {
  useDocumentTitle("Support chat | PanelScan Admin")
  const { user } = useAuth()
  const canReply = user?.role === "MODERATOR"
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState("")
  const [isSending, setIsSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const conversations = useAdminResource((signal) => getConversations({ limit: 30 }, signal), [])
  const rooms = conversations.data?.conversations ?? []
  const activeId = selectedId ?? rooms[0]?.id ?? null
  const messages = useAdminResource(async (signal) => (activeId ? (await getMessages(activeId, { limit: 50 }, signal)).messages : []), [activeId])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ block: "nearest" }) }, [messages.data])

  async function submit() {
    if (!activeId || draft.trim().length === 0) return
    setIsSending(true)
    try {
      await sendMessage(activeId, draft.trim())
      setDraft("")
      messages.reload()
      conversations.reload()
    } catch (error) {
      toast.error("Message not sent", { description: getAdminErrorMessage(error) })
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Customer support"
        title="Conversations"
        description={canReply ? "Customer enquiries raised from the storefront. Replies are sent as your moderator account." : "Customer enquiries raised from the storefront. The owner account has read-only access to chat."}
      />

      {conversations.error ? <ErrorState message={conversations.error} onRetry={conversations.reload} /> : conversations.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : rooms.length === 0 ? (
        <EmptyState icon={MessageSquare} title="No conversations yet" description="Customer support conversations started from the storefront appear here." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <ul className="max-h-[28rem] space-y-1 overflow-y-auto surface-card p-2" aria-label="Conversations">
            {rooms.map((room) => (
              <li key={room.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(room.id)}
                  aria-current={room.id === activeId ? "true" : undefined}
                  className={cn("w-full rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-secondary", room.id === activeId && "bg-secondary font-medium")}
                >
                  <span className="block truncate">{room.subject ?? "Customer enquiry"}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{participantSummary(room)}</span>
                </button>
              </li>
            ))}
          </ul>

          <section className="flex min-h-[28rem] flex-col surface-card" aria-label="Conversation messages">
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {messages.isLoading ? <Skeleton className="h-40 w-full" /> : messages.error ? <ErrorState message={messages.error} onRetry={messages.reload} /> : (messages.data ?? []).length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No messages in this conversation yet.</p>
              ) : (
                (messages.data ?? []).map((message) => {
                  const isMine = message.senderId === user?.id
                  return (
                    <div key={message.id} className={cn("max-w-[85%] rounded-lg border border-border px-3 py-2 text-sm", isMine ? "ml-auto bg-secondary" : "bg-background")}>
                      <p className="text-xs text-muted-foreground">{message.sender ? `${message.sender.firstName} ${message.sender.lastName}` : "Unknown"} · {formatDateTime(message.createdAt)}</p>
                      <p className="mt-1 leading-6 whitespace-pre-wrap">{message.content}</p>
                    </div>
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {canReply ? (
              <div className="border-t border-border p-3">
                <label htmlFor="chat-draft" className="sr-only">Message</label>
                <Textarea id="chat-draft" rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Write a reply" maxLength={2000} />
                <div className="mt-2 flex justify-end">
                  <Button size="sm" onClick={() => void submit()} disabled={isSending || draft.trim().length === 0}><Send data-icon="inline-start" aria-hidden="true" />Send reply</Button>
                </div>
              </div>
            ) : (
              <p className="border-t border-border p-3 text-xs text-muted-foreground">Owner accounts can read conversations but cannot post replies.</p>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function participantSummary(room: ChatConversation): string {
  const customer = room.participants?.find((participant) => participant.user.role === "CUSTOMER")
  return customer ? `${customer.user.firstName} ${customer.user.lastName}` : `${room.participants?.length ?? 0} participants`
}
