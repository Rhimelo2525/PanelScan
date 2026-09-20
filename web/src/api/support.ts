import { apiRequest } from "@/api/client"
import type { BookingStatus, ChatConversation, ChatMessage, Pagination } from "@/types/admin"

/** Customer contracts for human support messaging, order feedback, and installation booking. */

// --------------------------------------------------------------------- chat

/** CUSTOMER only. `subject` is the only field the backend accepts. */
export async function createConversation(subject?: string): Promise<ChatConversation> {
  const response = await apiRequest<{ conversation: ChatConversation }>("/chat", {
    method: "POST",
    authenticated: true,
    body: subject ? { subject } : {},
  })
  return response.conversation
}

export async function getMyConversations(signal?: AbortSignal): Promise<ChatConversation[]> {
  const response = await apiRequest<{ conversations: ChatConversation[]; pagination: Pagination }>("/chat?limit=30", { authenticated: true, signal })
  return response.conversations
}

export async function getConversationMessages(conversationId: string, signal?: AbortSignal): Promise<ChatMessage[]> {
  const response = await apiRequest<{ messages: ChatMessage[]; pagination: Pagination }>(`/chat/${conversationId}/messages?limit=100`, { authenticated: true, signal })
  // The backend returns newest-first (so a limited page always holds the most
  // recent messages). Reverse here so the thread renders oldest-to-newest,
  // newest at the bottom, like a normal chat.
  return [...response.messages].reverse()
}

export async function postMessage(conversationId: string, content: string): Promise<ChatMessage> {
  const response = await apiRequest<{ message: ChatMessage }>(`/chat/${conversationId}/messages`, {
    method: "POST",
    authenticated: true,
    body: { content },
  })
  return response.message
}

export async function getUnreadCount(signal?: AbortSignal): Promise<number> {
  const response = await apiRequest<{ count: number }>("/chat/unread/count", { authenticated: true, signal })
  return response.count
}

// ----------------------------------------------------------------- feedback

export interface CustomerFeedback {
  id: string
  customerId: string
  orderId: string | null
  rating: number
  comment: string | null
  createdAt: string
  updatedAt: string
  order?: { id: string; orderNumber: string; status: string } | null
}

/**
 * CUSTOMER only. The backend accepts feedback for the customer's own DELIVERED
 * orders and rejects a second submission for the same order.
 */
export async function submitFeedback(input: { orderId: string; rating: number; comment?: string }): Promise<CustomerFeedback> {
  const response = await apiRequest<{ feedback: CustomerFeedback }>("/feedback", { method: "POST", authenticated: true, body: input })
  return response.feedback
}

export async function getMyFeedback(signal?: AbortSignal): Promise<CustomerFeedback[]> {
  const response = await apiRequest<{ feedbacks: CustomerFeedback[]; pagination: Pagination }>("/feedback?limit=50", { authenticated: true, signal })
  return response.feedbacks
}

// ----------------------------------------------------------------- bookings

export interface InstallerSummary {
  id: string
  firstName: string
  lastName: string
  phone: string
  specialty: string | null
}

export interface Booking {
  id: string
  customerId: string
  installerId: string | null
  status: BookingStatus
  scheduledDate: string
  address: string
  notes: string | null
  createdAt: string
  updatedAt: string
  installer?: InstallerSummary | null
}

/** CUSTOMER only. The backend requires a future date and an address of at least 10 characters. */
export async function requestInstallation(input: { scheduledDate: string; address: string; notes?: string; orderId?: string }): Promise<Booking> {
  const response = await apiRequest<{ booking: Booking }>("/bookings", { method: "POST", authenticated: true, body: input })
  return response.booking
}

export async function getMyBookings(signal?: AbortSignal): Promise<Booking[]> {
  const response = await apiRequest<{ bookings: Booking[]; pagination: Pagination }>("/bookings?limit=30", { authenticated: true, signal })
  return response.bookings
}

/** CUSTOMER only, and only while the booking is still PENDING. */
export async function cancelBooking(bookingId: string): Promise<Booking> {
  const response = await apiRequest<{ booking: Booking }>(`/bookings/${bookingId}/cancel`, { method: "PATCH", authenticated: true })
  return response.booking
}
