import { MessageSquare, Send } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { getConversations, getMessages, sendMessage } from "@/api/admin"
import { formatDateTime } from "@/admin/admin-format"
import { getAdminErrorMessage, useAdminResource } from "@/admin/use-admin-resource"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { EmptyState, ErrorState } from "@/components/admin/empty-state"
import { useAuth } from "@/auth/use-auth"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { CHAT_READ_EVENT, formatChatAge, handleComposerKeyDown, latestMessagePreview, sortConversationsByActivity } from "@/lib/chat"
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
  // Guards against a second send before the first finishes (e.g. Enter pressed twice quickly).
  const sendingRef = useRef(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const conversations = useAdminResource((signal) => getConversations({ limit: 30 }, signal), [], { pollIntervalMs: 20_000 })
  // Conversation LIST only: latest activity at the top. The thread below keeps its own oldest-to-newest order.
  const rooms = sortConversationsByActivity(conversations.data?.conversations ?? [])
  // Nothing is opened automatically: opening a conversation marks it read, so
  // that only happens when a staff member actually selects it.
  const activeId = selectedId
  const activeRoomUnread = rooms.find((room) => room.id === activeId)?.unreadCount ?? 0
  const messages = useAdminResource(async (signal) => {
    if (!activeId) return []
    const result = await getMessages(activeId, { limit: 50 }, signal)
    // The backend returns newest-first (so a limited page always holds the
    // most recent messages). Reverse here so the thread renders
    // oldest-to-newest, newest at the bottom, like a normal chat.
    return [...result.messages].reverse()
  }, [activeId], { pollIntervalMs: 8_000 })

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ block: "nearest" }) }, [messages.data])

  // Loading the open conversation's messages marks them read on the server.
  // Once that has happened, refresh the list (its dot) and the sidebar's
  // "Support chat" dot, instead of waiting for their next poll.
  // Silent (no loading skeleton): only the list data is swapped in place.
  const { setData: setConversationsData } = conversations
  const refreshConversations = useCallback(() => getConversations({ limit: 30 }).then(setConversationsData).catch(() => {}), [setConversationsData])
  useEffect(() => {
    if (!activeId || !messages.data || activeRoomUnread === 0) return
    void refreshConversations()
    window.dispatchEvent(new Event(CHAT_READ_EVENT))
  }, [activeId, messages.data, activeRoomUnread, refreshConversations])

  async function submit() {
    if (!activeId || draft.trim().length === 0 || sendingRef.current) return
    sendingRef.current = true
    setIsSending(true)
    try {
      await sendMessage(activeId, draft.trim())
      setDraft("")
      messages.reload()
      // Moves this conversation to the top of the list without blanking the page.
      void refreshConversations()
    } catch (error) {
      toast.error("Message not sent", { description: getAdminErrorMessage(error) })
    } finally {
      sendingRef.current = false
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
          <ul className="max-h-[28rem] space-y-2 overflow-y-auto surface-card p-2" aria-label="Conversations">
            {rooms.map((room) => {
              const isUnread = (room.unreadCount ?? 0) > 0 && room.id !== activeId
              const preview = latestMessagePreview(room, user?.id)
              return (
                <li key={room.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(room.id)}
                    aria-current={room.id === activeId ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-md border border-border bg-background px-3 py-2.5 text-left text-sm shadow-xs transition-colors hover:bg-secondary",
                      room.id === activeId && "border-primary/40 bg-secondary",
                    )}
                  >
                    <Avatar className="size-9 shrink-0"><AvatarFallback className="bg-primary text-xs text-primary-foreground">{participantInitials(room)}</AvatarFallback></Avatar>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block truncate", isUnread ? "font-semibold" : "font-medium")}>{participantSummary(room)}</span>
                      {/* Like a messaging app: the latest message under the name, darker and bolder while unread. */}
                      <span className={cn("mt-0.5 flex min-w-0 gap-1 text-xs", isUnread ? "font-semibold text-foreground" : "text-muted-foreground")}>
                        <span className="truncate">{preview ?? "No messages yet"}</span>
                        {room.latestMessage && <span className="shrink-0">· {formatChatAge(room.latestMessage.createdAt)}</span>}
                      </span>
                    </span>
                    {isUnread && <span className="size-2.5 shrink-0 rounded-full bg-(--unread-dot)" role="status" aria-label="Unread messages" />}
                  </button>
                </li>
              )
            })}
          </ul>

          <section className="flex min-h-[28rem] flex-col surface-card" aria-label="Conversation messages">
            <div className="flex-1 space-y-3 overflow-y-auto p-4">
              {!activeId ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Select a conversation to read it.</p>
              ) : messages.isLoading ? <Skeleton className="h-40 w-full" /> : messages.error ? <ErrorState message={messages.error} onRetry={messages.reload} /> : (messages.data ?? []).length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No messages in this conversation yet.</p>
              ) : (
                (messages.data ?? []).map((message) => {
                  const isMine = message.senderId === user?.id
                  return (
                    <div key={message.id} className={cn("max-w-[85%] rounded-lg border border-border px-3 py-2 text-sm", isMine ? "ml-auto bg-secondary" : "bg-background")}>
                      <p className="text-xs text-muted-foreground">{message.sender ? `${message.sender.firstName} ${message.sender.lastName}` : message.senderId === null ? "PanelScan Support · Auto-reply" : "Unknown"} · {formatDateTime(message.createdAt)}</p>
                      <p className="mt-1 leading-6 whitespace-pre-wrap">{message.content}</p>
                    </div>
                  )
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {!activeId ? null : canReply ? (
              <div className="border-t border-border p-3">
                <label htmlFor="chat-draft" className="sr-only">Message</label>
                <Textarea id="chat-draft" rows={2} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => handleComposerKeyDown(event, () => void submit())} placeholder="Write a reply" maxLength={2000} />
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

function participantInitials(room: ChatConversation): string {
  const customer = room.participants?.find((participant) => participant.user.role === "CUSTOMER")
  return customer ? `${customer.user.firstName[0] ?? ""}${customer.user.lastName[0] ?? ""}`.toUpperCase() || "?" : "?"
}

function participantSummary(room: ChatConversation): string {
  const customer = room.participants?.find((participant) => participant.user.role === "CUSTOMER")
  return customer ? `${customer.user.firstName} ${customer.user.lastName}` : `${room.participants?.length ?? 0} participants`
}
