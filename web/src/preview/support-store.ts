import { useSyncExternalStore } from "react"

import { isPreviewConversationStatus, supportMessageError, supportStatusError } from "@/preview/support-policy"
import type { PreviewConversation, PreviewConversationStatus, PreviewSupportMessage, PreviewSupportRole } from "@/preview/support-policy"

const previewConversationId = "customer-support-preview"
let sequence = 1
let conversations: readonly PreviewConversation[] = [{
  id: previewConversationId,
  customerLabel: "Sample Customer",
  subject: "Product and order support",
  status: "OPEN",
  messages: [{
    id: "support-message-seed",
    sender: "MODERATOR",
    body: "Hello! How can the PanelScan team help with your order or product today?",
    sentAt: "2026-09-12T09:00:00+08:00",
  }],
}]

const listeners = new Set<() => void>()
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
function publish(next: readonly PreviewConversation[]) {
  conversations = next
  listeners.forEach((listener) => listener())
}
function messageId() {
  sequence += 1
  return `support-message-${sequence}`
}

export function usePreviewConversations() {
  return useSyncExternalStore(subscribe, () => conversations)
}

export function getCustomerPreviewConversationId() {
  return previewConversationId
}

export function sendPreviewSupportMessage(role: PreviewSupportRole, conversationId: string, body: string): string | null {
  const error = supportMessageError(role, body)
  if (error) return error
  if (role === "CUSTOMER" && conversationId !== previewConversationId) return "Customers can only send to their own preview conversation."
  const conversation = conversations.find((item) => item.id === conversationId)
  if (!conversation) return "This preview conversation could not be found."
  const sender: PreviewSupportMessage["sender"] = role === "MODERATOR" ? "MODERATOR" : "CUSTOMER"
  const message: PreviewSupportMessage = { id: messageId(), sender, body: body.trim(), sentAt: new Date().toISOString() }
  publish(conversations.map((item) => item.id === conversationId ? {
    ...item,
    status: sender === "MODERATOR" ? "AWAITING_CUSTOMER" : "OPEN",
    messages: [...item.messages, message],
  } : item))
  return null
}

export function updatePreviewConversationStatus(role: PreviewSupportRole, conversationId: string, status: PreviewConversationStatus): string | null {
  const error = supportStatusError(role)
  if (error) return error
  if (!isPreviewConversationStatus(status)) return "Choose a valid support conversation status."
  if (!conversations.some((item) => item.id === conversationId)) return "This preview conversation could not be found."
  publish(conversations.map((item) => item.id === conversationId ? { ...item, status } : item))
  return null
}
