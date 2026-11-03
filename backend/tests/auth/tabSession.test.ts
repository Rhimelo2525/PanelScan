import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import { hashRefreshToken } from '../../src/utils/refreshToken';
import { authHeader, createTestRefreshToken, createTestUser } from '../helpers/factories';
import app from '../helpers/testApp';

const tabSession = (accessToken: string | null, refreshToken: string) => {
  const req = request(app).post('/api/auth/session/tab');
  return (accessToken ? req.set(authHeader(accessToken)) : req).send({ refreshToken });
};

describe('POST /api/auth/session/tab (a session for a newly opened tab)', () => {
  it("gives the new tab its own token pair and leaves the open tab's refresh token working", async () => {
    const { user, token } = await createTestUser({ email: 'tab-ok@panelscan.test' });
    const { plainToken, record } = await createTestRefreshToken({ userId: user.id });

    const response = await tabSession(token, plainToken);

    expect(response.status).toBe(200);
    const issued = response.body.data as { token: string; refreshToken: string };
    expect(typeof issued.token).toBe('string');
    expect(issued.refreshToken).not.toBe(plainToken);
    // The open tab's token is not rotated: it stays live, and the new one is a separate, stored-as-hash row.
    expect((await prisma.refreshToken.findUniqueOrThrow({ where: { id: record.id } })).revokedAt).toBeNull();
    const newRow = await prisma.refreshToken.findUnique({ where: { tokenHash: hashRefreshToken(issued.refreshToken) } });
    expect(newRow?.userId).toBe(user.id);

    // Both tabs can now refresh on their own without signing the other out.
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken: plainToken })).status).toBe(200);
    expect((await request(app).post('/api/auth/refresh').send({ refreshToken: issued.refreshToken })).status).toBe(200);
    // And the new access token works.
    expect((await request(app).get('/api/auth/me').set(authHeader(issued.token))).status).toBe(200);
  });

  it('needs the access token as well as the refresh token', async () => {
    const { user } = await createTestUser({ email: 'tab-noauth@panelscan.test' });
    const { plainToken } = await createTestRefreshToken({ userId: user.id });

    expect((await tabSession(null, plainToken)).status).toBe(401);
  });

  it("refuses another user's, a revoked or an expired refresh token, without issuing anything", async () => {
    const { user, token } = await createTestUser({ email: 'tab-caller@panelscan.test' });
    const { user: other } = await createTestUser({ email: 'tab-other@panelscan.test' });
    const othersToken = await createTestRefreshToken({ userId: other.id });
    const revoked = await createTestRefreshToken({ userId: user.id, revokedAt: new Date() });
    const expired = await createTestRefreshToken({ userId: user.id, expiresAt: new Date(Date.now() - 1000) });

    for (const refreshToken of [othersToken.plainToken, revoked.plainToken, expired.plainToken, 'not-a-real-token']) {
      expect((await tabSession(token, refreshToken)).status).toBe(401);
    }
    expect(await prisma.refreshToken.count({ where: { userId: user.id } })).toBe(2);
    expect(await prisma.refreshToken.count({ where: { userId: other.id } })).toBe(1);
  });

  it('refuses a deactivated account', async () => {
    const { user, token } = await createTestUser({ email: 'tab-inactive@panelscan.test' });
    const { plainToken } = await createTestRefreshToken({ userId: user.id });
    await prisma.user.update({ where: { id: user.id }, data: { isActive: false } });

    expect([401, 403]).toContain((await tabSession(token, plainToken)).status);
  });
});
