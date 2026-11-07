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

    it('finds a conversation by the customer full name, and not by a moderator name', async () => {
      const moderator = await createModerator({ firstName: 'Zorblat' });
      const customer = await createCustomer({ firstName: 'Justin', lastName: 'Ablog' });
      const other = await createCustomer({ firstName: 'Maria', lastName: 'Santos' });
      const match = await createTestChatRoom({ participantIds: [customer.user.id, moderator.user.id] });
      const miss = await createTestChatRoom({ participantIds: [other.user.id] });
      const idsFor = async (search: string): Promise<string[]> => {
        const response = await request(app).get('/api/chat').set('Authorization', `Bearer ${moderator.token}`).query({ search });
        return (response.body.data.conversations as Array<{ id: string }>).map((c) => c.id);
      };

      const found = await idsFor('justin ablog');
      expect(found).toContain(match.id);
      expect(found).not.toContain(miss.id);
      expect(await idsFor(moderator.user.firstName)).not.toContain(match.id);
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

    it("orders the conversation list by latest activity (newest at top, oldest at bottom)", async () => {
      const { token, user } = await createCustomer();
      const at = (secondsAgo: number) => new Date(Date.now() - secondsAgo * 1000);
      const roomOldest = await prisma.chatRoom.create({ data: { subject: "Oldest activity", createdAt: at(90), updatedAt: at(60), participants: { create: { userId: user.id } } } });
      const roomNewest = await prisma.chatRoom.create({ data: { subject: "Newest activity", createdAt: at(120), updatedAt: at(5), participants: { create: { userId: user.id } } } });
      const roomMiddle = await prisma.chatRoom.create({ data: { subject: "Middle activity", createdAt: at(30), updatedAt: at(30), participants: { create: { userId: user.id } } } });

      const response = await request(app).get("/api/chat").set("Authorization", `Bearer ${token}`);

      expectApiSuccess(response, 200);
      const ids = (response.body.data.conversations as Array<{ id: string }>).map((c) => c.id).filter((id) => [roomOldest.id, roomMiddle.id, roomNewest.id].includes(id));
      // Ordered by activity, not by when the conversation was created.
      expect(ids).toEqual([roomNewest.id, roomMiddle.id, roomOldest.id]);
    });

    it("moves a conversation to the top when a new message is sent in it", async () => {
      const { token, user } = await createCustomer();
      const olderRoom = await prisma.chatRoom.create({ data: { subject: "Older chat", updatedAt: new Date(Date.now() - 60000), participants: { create: { userId: user.id } } } });
      const newerRoom = await prisma.chatRoom.create({ data: { subject: "Newer chat", updatedAt: new Date(Date.now() - 10000), participants: { create: { userId: user.id } } } });

      const before = await request(app).get("/api/chat").set("Authorization", `Bearer ${token}`);
      expect((before.body.data.conversations as Array<{ id: string }>).map((c) => c.id)).toEqual([newerRoom.id, olderRoom.id]);

      const sent = await request(app).post(`/api/chat/${olderRoom.id}/messages`).set("Authorization", `Bearer ${token}`).send({ content: "New activity here" });
      expectApiSuccess(sent, 201);

      const after = await request(app).get("/api/chat").set("Authorization", `Bearer ${token}`);
      expect((after.body.data.conversations as Array<{ id: string }>).map((c) => c.id)).toEqual([olderRoom.id, newerRoom.id]);
    });

    it("reuses the customer's ongoing conversation instead of opening a second one", async () => {
      const { token, user } = await createCustomer();
      const olderRoom = await prisma.chatRoom.create({ data: { subject: "Older chat", updatedAt: new Date(Date.now() - 60000), participants: { create: { userId: user.id } } } });
      const latestRoom = await prisma.chatRoom.create({ data: { subject: "Existing chat", updatedAt: new Date(Date.now() - 10000), participants: { create: { userId: user.id } } } });

      const createRes = await request(app).post("/api/chat").set("Authorization", `Bearer ${token}`).send({ subject: "Another chat" });
      expectApiSuccess(createRes, 200, "Conversation retrieved successfully.");
      expect(createRes.body.data.conversation.id).toBe(latestRoom.id);

      const again = await request(app).post("/api/chat").set("Authorization", `Bearer ${token}`).send({});
      expect(again.body.data.conversation.id).toBe(latestRoom.id);
      expect(await prisma.chatRoom.count({ where: { participants: { some: { userId: user.id } } } })).toBe(2);
      expect(olderRoom.id).not.toBe(latestRoom.id);
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

    // Staff share one support inbox: "unread" is the customer's messages no staff member has read.
    it("counts only customers' unread messages for staff - never a colleague's reply", async () => {
      const customer = await createCustomer();
      const moderatorA = await createModerator();
      const moderatorB = await createModerator();
      const owner = await createOwner();
      const room = await createTestChatRoom({ participantIds: [customer.user.id, moderatorB.user.id] });
      await createTestMessage({ chatRoomId: room.id, senderId: customer.user.id, isRead: false });
      await createTestMessage({ chatRoomId: room.id, senderId: moderatorB.user.id, isRead: false }); // unread by the customer, not by staff

      for (const staff of [moderatorA, owner]) {
        const count = await request(app).get('/api/chat/unread/count').set('Authorization', `Bearer ${staff.token}`);
        expect(count.body.data.count).toBe(1);
        const list = await request(app).get('/api/chat').set('Authorization', `Bearer ${staff.token}`);
        const summary = (list.body.data.conversations as Array<{ id: string; unreadCount: number }>).find((c) => c.id === room.id);
        expect(summary?.unreadCount).toBe(1);
      }
    });

    it("listing conversations never marks anything read - only opening one does", async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const room = await createTestChatRoom({ participantIds: [customer.user.id] });
      await createTestMessage({ chatRoomId: room.id, senderId: customer.user.id, isRead: false });

      await request(app).get('/api/chat').set('Authorization', `Bearer ${moderator.token}`);
      await request(app).get(`/api/chat/${room.id}`).set('Authorization', `Bearer ${moderator.token}`);
      const stillUnread = await request(app).get('/api/chat/unread/count').set('Authorization', `Bearer ${moderator.token}`);
      expect(stillUnread.body.data.count).toBe(1);

      await request(app).get(`/api/chat/${room.id}/messages`).set('Authorization', `Bearer ${moderator.token}`);
      const cleared = await request(app).get('/api/chat/unread/count').set('Authorization', `Bearer ${moderator.token}`);
      expect(cleared.body.data.count).toBe(0);
    });

    it("staff opening a conversation reads the customer's messages but leaves a colleague's reply unread for the customer", async () => {
      const customer = await createCustomer();
      const moderatorA = await createModerator();
      const moderatorB = await createModerator();
      const room = await createTestChatRoom({ participantIds: [customer.user.id, moderatorB.user.id] });
      const fromCustomer = await createTestMessage({ chatRoomId: room.id, senderId: customer.user.id, isRead: false });
      const fromColleague = await createTestMessage({ chatRoomId: room.id, senderId: moderatorB.user.id, isRead: false });

      const opened = await request(app).get(`/api/chat/${room.id}/messages`).set('Authorization', `Bearer ${moderatorA.token}`);
      expectApiSuccess(opened, 200);

      expect((await prisma.message.findUnique({ where: { id: fromCustomer.id } }))?.isRead).toBe(true);
      expect((await prisma.message.findUnique({ where: { id: fromColleague.id } }))?.isRead).toBe(false);
      const customerCount = await request(app).get('/api/chat/unread/count').set('Authorization', `Bearer ${customer.token}`);
      expect(customerCount.body.data.count).toBe(1);
    });

    it('clears the unread state for the OWNER once the owner opens the conversation', async () => {
      const customer = await createCustomer();
      const owner = await createOwner();
      const room = await createTestChatRoom({ participantIds: [customer.user.id] });
      await createTestMessage({ chatRoomId: room.id, senderId: customer.user.id, isRead: false });

      await request(app).get(`/api/chat/${room.id}/messages`).set('Authorization', `Bearer ${owner.token}`);

      const count = await request(app).get('/api/chat/unread/count').set('Authorization', `Bearer ${owner.token}`);
      expect(count.body.data.count).toBe(0);
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

  // ================================================================
  // STAFF INBOX: PIN AND ARCHIVE
  // ================================================================
  describe('Pin and archive', () => {
    const listIds = async (token: string, query: Record<string, string> = {}): Promise<string[]> => {
      const response = await request(app).get('/api/chat').set('Authorization', `Bearer ${token}`).query(query);
      expect(response.status).toBe(200);
      return (response.body.data.conversations as Array<{ id: string }>).map((c) => c.id);
    };
    const pin = (token: string, id: string, pinned: boolean) => request(app).patch(`/api/chat/${id}/pin`).set('Authorization', `Bearer ${token}`).send({ pinned });
    const archive = (token: string, id: string, archived: boolean) => request(app).patch(`/api/chat/${id}/archive`).set('Authorization', `Bearer ${token}`).send({ archived });

    it('lists a pinned conversation first without counting as activity, and unpins it', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const older = await createTestChatRoom({ participantIds: [customer.user.id] });
      const newer = await createTestChatRoom({ participantIds: [customer.user.id] });
      await prisma.chatRoom.update({ where: { id: older.id }, data: { updatedAt: new Date('2026-01-01T00:00:00Z') } });

      expectApiSuccess(await pin(moderator.token, older.id, true), 200, 'Conversation pinned.');

      expect((await listIds(moderator.token)).slice(0, 2)).toEqual([older.id, newer.id]);
      expect((await prisma.chatRoom.findUnique({ where: { id: older.id } }))?.updatedAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');

      expectApiSuccess(await pin(moderator.token, older.id, false), 200, 'Conversation unpinned.');
      expect((await listIds(moderator.token)).slice(0, 2)).toEqual([newer.id, older.id]);
    });

    it('moves an archived conversation to the Archived list, dropping its pin, and back', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const room = await createTestChatRoom({ participantIds: [customer.user.id] });
      await pin(moderator.token, room.id, true);

      expectApiSuccess(await archive(moderator.token, room.id, true), 200, 'Conversation archived.');

      expect(await listIds(moderator.token)).not.toContain(room.id);
      expect(await listIds(moderator.token, { archived: 'true' })).toContain(room.id);
      expect((await prisma.chatRoom.findUnique({ where: { id: room.id } }))?.pinnedAt).toBeNull();

      expectApiSuccess(await archive(moderator.token, room.id, false), 200, 'Conversation moved back to the inbox.');
      expect(await listIds(moderator.token)).toContain(room.id);
      expect(await listIds(moderator.token, { archived: 'true' })).not.toContain(room.id);
    });

    it('refuses to pin an archived conversation', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const room = await createTestChatRoom({ participantIds: [customer.user.id] });
      await archive(moderator.token, room.id, true);

      expectApiError(await pin(moderator.token, room.id, true), 400);
      expect((await prisma.chatRoom.findUnique({ where: { id: room.id } }))?.pinnedAt).toBeNull();
    });

    it('brings an archived conversation back when the customer writes, but not when a moderator does', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const room = await createTestChatRoom({ participantIds: [customer.user.id] });
      await archive(moderator.token, room.id, true);

      await request(app).post(`/api/chat/${room.id}/messages`).set('Authorization', `Bearer ${moderator.token}`).send({ content: 'Closing this one.' });
      expect((await prisma.chatRoom.findUnique({ where: { id: room.id } }))?.archivedAt).not.toBeNull();

      await request(app).post(`/api/chat/${room.id}/messages`).set('Authorization', `Bearer ${customer.token}`).send({ content: 'One more question.' });
      expect((await prisma.chatRoom.findUnique({ where: { id: room.id } }))?.archivedAt).toBeNull();
      expect(await listIds(moderator.token)).toContain(room.id);
    });

    it('leaves an archived conversation out of the staff unread count', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const room = await createTestChatRoom({ participantIds: [customer.user.id] });
      await createTestMessage({ chatRoomId: room.id, senderId: customer.user.id, content: 'Hello' });
      const unread = async (): Promise<number> => {
        const response = await request(app).get('/api/chat/unread/count').set('Authorization', `Bearer ${moderator.token}`);
        return response.body.data.count ?? response.body.data.unreadCount ?? response.body.data;
      };

      expect(await unread()).toBe(1);
      await archive(moderator.token, room.id, true);
      expect(await unread()).toBe(0);
    });

    it('never shows a customer the inbox state, and an archived conversation stays in their list', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const room = await createTestChatRoom({ participantIds: [customer.user.id] });
      await archive(moderator.token, room.id, true);

      const list = await request(app).get('/api/chat').set('Authorization', `Bearer ${customer.token}`).query({ archived: 'false' });
      const entry = (list.body.data.conversations as Array<Record<string, unknown>>).find((c) => c.id === room.id);
      expect(entry).toBeDefined();
      expect(entry).not.toHaveProperty('archivedAt');
      expect(entry).not.toHaveProperty('pinnedAt');

      const single = await request(app).get(`/api/chat/${room.id}`).set('Authorization', `Bearer ${customer.token}`);
      expect(single.body.data.conversation).not.toHaveProperty('archivedAt');
    });

    it('is MODERATOR only: an OWNER and a CUSTOMER get 403 and nothing changes', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const room = await createTestChatRoom({ participantIds: [customer.user.id] });

      for (const token of [owner.token, customer.token]) {
        expectApiError(await pin(token, room.id, true), 403);
        expectApiError(await archive(token, room.id, true), 403);
      }
      const dbRoom = await prisma.chatRoom.findUnique({ where: { id: room.id } });
      expect(dbRoom?.pinnedAt).toBeNull();
      expect(dbRoom?.archivedAt).toBeNull();
    });

    it('returns 404 for a nonexistent conversation', async () => {
      const moderator = await createModerator();
      const missing = '00000000-0000-0000-0000-000000000000';
      expectApiError(await pin(moderator.token, missing, true), 404);
      expectApiError(await archive(moderator.token, missing, true), 404);
    });
  });
});
