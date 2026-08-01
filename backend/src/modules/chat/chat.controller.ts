import { UserRole } from '@prisma/client';
import type { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { catchAsync } from '../../utils/catchAsync';
import { sendSuccess } from '../../utils/response';
import { ChatService, chatService } from './chat.service';
import type { ConversationFilters, MessageFilters } from './chat.types';

interface Requester {
  id: string;
  role: UserRole;
}

const getRequester = (req: Request): Requester => {
  if (!req.user) {
    throw new AppError('Authentication required.', 401);
  }
  return { id: req.user.id, role: req.user.role };
};

const parseConversationFilters = (query: Request['query']): ConversationFilters => ({
  page: typeof query.page === 'string' ? Number(query.page) : undefined,
  limit: typeof query.limit === 'string' ? Number(query.limit) : undefined,
  search: typeof query.search === 'string' ? query.search : undefined,
});

const parseMessageFilters = (query: Request['query']): MessageFilters => ({
  page: typeof query.page === 'string' ? Number(query.page) : undefined,
  limit: typeof query.limit === 'string' ? Number(query.limit) : undefined,
  sort: query.sort === 'asc' || query.sort === 'desc' ? query.sort : undefined,
});

export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  createRoom = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const conversation = await this.chatService.createChatRoom(requester.id, req.body);
    sendSuccess(res, 201, 'Conversation created successfully.', { conversation });
  });

  getConversations = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const result = await this.chatService.getConversations(requester.id, requester.role, parseConversationFilters(req.query));
    sendSuccess(res, 200, 'Conversations retrieved successfully.', result);
  });

  getConversationById = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const conversation = await this.chatService.getConversationById(req.params.id as string, requester.id, requester.role);
    sendSuccess(res, 200, 'Conversation retrieved successfully.', { conversation });
  });

  sendMessage = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const message = await this.chatService.sendMessage(req.params.id as string, requester.id, requester.role, req.body);
    sendSuccess(res, 201, 'Message sent successfully.', { message });
  });

  getMessages = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const result = await this.chatService.getMessages(
      req.params.id as string,
      requester.id,
      requester.role,
      parseMessageFilters(req.query),
    );
    sendSuccess(res, 200, 'Messages retrieved successfully.', result);
  });

  markMessageRead = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const message = await this.chatService.markMessageRead(req.params.id as string, requester.id, requester.role);
    sendSuccess(res, 200, 'Message marked as read.', { message });
  });

  deleteMessage = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    await this.chatService.deleteOwnMessage(req.params.id as string, requester.id);
    sendSuccess(res, 200, 'Message deleted successfully.');
  });

  getUnreadCount = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const count = await this.chatService.getUnreadCount(requester.id, requester.role);
    sendSuccess(res, 200, 'Unread count retrieved successfully.', { count });
  });
}

export const chatController = new ChatController(chatService);
