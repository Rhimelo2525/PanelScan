import type { Prisma } from '@prisma/client';

export const chatRoomInclude = {
  participants: {
    include: {
      user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
    },
  },
} satisfies Prisma.ChatRoomInclude;

export type ChatRoomWithParticipants = Prisma.ChatRoomGetPayload<{ include: typeof chatRoomInclude }>;

export const messageInclude = {
  sender: { select: { id: true, firstName: true, lastName: true, role: true } },
} satisfies Prisma.MessageInclude;

export type MessageWithSender = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface ConversationFilters {
  page?: number;
  limit?: number;
  search?: string;
}

/** A conversation list entry: the room, plus a preview (latest message) and a badge (unread count) - standard chat-list UI needs. */
export type ConversationSummary = ChatRoomWithParticipants & {
  latestMessage: MessageWithSender | null;
  unreadCount: number;
};

export interface PaginatedConversations {
  conversations: ConversationSummary[];
  pagination: PaginationMeta;
}

export interface MessageFilters {
  page?: number;
  limit?: number;
  sort?: 'asc' | 'desc';
}

export interface PaginatedMessages {
  messages: MessageWithSender[];
  pagination: PaginationMeta;
}
