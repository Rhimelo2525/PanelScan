import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '../../src/config/database';
import { authHeader, createCustomer, createModerator, createOwner, createTestOrder } from '../helpers/factories';
import { mailbox } from '../helpers/mailbox';
import app from '../helpers/testApp';

vi.mock('../../src/utils/mailer', () => ({
  sendMail: (...args: Parameters<typeof mailbox.send>) => mailbox.send(...args),
}));

beforeEach(() => mailbox.reset());

const NEW_PASSWORD = 'P@nelScan2026';

const invite = (token: string, email: string) =>
  request(app).post('/api/users').set(authHeader(token)).send({ firstName: 'Kevin', lastName: 'Santos', email, role: 'MODERATOR' });

const accept = (email: string, code: string, password = NEW_PASSWORD) =>
  request(app).post('/api/auth/accept-staff-invitation').send({ email, code, password, confirmPassword: password });

const login = (email: string, password: string) => request(app).post('/api/auth/login').send({ email, password });

const wrongCodeFor = (code: string): string => (code === '000000' ? '111111' : '000000');

/** Lets the next invitation go out without waiting for the one-minute cooldown. */
const skipCooldown = (userId: string) =>
  prisma.emailVerificationCode.updateMany({ where: { userId }, data: { createdAt: new Date(Date.now() - 5 * 60 * 1000) } });

describe('Inviting a moderator (OWNER)', () => {
  it('creates an inactive account with no password and emails a code and an activation link', async () => {
    const owner = await createOwner();
    const email = 'invite-new@panelscan.test';

    const response = await invite(owner.token, email);

    expect(response.status).toBe(201);
    expect(response.body.data.user).toMatchObject({ email, role: 'MODERATOR', isActive: false, invitationPending: true });
    expect(response.body.data.user).not.toHaveProperty('password');
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user).toMatchObject({ isActive: false, emailVerified: false, password: null });

    const [mail] = mailbox.to(email);
    const code = mailbox.lastCodeFor(email);
    expect(mail?.subject).toBe("You're invited to join the PanelScan team");
    expect(mail?.text).toContain(`/staff/accept-invite?email=${encodeURIComponent(email)}&code=${code}`);
    // Only a keyed hash of the code is stored.
    expect(JSON.stringify(await prisma.emailVerificationCode.findMany({ where: { userId: user.id } }))).not.toContain(code);
    expect(await prisma.activityLog.count({ where: { action: 'STAFF_INVITED', userId: owner.user.id } })).toBe(1);

    const list = await request(app).get('/api/users').set(authHeader(owner.token));
    expect(list.body.data.users.find((row: { email: string }) => row.email === email)).toMatchObject({ invitationPending: true });
  });

  it('the invited person cannot sign in before activating', async () => {
    const owner = await createOwner();
    await invite(owner.token, 'invite-early@panelscan.test');

    const response = await login('invite-early@panelscan.test', NEW_PASSWORD);

    expect(response.status).toBe(403);
    expect(response.body.message).toMatch(/not been activated yet/);
  });

  it('activates with the emailed code and their own password, once', async () => {
    const owner = await createOwner();
    const email = 'invite-accept@panelscan.test';
    await invite(owner.token, email);
    const code = mailbox.lastCodeFor(email);

    expect((await accept(email, wrongCodeFor(code))).status).toBe(400);

    const response = await accept(email, code);
    expect(response.status).toBe(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user).toMatchObject({ isActive: true, emailVerified: true });
    expect(await prisma.emailVerificationCode.count({ where: { userId: user.id } })).toBe(0);
    expect(await prisma.activityLog.count({ where: { action: 'STAFF_INVITATION_ACCEPTED', userId: user.id } })).toBe(1);

    const signIn = await login(email, NEW_PASSWORD);
    expect(signIn.status).toBe(200);
    expect(signIn.body.data.user.role).toBe('MODERATOR');

    // Single use: the same code cannot activate (or reset) anything again.
    expect((await accept(email, code, 'An0ther!Pass99')).status).toBe(400);
  });

  it('refuses an expired code, a mismatched confirmation and a weak password', async () => {
    const owner = await createOwner();
    const email = 'invite-expired@panelscan.test';
    await invite(owner.token, email);
    const code = mailbox.lastCodeFor(email);

    expect((await request(app).post('/api/auth/accept-staff-invitation').send({ email, code, password: NEW_PASSWORD, confirmPassword: 'Different1!' })).status).toBe(400);
    expect((await accept(email, code, 'short')).status).toBe(400);

    await prisma.emailVerificationCode.updateMany({ where: { user: { email } }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await accept(email, code)).status).toBe(400);
    expect((await prisma.user.findUniqueOrThrow({ where: { email } })).isActive).toBe(false);
  });

  it('resend replaces the code (after the cooldown) and the old one stops working', async () => {
    const owner = await createOwner();
    const email = 'invite-resend@panelscan.test';
    const created = await invite(owner.token, email);
    const userId = created.body.data.user.id as string;
    const firstCode = mailbox.lastCodeFor(email);

    expect((await request(app).post(`/api/users/${userId}/resend-invitation`).set(authHeader(owner.token))).status).toBe(429);

    await skipCooldown(userId);
    const resend = await request(app).post(`/api/users/${userId}/resend-invitation`).set(authHeader(owner.token));
    expect(resend.status).toBe(200);
    const secondCode = mailbox.lastCodeFor(email);
    expect(mailbox.to(email)).toHaveLength(2);

    if (secondCode !== firstCode) expect((await accept(email, firstCode)).status).toBe(400);
    expect((await accept(email, secondCode)).status).toBe(200);
    // Nothing left to resend once the account is active.
    expect((await request(app).post(`/api/users/${userId}/resend-invitation`).set(authHeader(owner.token))).status).toBe(409);
  });

  it('keeps no account when the invitation email cannot be sent', async () => {
    const owner = await createOwner();
    mailbox.failing = true;

    const response = await invite(owner.token, 'invite-smtp-down@panelscan.test');

    expect(response.status).toBe(503);
    expect(await prisma.user.findUnique({ where: { email: 'invite-smtp-down@panelscan.test' } })).toBeNull();
  });

  it('only an OWNER can invite or resend', async () => {
    const owner = await createOwner();
    const moderator = await createModerator();
    const created = await invite(owner.token, 'invite-perm@panelscan.test');

    expect((await invite(moderator.token, 'invite-by-mod@panelscan.test')).status).toBe(403);
    expect((await request(app).post(`/api/users/${created.body.data.user.id}/resend-invitation`).set(authHeader(moderator.token))).status).toBe(403);
  });
});

describe('Editing an account (OWNER)', () => {
  const edit = (token: string, id: string, body: Record<string, unknown>) => request(app).patch(`/api/users/${id}`).set(authHeader(token)).send(body);

  it("the owner can change a moderator's name and phone, and clear the phone", async () => {
    const owner = await createOwner();
    const moderator = await createModerator();

    const renamed = await edit(owner.token, moderator.user.id, { firstName: 'Maria Clara', lastName: 'Dela Cruz', phone: '+63 917 123 4567' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.data.user).toMatchObject({ firstName: 'Maria Clara', lastName: 'Dela Cruz', phone: '+639171234567' });

    const cleared = await edit(owner.token, moderator.user.id, { phone: null });
    expect(cleared.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: moderator.user.id } })).phone).toBeNull();
  });

  it('refuses invalid names and phones, and a moderator cannot edit someone else', async () => {
    const owner = await createOwner();
    const moderator = await createModerator();
    const other = await createModerator();

    expect((await edit(owner.token, moderator.user.id, { firstName: 'Juan123' })).status).toBe(400);
    expect((await edit(owner.token, moderator.user.id, { phone: '12345' })).status).toBe(400);
    expect((await edit(moderator.token, other.user.id, { firstName: 'Changed' })).status).toBe(403);
  });
});

describe('Removing an account (OWNER)', () => {
  const remove = (token: string, id: string) => request(app).delete(`/api/users/${id}/permanent`).set(authHeader(token));
  const restrict = (token: string, id: string) => request(app).delete(`/api/users/${id}`).set(authHeader(token));

  it('a restricted account is removed for good: hidden, signed out, unable to sign in, history kept', async () => {
    const owner = await createOwner();
    const customer = await createCustomer();
    const order = await createTestOrder({ customerId: customer.user.id });
    const session = await login(customer.user.email, customer.password);
    expect(session.status).toBe(200);

    expect((await remove(owner.token, customer.user.id)).status).toBe(409); // still active: restrict first
    expect((await restrict(owner.token, customer.user.id)).status).toBe(200);

    const response = await remove(owner.token, customer.user.id);
    expect(response.status).toBe(200);

    const removed = await prisma.user.findUniqueOrThrow({ where: { id: customer.user.id } });
    expect(removed.deletedAt).not.toBeNull();
    expect(removed).toMatchObject({ isActive: false, password: null, googleId: null });
    expect(await prisma.refreshToken.count({ where: { userId: customer.user.id, revokedAt: null } })).toBe(0);
    expect(await prisma.order.findUnique({ where: { id: order.id } })).not.toBeNull();
    expect(await prisma.activityLog.count({ where: { action: 'ACCOUNT_REMOVED', userId: owner.user.id } })).toBe(1);

    const list = await request(app).get('/api/users').set(authHeader(owner.token));
    expect(list.body.data.users.some((row: { id: string }) => row.id === customer.user.id)).toBe(false);
    expect((await login(customer.user.email, customer.password)).status).toBe(401);
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken: session.body.data.refreshToken })).status).toBe(401);
    // It can't be brought back, and its email can't be reused for a staff invitation.
    expect((await request(app).patch(`/api/users/${customer.user.id}/reactivate`).set(authHeader(owner.token))).status).toBe(404);
    expect((await remove(owner.token, customer.user.id)).status).toBe(404);
    expect((await invite(owner.token, customer.user.email)).status).toBe(409);
  });

  it('cancelling a pending invitation deletes it, so the address can be invited again', async () => {
    const owner = await createOwner();
    const email = 'invite-cancel@panelscan.test';
    const created = await invite(owner.token, email);

    expect((await remove(owner.token, created.body.data.user.id)).status).toBe(200);
    expect(await prisma.user.findUnique({ where: { email } })).toBeNull();
    expect(await prisma.activityLog.count({ where: { action: 'STAFF_INVITATION_CANCELLED' } })).toBe(1);

    expect((await invite(owner.token, email)).status).toBe(201);
  });

  it('never removes an owner or yourself, and only an OWNER can remove', async () => {
    const owner = await createOwner();
    const otherOwner = await createOwner({ isActive: false });
    const moderator = await createModerator();
    const restricted = await createModerator({ isActive: false });

    expect((await remove(owner.token, owner.user.id)).status).toBe(400);
    expect((await remove(owner.token, otherOwner.user.id)).status).toBe(403);
    expect((await remove(moderator.token, restricted.user.id)).status).toBe(403);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: restricted.user.id } })).deletedAt).toBeNull();
  });
});
