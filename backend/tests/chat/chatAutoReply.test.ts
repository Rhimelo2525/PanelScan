import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import { AUTO_REPLY_QUIET_MS, autoReplyMessage } from '../../src/modules/chat/chat.service';
import { createCustomer, createModerator, createOwner, createTestChatRoom, createTestMessage } from '../helpers/factories';
import app from '../helpers/testApp';

const send = (token: string, roomId: string, content: string) =>
  request(app).post(`/api/chat/${roomId}/messages`).set('Authorization', `Bearer ${token}`).send({ content });
const autoReplies = (chatRoomId: string) => prisma.message.findMany({ where: { chatRoomId, senderId: null }, orderBy: { createdAt: 'asc' } });

describe('Support chat - one conversation per customer', () => {
  it('the first open creates the conversation; every later open returns the same one', async () => {
    const { token, user } = await createCustomer();

    const first = await request(app).post('/api/chat').set('Authorization', `Bearer ${token}`).send({});
    expect(first.status).toBe(201);
    const second = await request(app).post('/api/chat').set('Authorization', `Bearer ${token}`).send({});
    expect(second.status).toBe(200);

    expect(second.body.data.conversation.id).toBe(first.body.data.conversation.id);
    expect(await prisma.chatRoom.count({ where: { participants: { some: { userId: user.id } } } })).toBe(1);
  });

  it("customers never share a conversation", async () => {
    const a = await createCustomer();
    const b = await createCustomer();

    const roomA = (await request(app).post('/api/chat').set('Authorization', `Bearer ${a.token}`).send({})).body.data.conversation.id;
    const roomB = (await request(app).post('/api/chat').set('Authorization', `Bearer ${b.token}`).send({})).body.data.conversation.id;

    expect(roomA).not.toBe(roomB);
  });
});

describe('Support chat - automated reply', () => {
  it("answers a customer's first message once, after it, addressed to them by name", async () => {
    const { token, user } = await createCustomer({ firstName: 'Clarisse' });
    const room = await createTestChatRoom({ participantIds: [user.id] });

    expect((await send(token, room.id, 'Hi')).status).toBe(201);

    const replies = await autoReplies(room.id);
    expect(replies).toHaveLength(1);
    expect(replies[0]?.content).toBe(autoReplyMessage('Clarisse'));
    expect(replies[0]?.content).toContain('Hi Clarisse!');
    const thread = await prisma.message.findMany({ where: { chatRoomId: room.id }, orderBy: { createdAt: 'asc' } });
    expect(thread.map((m) => m.senderId)).toEqual([user.id, null]);
  });

  it('does not repeat for the following messages while the team has not answered yet', async () => {
    const { token, user } = await createCustomer();
    const room = await createTestChatRoom({ participantIds: [user.id] });

    for (const content of ['Hi', 'Hello', 'Anyone there?']) await send(token, room.id, content);

    expect(await autoReplies(room.id)).toHaveLength(1);
  });

  it('stays silent while a moderator is in the conversation', async () => {
    const { token, user } = await createCustomer();
    const moderator = await createModerator();
    const room = await createTestChatRoom({ participantIds: [user.id] });
    await send(moderator.token, room.id, 'Hello! How can I help?');

    await send(token, room.id, 'I need ceiling panels.');

    expect(await autoReplies(room.id)).toHaveLength(0);
  });

  it('answers once again when the customer comes back after the team has been quiet for a long time', async () => {
    const { token, user } = await createCustomer();
    const moderator = await createModerator();
    const room = await createTestChatRoom({ participantIds: [user.id] });
    const old = await createTestMessage({ chatRoomId: room.id, senderId: moderator.user.id, content: 'Old answer' });
    await prisma.message.update({ where: { id: old.id }, data: { createdAt: new Date(Date.now() - AUTO_REPLY_QUIET_MS - 60_000) } });

    await send(token, room.id, 'Back with another question');
    await send(token, room.id, 'And one more');

    expect(await autoReplies(room.id)).toHaveLength(1);
  });

  it('never answers staff messages', async () => {
    const moderator = await createModerator();
    const { user } = await createCustomer();
    const room = await createTestChatRoom({ participantIds: [user.id] });

    await send(moderator.token, room.id, 'Following up on your order.');

    expect(await autoReplies(room.id)).toHaveLength(0);
  });

  it('is unread for the customer until they open the chat, and never unread for staff', async () => {
    const customer = await createCustomer();
    const moderator = await createModerator();
    const room = await createTestChatRoom({ participantIds: [customer.user.id] });
    await send(customer.token, room.id, 'Hi');

    const count = async (token: string) => (await request(app).get('/api/chat/unread/count').set('Authorization', `Bearer ${token}`)).body.data.count;
    expect(await count(customer.token)).toBe(1);
    // Staff see the customer's message as unread, not the automated reply.
    expect(await count(moderator.token)).toBe(1);

    await request(app).get(`/api/chat/${room.id}/messages`).set('Authorization', `Bearer ${customer.token}`);
    expect(await count(customer.token)).toBe(0);
  });

  it('shows in the thread as a message with no sender, which nobody can delete as their own', async () => {
    const customer = await createCustomer();
    const room = await createTestChatRoom({ participantIds: [customer.user.id] });
    await send(customer.token, room.id, 'Hi');

    const thread = await request(app).get(`/api/chat/${room.id}/messages`).query({ sort: 'asc' }).set('Authorization', `Bearer ${customer.token}`);
    const reply = (thread.body.data.messages as Array<{ id: string; senderId: string | null; sender: unknown }>).at(-1);
    expect(reply?.senderId).toBeNull();
    expect(reply?.sender).toBeNull();

    expect((await request(app).delete(`/api/chat/messages/${reply?.id}`).set('Authorization', `Bearer ${customer.token}`)).status).toBe(403);
  });

  it('moderators are still notified of the first customer message', async () => {
    const customer = await createCustomer();
    const moderator = await createModerator();
    await createOwner();
    const room = await createTestChatRoom({ participantIds: [customer.user.id] });

    await send(customer.token, room.id, 'Hi');

    const notification = await prisma.notification.findFirst({ where: { userId: moderator.user.id, title: 'New customer message' } });
    expect(notification?.message).toContain('Hi');
  });
});

describe('Support chat - sending while the chat is being read', () => {
  it('messages sent while the same chat is being opened all go through (no write-conflict errors)', async () => {
    const customer = await createCustomer();
    const moderator = await createModerator();
    const room = await createTestChatRoom({ participantIds: [customer.user.id] });
    const read = (token: string) => request(app).get(`/api/chat/${room.id}/messages`).set('Authorization', `Bearer ${token}`);

    const responses = await Promise.all([
      send(customer.token, room.id, 'one'),
      read(customer.token),
      read(moderator.token),
      send(customer.token, room.id, 'two'),
      read(customer.token),
      send(moderator.token, room.id, 'reply'),
      read(moderator.token),
      send(customer.token, room.id, 'three'),
    ]);

    expect(responses.map((r) => r.status).filter((status) => status >= 500)).toEqual([]);
    const contents = (await prisma.message.findMany({ where: { chatRoomId: room.id, senderId: { not: null } } })).map((m) => m.content).sort();
    expect(contents).toEqual(['one', 'reply', 'three', 'two']);
    expect((await autoReplies(room.id)).length).toBeLessThanOrEqual(1);
  });
});
