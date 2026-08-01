import { NotificationType, Prisma, UserRole } from '@prisma/client';

import { prisma } from '../../config/database';
import { createNotification } from '../notifications/notification.service';
import { AppError } from '../../utils/AppError';
import { chatRoomInclude, messageInclude } from './chat.types';
import type {
  ChatRoomWithParticipants,
  ConversationFilters,
  ConversationSummary,
  MessageFilters,
  MessageWithSender,
  PaginatedConversations,
  PaginatedMessages,
} from './chat.types';
import type { CreateChatRoomInput, SendMessageInput } from './chat.validation';

const DEFAULT_PAGE = 1;
const DEFAULT_CONVERSATION_LIMIT = 20;
const DEFAULT_MESSAGE_LIMIT = 30;

const isParticipant = (room: { participants: Array<{ userId: string }> }, userId: string): boolean =>
  room.participants.some((participant) => participant.userId === userId);

export class ChatService {
  async createChatRoom(customerId: string, input: CreateChatRoomInput): Promise<ChatRoomWithParticipants> {
    return prisma.chatRoom.create({
      data: {
        subject: input.subject,
        participants: { create: { userId: customerId } },
      },
      include: chatRoomInclude,
    });
  }

  async getConversations(
    requesterId: string,
    requesterRole: UserRole,
    filters: ConversationFilters,
  ): Promise<PaginatedConversations> {
    const page = filters.page ?? DEFAULT_PAGE;
    const limit = filters.limit ?? DEFAULT_CONVERSATION_LIMIT;

    const where: Prisma.ChatRoomWhereInput = {
      ...(requesterRole === UserRole.CUSTOMER ? { participants: { some: { userId: requesterId } } } : {}),
      ...(filters.search
        ? {
            OR: [
              { subject: { contains: filters.search, mode: 'insensitive' } },
              {
                participants: {
                  some: {
                    user: {
                      OR: [
                        { firstName: { contains: filters.search, mode: 'insensitive' } },
                        { lastName: { contains: filters.search, mode: 'insensitive' } },
                        { email: { contains: filters.search, mode: 'insensitive' } },
                      ],
                    },
                  },
                },
              },
            ],
          }
        : {}),
    };

    const [rooms, total] = await Promise.all([
      prisma.chatRoom.findMany({
        where,
        include: chatRoomInclude,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.chatRoom.count({ where }),
    ]);

    const conversations = await Promise.all(rooms.map((room) => this.toConversationSummary(room, requesterId)));

    return {
      conversations,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  private async toConversationSummary(room: ChatRoomWithParticipants, requesterId: string): Promise<ConversationSummary> {
    const [latestMessage, unreadCount] = await Promise.all([
      prisma.message.findFirst({
        where: { chatRoomId: room.id },
        include: messageInclude,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.message.count({ where: { chatRoomId: room.id, senderId: { not: requesterId }, isRead: false } }),
    ]);

    return { ...room, latestMessage, unreadCount };
  }

  async getConversationById(chatRoomId: string, requesterId: string, requesterRole: UserRole): Promise<ChatRoomWithParticipants> {
    const room = await prisma.chatRoom.findUnique({ where: { id: chatRoomId }, include: chatRoomInclude });
    if (!room) {
      throw new AppError('Conversation not found.', 404);
    }
    if (requesterRole === UserRole.CUSTOMER && !isParticipant(room, requesterId)) {
      throw new AppError('Conversation not found.', 404);
    }
    return room;
  }

  async sendMessage(
    chatRoomId: string,
    senderId: string,
    senderRole: UserRole,
    input: SendMessageInput,
  ): Promise<MessageWithSender> {
    return prisma.$transaction(async (tx) => {
      const room = await tx.chatRoom.findUnique({ where: { id: chatRoomId }, include: { participants: true } });
      if (!room) {
        throw new AppError('Conversation not found.', 404);
      }
      if (senderRole === UserRole.CUSTOMER && !isParticipant(room, senderId)) {
        throw new AppError('Conversation not found.', 404);
      }

      // Auto-join: a MODERATOR replying to a conversation they haven't
      // participated in yet becomes a participant. Idempotent via upsert
      // on the @@unique([chatRoomId, userId]) constraint, so replying more
      // than once never creates a duplicate participant row.
      await tx.chatParticipant.upsert({
        where: { chatRoomId_userId: { chatRoomId, userId: senderId } },
        update: {},
        create: { chatRoomId, userId: senderId },
      });

      const message = await tx.message.create({
        data: { chatRoomId, senderId, content: input.content },
        include: messageInclude,
      });

      // Keep the room's updatedAt current so conversation lists (ordered
      // by updatedAt desc) surface the most recently active conversation
      // first, without needing a separate "latest activity" query.
      await tx.chatRoom.update({ where: { id: chatRoomId }, data: { updatedAt: new Date() } });

      // Notify every other existing participant. room was fetched before the
      // auto-join upsert above, but that only ever adds the sender - the set
      // of *other* participants to notify is unaffected either way.
      const recipientIds = new Set(
        room.participants.map((participant) => participant.userId).filter((userId) => userId !== senderId),
      );
      for (const recipientId of recipientIds) {
        await createNotification(
          {
            userId: recipientId,
            type: NotificationType.CHAT,
            title: 'New message',
            message: message.content,
            metadata: { chatRoomId, messageId: message.id },
          },
          tx,
        );
      }

      return message;
    });
  }

  async getMessages(
    chatRoomId: string,
    requesterId: string,
    requesterRole: UserRole,
    filters: MessageFilters,
  ): Promise<PaginatedMessages> {
    const room = await prisma.chatRoom.findUnique({ where: { id: chatRoomId }, include: { participants: true } });
    if (!room) {
      throw new AppError('Conversation not found.', 404);
    }
    if (requesterRole === UserRole.CUSTOMER && !isParticipant(room, requesterId)) {
      throw new AppError('Conversation not found.', 404);
    }

    const page = filters.page ?? DEFAULT_PAGE;
    const limit = filters.limit ?? DEFAULT_MESSAGE_LIMIT;
    const sort = filters.sort ?? 'desc';
    const where: Prisma.MessageWhereInput = { chatRoomId };

    const [messages, total] = await Promise.all([
      prisma.message.findMany({
        where,
        include: messageInclude,
        orderBy: { createdAt: sort },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.message.count({ where }),
    ]);

    // Viewing a conversation marks the other party's messages as read and
    // bumps this participant's read cursor - standard chat UX, and what
    // actually moves the unread count without the client having to call
    // the mark-read endpoint for every message individually.
    await prisma.$transaction([
      prisma.message.updateMany({
        where: { chatRoomId, senderId: { not: requesterId }, isRead: false },
        data: { isRead: true },
      }),
      prisma.chatParticipant.updateMany({
        where: { chatRoomId, userId: requesterId },
        data: { lastReadAt: new Date() },
      }),
    ]);

    return {
      messages,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async markMessageRead(messageId: string, requesterId: string, requesterRole: UserRole): Promise<MessageWithSender> {
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: { chatRoom: { include: { participants: true } } },
    });
    if (!message) {
      throw new AppError('Message not found.', 404);
    }
    if (requesterRole === UserRole.CUSTOMER && !isParticipant(message.chatRoom, requesterId)) {
      throw new AppError('Message not found.', 404);
    }
    if (message.senderId === requesterId) {
      throw new AppError('You cannot mark your own message as read.', 400);
    }

    return prisma.message.update({ where: { id: messageId }, data: { isRead: true }, include: messageInclude });
  }

  /**
   * Hard delete - the Message model has no soft-delete column (unlike
   * Product's deletedAt or User/Category/Installer's isActive), and adding
   * one would be a schema change outside this module's scope.
   */
  async deleteOwnMessage(messageId: string, requesterId: string): Promise<void> {
    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message) {
      throw new AppError('Message not found.', 404);
    }
    if (message.senderId !== requesterId) {
      throw new AppError('You can only delete your own messages.', 403);
    }

    await prisma.message.delete({ where: { id: messageId } });
  }

  async getUnreadCount(requesterId: string, requesterRole: UserRole): Promise<number> {
    const where: Prisma.MessageWhereInput = {
      senderId: { not: requesterId },
      isRead: false,
      ...(requesterRole === UserRole.CUSTOMER ? { chatRoom: { participants: { some: { userId: requesterId } } } } : {}),
    };

    return prisma.message.count({ where });
  }
}

export const chatService = new ChatService();
