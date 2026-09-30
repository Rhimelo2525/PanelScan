import type { KeyboardEvent } from "react"

import type { ChatConversation } from "@/types/admin"

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
