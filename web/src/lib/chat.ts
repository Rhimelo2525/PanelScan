import type { KeyboardEvent } from "react"

import type { ChatConversation } from "@/types/admin"

const shortDate = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", timeZone: "Asia/Manila" })

/** Messenger-style age of a message: "now", "5m", "3h", "2d", then "Sep 23". */
export function formatChatAge(value: string, now: Date = new Date()): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  const minutes = Math.floor((now.getTime() - date.getTime()) / 60_000)
  if (minutes < 1) return "now"
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return shortDate.format(date)
}

/**
 * The list preview of a conversation's latest message, prefixed with who
 * said it when that isn't the customer: "You: ..." for the viewer, a
 * colleague's first name, or "Auto-reply: ...". Null when it has no messages.
 */
export function latestMessagePreview(conversation: ChatConversation, viewerId: string | undefined): string | null {
  const message = conversation.latestMessage
  if (!message) return null
  const prefix = message.senderId === null ? "Auto-reply: " : message.senderId === viewerId ? "You: " : message.sender && message.sender.role !== "CUSTOMER" ? `${message.sender.firstName}: ` : ""
  return `${prefix}${message.content.replace(/\s+/g, " ").trim()}`
}

/**
 * Fired after a conversation is opened and its messages were marked read, so
 * the admin "Support chat" unread dot refreshes right away instead of waiting
 * for its next poll.
 */
export const CHAT_READ_EVENT = "panelscan:chat-read"

function latestActivity(conversation: ChatConversation): number {
  const updated = new Date(conversation.updatedAt).getTime()
  const latestMessage = conversation.latestMessage ? new Date(conversation.latestMessage.createdAt).getTime() : 0
  return Math.max(updated, latestMessage)
}

/**
 * Orders the conversation LIST: most recent activity first. Messages inside a
 * conversation are never sorted here - they stay oldest-to-newest.
 */
export function sortConversationsByActivity(conversations: ChatConversation[]): ChatConversation[] {
  return [...conversations].sort((a, b) => latestActivity(b) - latestActivity(a))
}

/**
 * Composer keydown: Enter sends through the page's own send function,
 * Shift+Enter keeps the textarea's normal new line. Enter never inserts a line
 * break or reaches a surrounding form; a held-down key (auto-repeat) and Enter
 * while an IME is still composing a character don't send.
 */
export function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>, send: () => void): void {
  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return
  event.preventDefault()
  if (!event.repeat) send()
}
