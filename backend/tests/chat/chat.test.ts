import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import { createCustomer, createModerator, createOwner, createTestChatRoom, createTestMessage } from '../helpers/factories';
import app from '../helpers/testApp';

const expectApiSuccess = (response: request.Response, status: number, message?: string): void => {
  expect(response.status).toBe(status);
  expect(response.body.success).toBe(true);
  if (message) {
    expect(response.body.message).toBe(message);
  } else {
    expect(typeof response.body.message).toBe('string');
  }
};

const expectApiError = (response: request.Response, status: number, messageMatch?: string | RegExp): void => {
  expect(response.status).toBe(status);
  expect(response.body.success).toBe(false);
  expect(typeof response.body.message).toBe('string');
  if (messageMatch) {
    expect(response.body.message).toMatch(messageMatch);
  }
};

describe('Chat module', () => {
  // ================================================================
  // AUTHENTICATION
  // ================================================================
  describe('Authentication', () => {
    it('returns 401 for a request without a JWT', async () => {
      const response = await request(app).get('/api/chat');
      expectApiError(response, 401);
    });

    it('returns 401 for a malformed JWT', async () => {
      const response = await request(app).get('/api/chat').set('Authorization', 'Bearer not-a-real-token');
      expectApiError(response, 401);
    });

    it('returns 401 (not a role check) for a role-guarded route with no token at all', async () => {
      const response = await request(app).patch('/api/chat/messages/00000000-0000-0000-0000-000000000000/read');
      expectApiError(response, 401);
    });
  });

  // ================================================================
  // CONVERSATION: CREATE
  // ================================================================
  describe('POST /api/chat (create conversation)', () => {
    it('lets a CUSTOMER create a conversation, verified in the database', async () => {
      const { token, user } = await createCustomer();

      const response = await request(app).post('/api/chat').set('Authorization', `Bearer ${token}`).send({ subject: 'Order help' });

      expectApiSuccess(response, 201, 'Conversation created successfully.');
      expect(response.body.data.conversation.subject).toBe('Order help');

      const dbRoom = await prisma.chatRoom.findUnique({
        where: { id: response.body.data.conversation.id },
        include: { participants: true },
      });
      expect(dbRoom).not.toBeNull();
      expect(dbRoom?.participants).toHaveLength(1);
      expect(dbRoom?.participants[0]?.userId).toBe(user.id);
      expect(dbRoom?.createdAt).toBeInstanceOf(Date);
    });

    it('rejects a MODERATOR creating a conversation with 403 - only customers create conversations', async () => {
      const { token } = await createModerator();

      const response = await request(app).post('/api/chat').set('Authorization', `Bearer ${token}`).send({ subject: 'Should fail' });

      expectApiError(response, 403);

      const count = await prisma.chatRoom.count({ where: { subject: 'Should fail' } });
      expect(count).toBe(0);
    });
  });

  // ================================================================
  // AUTHORIZATION: CUSTOMER CANNOT ACCESS ANOTHER CUSTOMER'S CHAT
  // ================================================================
  describe('Authorization - conversation access', () => {
    it("returns 404 when Customer B requests Customer A's conversation (no data leakage)", async () => {
      const customerA = await createCustomer();
      const customerB = await createCustomer();
      const room = await createTestChatRoom({ subject: 'Private topic', participantIds: [customerA.user.id] });

      const response = await request(app).get(`/api/chat/${room.id}`).set('Authorization', `Bearer ${customerB.token}`);

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(JSON.stringify(response.body)).not.toContain('Private topic');
    });

    it('lets a MODERATOR view any conversation', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const room = await createTestChatRoom({ subject: 'Any conversation', participantIds: [customer.user.id] });

      const response = await request(app).get(`/api/chat/${room.id}`).set('Authorization', `Bearer ${moderator.token}`);

      expectApiSuccess(response, 200, 'Conversation retrieved successfully.');
      expect(response.body.data.conversation.id).toBe(room.id);
    });

    it('lets an OWNER view any conversation (read-only policy)', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const room = await createTestChatRoom({ participantIds: [customer.user.id] });

      const response = await request(app).get(`/api/chat/${room.id}`).set('Authorization', `Bearer ${owner.token}`);

      expectApiSuccess(response, 200);
    });

    it('rejects an OWNER sending a message with 403 - read-only', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const room = await createTestChatRoom({ participantIds: [customer.user.id] });

      const response = await request(app)
        .post(`/api/chat/${room.id}/messages`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ content: 'Owner should not be able to send this.' });

      expectApiError(response, 403);

      const count = await prisma.message.count({ where: { chatRoomId: room.id } });
      expect(count).toBe(0);
    });
  });

  // ================================================================
  // CONVERSATION: LIST / SEARCH / PAGINATION
  // ================================================================
  describe('GET /api/chat (list, search, pagination)', () => {
    it("Customer A's list excludes Customer B's conversation, confirmed against the database", async () => {
      const customerA = await createCustomer();
      const customerB = await createCustomer();
      const roomA = await createTestChatRoom({ participantIds: [customerA.user.id] });
      const roomB = await createTestChatRoom({ participantIds: [customerB.user.id] });

      const response = await request(app).get('/api/chat').set('Authorization', `Bearer ${customerA.token}`);

      expectApiSuccess(response, 200, 'Conversations retrieved successfully.');
      const ids = (response.body.data.conversations as Array<{ id: string }>).map((c) => c.id);
      expect(ids).toContain(roomA.id);
      expect(ids).not.toContain(roomB.id);

      const dbRoomB = await prisma.chatRoom.findUnique({ where: { id: roomB.id } });
      expect(dbRoomB).not.toBeNull();
    });

    it('lets a MODERATOR view every conversation across customers', async () => {
      const moderator = await createModerator();
      const customerA = await createCustomer();
      const customerB = await createCustomer();
      await createTestChatRoom({ participantIds: [customerA.user.id] });
      await createTestChatRoom({ participantIds: [customerB.user.id] });

      const response = await request(app).get('/api/chat').set('Authorization', `Bearer ${moderator.token}`);

      expectApiSuccess(response, 200);
      expect(response.body.data.conversations.length).toBeGreaterThanOrEqual(2);
    });

    it('finds a conversation by subject search', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const match = await createTestChatRoom({ subject: 'Leaking roof panel', participantIds: [customer.user.id] });
      await createTestChatRoom({ subject: 'Unrelated topic', participantIds: [customer.user.id] });

      const response = await request(app).get('/api/chat').set('Authorization', `Bearer ${moderator.token}`).query({ search: 'roof' });

      expectApiSuccess(response, 200);
      const ids = (response.body.data.conversations as Array<{ id: string }>).map((c) => c.id);
      expect(ids).toContain(match.id);
    });

    it('paginates conversations', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      for (let i = 0; i < 3; i += 1) {
        await createTestChatRoom({ participantIds: [customer.user.id] });
      }

      const response = await request(app).get('/api/chat').set('Authorization', `Bearer ${moderator.token}`).query({ limit: '2', page: '1' });

      expectApiSuccess(response, 200);
      expect(response.body.data.conversations.length).toBeLessThanOrEqual(2);
      expect(response.body.data.pagination.limit).toBe(2);
      expect(response.body.data.pagination.total).toBeGreaterThanOrEqual(3);
    });

    it('includes the latest message and unread count in each conversation summary', async () => {
      const { token, user } = await createCustomer();
      const moderator = await createModerator();
      const room = await createTestChatRoom({ participantIds: [user.id] });
      await createTestMessage({ chatRoomId: room.id, senderId: moderator.user.id, content: 'First message', isRead: false });
      await createTestMessage({ chatRoomId: room.id, senderId: moderator.user.id, content: 'Latest message', isRead: false });

      const response = await request(app).get('/api/chat').set('Authorization', `Bearer ${token}`);

      expectApiSuccess(response, 200);
      const summary = (response.body.data.conversations as Array<{ id: string; latestMessage: { content: string }; unreadCount: number }>).find(
        (c) => c.id === room.id,
      );
      expect(summary?.latestMessage?.content).toBe('Latest message');
      expect(summary?.unreadCount).toBe(2);
    });
  });

  // ================================================================
  // MESSAGES: SEND / RECEIVE / SORTING / READ-ON-VIEW
  // ================================================================
  describe('Messages', () => {
    it('lets a CUSTOMER send a message in their own conversation, verified in the database', async () => {
      const { token, user } = await createCustomer();
      const room = await createTestChatRoom({ participantIds: [user.id] });

      const response = await request(app)
        .post(`/api/chat/${room.id}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'Hello, I need help with my order.' });

      expectApiSuccess(response, 201, 'Message sent successfully.');
      expect(response.body.data.message.content).toBe('Hello, I need help with my order.');

      const dbMessage = await prisma.message.findUnique({ where: { id: response.body.data.message.id } });
      expect(dbMessage).not.toBeNull();
      expect(dbMessage?.chatRoomId).toBe(room.id);
      expect(dbMessage?.senderId).toBe(user.id);
      expect(dbMessage?.isRead).toBe(false);
      expect(dbMessage?.createdAt).toBeInstanceOf(Date);
    });

    it("returns 404 when a CUSTOMER sends a message to another customer's conversation", async () => {
      const outsider = await createCustomer();
      const owner = await createCustomer();
      const room = await createTestChatRoom({ participantIds: [owner.user.id] });

      const response = await request(app)
        .post(`/api/chat/${room.id}/messages`)
        .set('Authorization', `Bearer ${outsider.token}`)
        .send({ content: 'I should not be able to send this.' });

      expectApiError(response, 404);

      const count = await prisma.message.count({ where: { chatRoomId: room.id } });
      expect(count).toBe(0);
    });

    it('lets a MODERATOR reply to any conversation and auto-joins as a participant exactly once, even after replying twice', async () => {
      const { token, user: moderatorUser } = await createModerator();
      const customer = await createCustomer();
      const room = await createTestChatRoom({ participantIds: [customer.user.id] });

      const first = await request(app).post(`/api/chat/${room.id}/messages`).set('Authorization', `Bearer ${token}`).send({ content: 'How can I help?' });
      expectApiSuccess(first, 201);

      const second = await request(app).post(`/api/chat/${room.id}/messages`).set('Authorization', `Bearer ${token}`).send({ content: 'Following up.' });
      expectApiSuccess(second, 201);

      // No duplicate participant row, even after replying twice.
      const participants = await prisma.chatParticipant.findMany({ where: { chatRoomId: room.id, userId: moderatorUser.id } });
      expect(participants).toHaveLength(1);
    });

    it('returns messages newest-first by default and oldest-first when sort=asc', async () => {
      const { token, user } = await createCustomer();
      const room = await createTestChatRoom({ participantIds: [user.id] });
      const first = await createTestMessage({ chatRoomId: room.id, senderId: user.id, content: 'First' });
      await new Promise((resolve) => setTimeout(resolve, 5));
      const second = await createTestMessage({ chatRoomId: room.id, senderId: user.id, content: 'Second' });

      const desc = await request(app).get(`/api/chat/${room.id}/messages`).set('Authorization', `Bearer ${token}`);
      expectApiSuccess(desc, 200, 'Messages retrieved successfully.');
      expect(desc.body.data.messages[0].id).toBe(second.id);

      const asc = await request(app).get(`/api/chat/${room.id}/messages`).set('Authorization', `Bearer ${token}`).query({ sort: 'asc' });
      expectApiSuccess(asc, 200);
      expect(asc.body.data.messages[0].id).toBe(first.id);
    });

    it('marks the other party\'s unread messages as read when the conversation is viewed', async () => {
      const { token, user } = await createCustomer();
      const moderator = await createModerator();
      const room = await createTestChatRoom({ participantIds: [user.id] });
      const message = await createTestMessage({ chatRoomId: room.id, senderId: moderator.user.id, isRead: false });

      const response = await request(app).get(`/api/chat/${room.id}/messages`).set('Authorization', `Bearer ${token}`);
      expectApiSuccess(response, 200);

      const dbMessage = await prisma.message.findUnique({ where: { id: message.id } });
      expect(dbMessage?.isRead).toBe(true);

      const participant = await prisma.chatParticipant.findUnique({
        where: { chatRoomId_userId: { chatRoomId: room.id, userId: user.id } },
      });
      expect(participant?.lastReadAt).not.toBeNull();
    });

    it("returns 404 when a CUSTOMER requests another customer's conversation messages", async () => {
      const outsider = await createCustomer();
      const owner = await createCustomer();
      const room = await createTestChatRoom({ participantIds: [owner.user.id] });
      await createTestMessage({ chatRoomId: room.id, senderId: owner.user.id });

      const response = await request(app).get(`/api/chat/${room.id}/messages`).set('Authorization', `Bearer ${outsider.token}`);

      expectApiError(response, 404);
    });
  });

  // ================================================================
  // MESSAGE: MARK READ
  // ================================================================
  describe('PATCH /api/chat/messages/:id/read', () => {
    it('lets the recipient mark a message as read, verified in the database', async () => {
      const { token, user } = await createCustomer();
      const moderator = await createModerator();
      const room = await createTestChatRoom({ participantIds: [user.id] });
      const message = await createTestMessage({ chatRoomId: room.id, senderId: moderator.user.id, isRead: false });

      const response = await request(app).patch(`/api/chat/messages/${message.id}/read`).set('Authorization', `Bearer ${token}`);

      expectApiSuccess(response, 200, 'Message marked as read.');
      expect(response.body.data.message.isRead).toBe(true);

      const dbMessage = await prisma.message.findUnique({ where: { id: message.id } });
      expect(dbMessage?.isRead).toBe(true);
    });

    it('rejects marking your own message as read with 400', async () => {
      const { token, user } = await createCustomer();
      const room = await createTestChatRoom({ participantIds: [user.id] });
      const message = await createTestMessage({ chatRoomId: room.id, senderId: user.id, isRead: false });

      const response = await request(app).patch(`/api/chat/messages/${message.id}/read`).set('Authorization', `Bearer ${token}`);

      expectApiError(response, 400);

      const dbMessage = await prisma.message.findUnique({ where: { id: message.id } });
      expect(dbMessage?.isRead).toBe(false);
    });

    it('returns 404 for a nonexistent message', async () => {
      const { token } = await createCustomer();

      const response = await request(app)
        .patch('/api/chat/messages/00000000-0000-0000-0000-000000000000/read')
        .set('Authorization', `Bearer ${token}`);

      expectApiError(response, 404);
    });
  });

  // ================================================================
  // MESSAGE: DELETE OWN
  // ================================================================
  describe('DELETE /api/chat/messages/:id', () => {
    it('lets a CUSTOMER delete their own message - hard deleted (no soft-delete column on Message)', async () => {
      const { token, user } = await createCustomer();
      const room = await createTestChatRoom({ participantIds: [user.id] });
      const message = await createTestMessage({ chatRoomId: room.id, senderId: user.id });

      const response = await request(app).delete(`/api/chat/messages/${message.id}`).set('Authorization', `Bearer ${token}`);

      expectApiSuccess(response, 200, 'Message deleted successfully.');

      const dbMessage = await prisma.message.findUnique({ where: { id: message.id } });
      expect(dbMessage).toBeNull();
    });

    it("rejects deleting someone else's message with 403, message remains in the database", async () => {
      const { token } = await createCustomer();
      const sender = await createCustomer();
      const room = await createTestChatRoom({ participantIds: [sender.user.id] });
      const message = await createTestMessage({ chatRoomId: room.id, senderId: sender.user.id });

      const response = await request(app).delete(`/api/chat/messages/${message.id}`).set('Authorization', `Bearer ${token}`);

      expectApiError(response, 403);

      const dbMessage = await prisma.message.findUnique({ where: { id: message.id } });
      expect(dbMessage).not.toBeNull();
    });
  });

  // ================================================================
  // UNREAD COUNT
  // ================================================================
  describe('GET /api/chat/unread/count', () => {
    it("returns the CUSTOMER's own unread count across their conversations", async () => {
      const { token, user } = await createCustomer();
      const moderator = await createModerator();
      const room = await createTestChatRoom({ participantIds: [user.id] });
      await createTestMessage({ chatRoomId: room.id, senderId: moderator.user.id, isRead: false });
      await createTestMessage({ chatRoomId: room.id, senderId: moderator.user.id, isRead: false });
      await createTestMessage({ chatRoomId: room.id, senderId: user.id, isRead: false }); // own message never counts

      const response = await request(app).get('/api/chat/unread/count').set('Authorization', `Bearer ${token}`);

      expectApiSuccess(response, 200, 'Unread count retrieved successfully.');
      expect(response.body.data.count).toBe(2);
    });

    it('excludes read messages from the unread count', async () => {
      const { token, user } = await createCustomer();
      const moderator = await createModerator();
      const room = await createTestChatRoom({ participantIds: [user.id] });
      await createTestMessage({ chatRoomId: room.id, senderId: moderator.user.id, isRead: true });

      const response = await request(app).get('/api/chat/unread/count').set('Authorization', `Bearer ${token}`);

      expectApiSuccess(response, 200);
      expect(response.body.data.count).toBe(0);
    });
  });

  // ================================================================
  // VALIDATION
  // ================================================================
  describe('Validation', () => {
    it('rejects an invalid (non-UUID) conversation id with 400', async () => {
      const { token } = await createCustomer();

      const response = await request(app).get('/api/chat/not-a-uuid').set('Authorization', `Bearer ${token}`);

      expectApiError(response, 400, 'Validation failed.');
    });

    it('rejects an empty message with 400', async () => {
      const { token, user } = await createCustomer();
      const room = await createTestChatRoom({ participantIds: [user.id] });

      const response = await request(app).post(`/api/chat/${room.id}/messages`).set('Authorization', `Bearer ${token}`).send({ content: '' });

      expectApiError(response, 400, 'Validation failed.');

      const count = await prisma.message.count({ where: { chatRoomId: room.id } });
      expect(count).toBe(0);
    });

    it('rejects a whitespace-only message with 400', async () => {
      const { token, user } = await createCustomer();
      const room = await createTestChatRoom({ participantIds: [user.id] });

      const response = await request(app)
        .post(`/api/chat/${room.id}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: '     ' });

      expectApiError(response, 400, 'Validation failed.');

      const count = await prisma.message.count({ where: { chatRoomId: room.id } });
      expect(count).toBe(0);
    });

    it('rejects a message over the length limit with 400', async () => {
      const { token, user } = await createCustomer();
      const room = await createTestChatRoom({ participantIds: [user.id] });

      const response = await request(app)
        .post(`/api/chat/${room.id}/messages`)
        .set('Authorization', `Bearer ${token}`)
        .send({ content: 'a'.repeat(2001) });

      expectApiError(response, 400, 'Validation failed.');

      const count = await prisma.message.count({ where: { chatRoomId: room.id } });
      expect(count).toBe(0);
    });
  });
});
