import { z } from 'zod';

const NUMERIC_STRING = /^\d+$/;

export const createChatRoomSchema = z.object({
  body: z.object({
    subject: z.string().trim().min(1, 'Subject cannot be empty.').max(150, 'Subject is too long.').optional(),
  }),
});

export const idParamsSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid conversation id.') }),
});

export const messageIdParamsSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid message id.') }),
});

export const sendMessageSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid conversation id.') }),
  body: z.object({
    // .trim() runs before .min(1), so whitespace-only content ("   ") is
    // reduced to "" and correctly rejected by the same check as an empty
    // string - no separate whitespace-only rule needed.
    content: z.string().trim().min(1, 'Message cannot be empty.').max(2000, 'Message is too long.'),
  }),
});

export const listConversationsSchema = z.object({
  query: z.object({
    page: z.string().regex(NUMERIC_STRING, 'page must be a positive integer.').optional(),
    limit: z.string().regex(NUMERIC_STRING, 'limit must be a positive integer.').optional(),
    search: z.string().trim().min(1, 'Search query cannot be empty.').max(150, 'Search query is too long.').optional(),
  }),
});

export const listMessagesSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid conversation id.') }),
  query: z.object({
    page: z.string().regex(NUMERIC_STRING, 'page must be a positive integer.').optional(),
    limit: z.string().regex(NUMERIC_STRING, 'limit must be a positive integer.').optional(),
    sort: z.enum(['asc', 'desc']).optional(),
  }),
});

export type CreateChatRoomInput = z.infer<typeof createChatRoomSchema>['body'];
export type SendMessageInput = z.infer<typeof sendMessageSchema>['body'];
