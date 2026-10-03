import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import { authHeader, createModerator, createOwner } from '../helpers/factories';
import app from '../helpers/testApp';

const login = (email: string, password: string) => request(app).post('/api/auth/login').send({ email, password });

describe('Restrict and unrestrict an account (OWNER)', () => {
  it('a restricted moderator can sign in again once unrestricted', async () => {
    const owner = await createOwner();
    const moderator = await createModerator();

    const restrict = await request(app).delete(`/api/users/${moderator.user.id}`).set(authHeader(owner.token));
    expect(restrict.status).toBe(200);
    expect((await login(moderator.user.email, moderator.password)).status).toBe(403);

    const unrestrict = await request(app).patch(`/api/users/${moderator.user.id}/reactivate`).set(authHeader(owner.token));
    expect(unrestrict.status).toBe(200);
    expect(unrestrict.body.data.user.isActive).toBe(true);
    expect((await prisma.user.findUnique({ where: { id: moderator.user.id } }))?.isActive).toBe(true);

    expect((await login(moderator.user.email, moderator.password)).status).toBe(200);
  });

  it('only an OWNER can unrestrict: a MODERATOR gets 403 and the account stays restricted', async () => {
    const moderator = await createModerator();
    const restricted = await createModerator({ isActive: false });

    const response = await request(app).patch(`/api/users/${restricted.user.id}/reactivate`).set(authHeader(moderator.token));

    expect(response.status).toBe(403);
    expect((await prisma.user.findUnique({ where: { id: restricted.user.id } }))?.isActive).toBe(false);
  });

  it('returns 404 for an unknown account and 400 for a malformed id', async () => {
    const owner = await createOwner();

    expect((await request(app).patch('/api/users/00000000-0000-4000-8000-000000000000/reactivate').set(authHeader(owner.token))).status).toBe(404);
    expect((await request(app).patch('/api/users/not-a-uuid/reactivate').set(authHeader(owner.token))).status).toBe(400);
  });
});
