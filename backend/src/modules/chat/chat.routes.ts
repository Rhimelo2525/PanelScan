import { UserRole } from '@prisma/client';
import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import { restrictTo } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { chatController } from './chat.controller';
import {
  createChatRoomSchema,
  idParamsSchema,
  listConversationsSchema,
  listMessagesSchema,
  messageIdParamsSchema,
  sendMessageSchema,
} from './chat.validation';

const router = Router();

router.use(authenticate);

// GET /api/chat/unread/count
router.get('/unread/count', chatController.getUnreadCount);

// PATCH /api/chat/messages/:id/read - CUSTOMER/MODERATOR only, OWNER is read-only.
router.patch(
  '/messages/:id/read',
  restrictTo(UserRole.CUSTOMER, UserRole.MODERATOR),
  validate(messageIdParamsSchema),
  chatController.markMessageRead,
);

// DELETE /api/chat/messages/:id - sender-only, enforced in the service; also
// restricted here so OWNER never reaches it (OWNER never sends messages).
router.delete(
  '/messages/:id',
  restrictTo(UserRole.CUSTOMER, UserRole.MODERATOR),
  validate(messageIdParamsSchema),
  chatController.deleteMessage,
);

// POST /api/chat - CUSTOMER creates their own conversation.
router.post('/', restrictTo(UserRole.CUSTOMER), validate(createChatRoomSchema), chatController.createRoom);

// GET /api/chat - CUSTOMER: own conversations only. MODERATOR/OWNER: every conversation.
router.get('/', validate(listConversationsSchema), chatController.getConversations);

// GET /api/chat/:id - CUSTOMER: own only (404 otherwise). MODERATOR/OWNER: any.
router.get('/:id', validate(idParamsSchema), chatController.getConversationById);

// POST /api/chat/:id/messages - CUSTOMER (own conversation) or MODERATOR (any). OWNER is read-only.
router.post(
  '/:id/messages',
  restrictTo(UserRole.CUSTOMER, UserRole.MODERATOR),
  validate(sendMessageSchema),
  chatController.sendMessage,
);

// GET /api/chat/:id/messages
router.get('/:id/messages', validate(listMessagesSchema), chatController.getMessages);

export default router;
