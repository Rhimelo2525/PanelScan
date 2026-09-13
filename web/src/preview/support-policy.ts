export type PreviewSupportRole = "CUSTOMER" | "MODERATOR" | "OWNER"
export type PreviewConversationStatus = "OPEN" | "AWAITING_CUSTOMER" | "RESOLVED"

export interface PreviewSupportMessage {
  id: string
  sender: "CUSTOMER" | "MODERATOR"
  body: string
  sentAt: string
}

export interface PreviewConversation {
  id: string
  customerLabel: string
  subject: string
  status: PreviewConversationStatus
  messages: readonly PreviewSupportMessage[]
}

export const SUPPORT_MESSAGE_MAX_LENGTH = 1000

export function supportMessageError(role: PreviewSupportRole, body: string): string | null {
  if (role === "OWNER") return "Owner access does not include customer support conversations."
  if (!body.trim()) return "Enter a message before sending."
  if (body.trim().length > SUPPORT_MESSAGE_MAX_LENGTH) return `Keep messages to ${SUPPORT_MESSAGE_MAX_LENGTH} characters or fewer.`
  return null
}

export function supportStatusError(role: PreviewSupportRole): string | null {
  return role === "MODERATOR" ? null : "Only Moderators can update support conversation status."
}

export function isPreviewConversationStatus(value: string): value is PreviewConversationStatus {
  return value === "OPEN" || value === "AWAITING_CUSTOMER" || value === "RESOLVED"
}
