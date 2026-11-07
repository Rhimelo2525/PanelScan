import { UserRole } from '@prisma/client';
import { Router } from 'express';

import { authenticate } from '../../middleware/auth.middleware';
import { restrictTo } from '../../middleware/role.middleware';
import { validate } from '../../middleware/validate.middleware';
import { chatController } from './chat.controller';
import {
  archiveConversationSchema,
  createChatRoomSchema,
  idParamsSchema,
  listConversationsSchema,
  listMessagesSchema,
  messageIdParamsSchema,
  pinConversationSchema,
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

// POST /api/chat - CUSTOMER opens their support conversation (reuses their ongoing one; 201 only when new).
router.post('/', restrictTo(UserRole.CUSTOMER), validate(createChatRoomSchema), chatController.createRoom);

// GET /api/chat - CUSTOMER: own conversations only. MODERATOR/OWNER: every conversation.
router.get('/', validate(listConversationsSchema), chatController.getConversations);

// GET /api/chat/:id - CUSTOMER: own only (404 otherwise). MODERATOR/OWNER: any.
router.get('/:id', validate(idParamsSchema), chatController.getConversationById);

// PATCH /api/chat/:id/pin and /archive - the staff inbox, MODERATOR only (OWNER is read-only on chat).
router.patch('/:id/pin', restrictTo(UserRole.MODERATOR), validate(pinConversationSchema), chatController.setPinned);
router.patch('/:id/archive', restrictTo(UserRole.MODERATOR), validate(archiveConversationSchema), chatController.setArchived);

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
