import { Archive, ArchiveRestore, MessageSquare, Pin, PinOff, Search, Send } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { MessageContent } from "@/components/chat/message-content"
import { getConversations, getMessages, sendMessage, setConversationArchived, setConversationPinned } from "@/api/admin"
import { formatDateTime } from "@/admin/admin-format"
import { getAdminErrorMessage, useAdminResource, useDebouncedValue } from "@/admin/use-admin-resource"
import { AdminPageHeader } from "@/components/admin/admin-page-header"
import { EmptyState, ErrorState } from "@/components/admin/empty-state"
import { useAuth } from "@/auth/use-auth"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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
  const messagesScrollRef = useRef<HTMLDivElement>(null)

  const [view, setView] = useState<"inbox" | "archived">("inbox")
  const [searchInput, setSearchInput] = useState("")
  const search = useDebouncedValue(searchInput.trim())
  // The opened conversation, kept so its actions stay available if a search hides it from the list.
  const [openedRoom, setOpenedRoom] = useState<ChatConversation | null>(null)
  const [isUpdatingRoom, setIsUpdatingRoom] = useState(false)

  const listQuery = { limit: 30, search: search || undefined, archived: view === "archived" ? "true" as const : undefined }
  const conversations = useAdminResource((signal) => getConversations(listQuery, signal), [search, view], { pollIntervalMs: 20_000 })
  // Conversation LIST only: pinned first, then latest activity. The thread below keeps its own oldest-to-newest order.
  const sorted = sortConversationsByActivity(conversations.data?.conversations ?? [])
  const rooms = [...sorted.filter((room) => room.pinnedAt), ...sorted.filter((room) => !room.pinnedAt)]
  // Nothing is opened automatically: opening a conversation marks it read, so
  // that only happens when a staff member actually selects it.
  const activeId = selectedId
  const activeRoom = rooms.find((room) => room.id === activeId) ?? (openedRoom?.id === activeId ? openedRoom : null)
  const activeRoomUnread = activeRoom?.unreadCount ?? 0
  const messages = useAdminResource(async (signal) => {
    if (!activeId) return []
    const result = await getMessages(activeId, { limit: 50 }, signal)
    // The backend returns newest-first (so a limited page always holds the
    // most recent messages). Reverse here so the thread renders
    // oldest-to-newest, newest at the bottom, like a normal chat.
    return [...result.messages].reverse()
  }, [activeId], { pollIntervalMs: 8_000 })

  // Scroll the message panel (not the page) to the newest message when a
  // conversation opens, when you send, or when one arrives while you're
  // already at the bottom - never while you've scrolled up to read (the
  // list refreshes every few seconds).
  const scrolledFor = useRef<{ roomId: string | null; lastMessageId: string | null }>({ roomId: null, lastMessageId: null })
  const wasAtBottomRef = useRef(true)
  useEffect(() => {
    if (messages.isLoading) return
    const panel = messagesScrollRef.current
    const list = messages.data ?? []
    const last = list.at(-1)
    const previous = scrolledFor.current
    const opened = previous.roomId !== activeId
    const hasNewMessage = (last?.id ?? null) !== previous.lastMessageId
    scrolledFor.current = { roomId: activeId, lastMessageId: last?.id ?? null }
    if (!panel || !(opened || (hasNewMessage && (wasAtBottomRef.current || last?.senderId === user?.id)))) return
    panel.scrollTop = panel.scrollHeight
  }, [messages.data, messages.isLoading, activeId, user?.id])

  // Loading the open conversation's messages marks them read on the server.
  // Once that has happened, refresh the list (its dot) and the sidebar's
  // "Support chat" dot, instead of waiting for their next poll.
  // Silent (no loading skeleton): only the list data is swapped in place.
  const { setData: setConversationsData } = conversations
  const refreshQueryRef = useRef(listQuery)
  refreshQueryRef.current = listQuery
  const refreshConversations = useCallback(() => getConversations(refreshQueryRef.current).then(setConversationsData).catch(() => {}), [setConversationsData])
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

  function openConversation(room: ChatConversation) {
    setSelectedId(room.id)
    setOpenedRoom(room)
  }

  function switchView(next: "inbox" | "archived") {
    if (next === view) return
    setView(next)
    setSelectedId(null)
    setOpenedRoom(null)
  }

  async function togglePinned(room: ChatConversation) {
    setIsUpdatingRoom(true)
    try {
      const { conversation } = await setConversationPinned(room.id, !room.pinnedAt)
      setOpenedRoom({ ...room, pinnedAt: conversation.pinnedAt })
      await refreshConversations()
    } catch (error) {
      toast.error("Conversation not updated", { description: getAdminErrorMessage(error) })
    } finally {
      setIsUpdatingRoom(false)
    }
  }

  async function toggleArchived(room: ChatConversation) {
    const archived = !room.archivedAt
    setIsUpdatingRoom(true)
    try {
      await setConversationArchived(room.id, archived)
      toast.success(archived ? "Conversation archived. It comes back if the customer writes again." : "Conversation moved back to the inbox.")
      // It has left this list, so the panel closes with it.
      setSelectedId(null)
      setOpenedRoom(null)
      await refreshConversations()
      window.dispatchEvent(new Event(CHAT_READ_EVENT))
    } catch (error) {
      toast.error("Conversation not updated", { description: getAdminErrorMessage(error) })
    } finally {
      setIsUpdatingRoom(false)
    }
  }

  return (
    <div className="space-y-6">
      <AdminPageHeader
        eyebrow="Customer support"
        title="Conversations"
      />

      {conversations.error ? <ErrorState message={conversations.error} onRetry={conversations.reload} /> : (
        <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          {/* Search and tabs stay mounted while results load, so typing never loses focus. */}
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search customer name or email" aria-label="Search customer name or email" className="h-9 pl-8 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-1 rounded-md bg-secondary p-1" role="group" aria-label="Conversation list">
              {(["inbox", "archived"] as const).map((option) => (
                <button key={option} type="button" aria-pressed={view === option} onClick={() => switchView(option)} className={cn("rounded px-2 py-1 text-xs font-medium transition-colors", view === option ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}>
                  {option === "inbox" ? "Inbox" : "Archived"}
                </button>
              ))}
            </div>
          {conversations.isLoading ? <Skeleton className="h-80 w-full" /> : rooms.length === 0 ? (
            <div className="surface-card p-2">
              <EmptyState
                icon={MessageSquare}
                title={search ? "No conversations match your search" : view === "archived" ? "No archived conversations" : "No conversations yet"}
                description={search ? "Try a different customer name or email." : view === "archived" ? "Conversations you archive appear here." : "Customer support conversations started from the storefront appear here."}
              />
            </div>
          ) : (
          <ul className="max-h-[28rem] space-y-2 overflow-y-auto surface-card p-2" aria-label="Conversations">
            {rooms.map((room) => {
              const isUnread = (room.unreadCount ?? 0) > 0 && room.id !== activeId
              const preview = latestMessagePreview(room, user?.id)
              return (
                <li key={room.id}>
                  <button
                    type="button"
                    onClick={() => openConversation(room)}
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
                    {room.pinnedAt && <Pin className="size-3.5 shrink-0 text-muted-foreground" role="img" aria-label="Pinned" />}
                    {isUnread && <span className="size-2.5 shrink-0 rounded-full bg-(--unread-dot)" role="status" aria-label="Unread messages" />}
                  </button>
                </li>
              )
            })}
          </ul>
          )}
          </div>

          {/* Fixed height: messages scroll inside the panel and the reply box stays in view. */}
          <section className="flex h-[calc(100dvh-10rem)] min-h-[28rem] flex-col surface-card" aria-label="Conversation messages">
            {activeRoom && (
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2.5">
                <p className="min-w-0 truncate text-sm font-semibold">{participantSummary(activeRoom)}</p>
                {canReply && (
                  <div className="flex items-center gap-2">
                    {!activeRoom.archivedAt && (
                      <Button variant="outline" size="sm" disabled={isUpdatingRoom} onClick={() => void togglePinned(activeRoom)}>
                        {activeRoom.pinnedAt ? <PinOff data-icon="inline-start" aria-hidden="true" /> : <Pin data-icon="inline-start" aria-hidden="true" />}
                        {activeRoom.pinnedAt ? "Unpin" : "Pin"}
                      </Button>
                    )}
                    <Button variant="outline" size="sm" disabled={isUpdatingRoom} onClick={() => void toggleArchived(activeRoom)}>
                      {activeRoom.archivedAt ? <ArchiveRestore data-icon="inline-start" aria-hidden="true" /> : <Archive data-icon="inline-start" aria-hidden="true" />}
                      {activeRoom.archivedAt ? "Move to inbox" : "Archive"}
                    </Button>
                  </div>
                )}
              </div>
            )}
            <div ref={messagesScrollRef} onScroll={(event) => { const panel = event.currentTarget; wasAtBottomRef.current = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 80 }} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {!activeId ? (
                <p className="py-10 text-center text-sm text-muted-foreground">Select a conversation to read it.</p>
              ) : messages.isLoading ? <Skeleton className="h-40 w-full" /> : messages.error ? <ErrorState message={messages.error} onRetry={messages.reload} /> : (messages.data ?? []).length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">No messages in this conversation yet.</p>
              ) : (
                (messages.data ?? []).map((message) => {
                  // The team's side of a shared inbox: any moderator's reply and the automated reply (no sender)
                  // sit on the right, tinted, for the moderator and for an owner reading along. The customer stays on the left.
                  const isTeam = message.sender ? message.sender.role !== "CUSTOMER" : message.senderId === null
                  return (
                    <div key={message.id} className={cn("max-w-[85%] rounded-lg border px-3 py-2 text-sm", isTeam ? "ml-auto border-primary/25 bg-primary/15" : "border-border bg-background")}>
                      <p className="text-xs text-muted-foreground">{message.sender ? `${message.sender.firstName} ${message.sender.lastName}` : message.senderId === null ? "PanelScan Support · Auto-reply" : "Unknown"} · {formatDateTime(message.createdAt)}</p>
                      <p className="mt-1 leading-6 whitespace-pre-wrap"><MessageContent content={message.content} projectLink={(code) => `/admin/projects?code=${code}`} /></p>
                    </div>
                  )
                })
              )}
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
