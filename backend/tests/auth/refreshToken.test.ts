import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import { hashRefreshToken } from '../../src/utils/refreshToken';
import { authHeader, createTestRefreshToken, createTestUser } from '../helpers/factories';
import app from '../helpers/testApp';

describe('Refresh token authentication', () => {
  describe('POST /api/auth/login (refresh token issuance)', () => {
    it('returns both an access token and a refresh token', async () => {
      const { user, password } = await createTestUser({ email: 'rt-login@panelscan.test' });

      const response = await request(app).post('/api/auth/login').send({ email: user.email, password });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(typeof response.body.data.token).toBe('string');
      expect(typeof response.body.data.refreshToken).toBe('string');
    });

    it('persists only a hash of the refresh token, never the plaintext', async () => {
      const { user, password } = await createTestUser({ email: 'rt-hash@panelscan.test' });

      const response = await request(app).post('/api/auth/login').send({ email: user.email, password });
      const plainToken = response.body.data.refreshToken as string;

      const row = await prisma.refreshToken.findFirst({ where: { userId: user.id } });
      expect(row).not.toBeNull();
      expect(row?.tokenHash).not.toBe(plainToken);
      expect(row?.tokenHash).toBe(hashRefreshToken(plainToken));

      const rawRows = await prisma.refreshToken.findMany({ where: { userId: user.id } });
      for (const r of rawRows) {
        expect(r.tokenHash).not.toBe(plainToken);
      }
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('issues a new access token and a new refresh token for a valid refresh token', async () => {
      const { user } = await createTestUser({ email: 'rt-refresh-ok@panelscan.test' });
      const { plainToken } = await createTestRefreshToken({ userId: user.id });

      const response = await request(app).post('/api/auth/refresh').send({ refreshToken: plainToken });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(typeof response.body.data.token).toBe('string');
      expect(typeof response.body.data.refreshToken).toBe('string');
      expect(response.body.data.refreshToken).not.toBe(plainToken);
    });

    it('rotates the token: the old refresh token row is revoked and a new row is created', async () => {
      const { user } = await createTestUser({ email: 'rt-rotate@panelscan.test' });
      const { plainToken, record } = await createTestRefreshToken({ userId: user.id });

      const before = await prisma.refreshToken.count({ where: { userId: user.id } });
      expect(before).toBe(1);

      const response = await request(app).post('/api/auth/refresh').send({ refreshToken: plainToken });
      expect(response.status).toBe(200);

      const oldRow = await prisma.refreshToken.findUnique({ where: { id: record.id } });
      expect(oldRow?.revokedAt).not.toBeNull();

      const allRows = await prisma.refreshToken.findMany({ where: { userId: user.id } });
      expect(allRows.length).toBe(2);

      const newRow = allRows.find((r) => r.id !== record.id);
      expect(newRow).toBeDefined();
      expect(newRow?.revokedAt).toBeNull();
      expect(newRow?.tokenHash).toBe(hashRefreshToken(response.body.data.refreshToken));
    });

    it('rejects the old refresh token once it has been rotated (replay protection)', async () => {
      const { user } = await createTestUser({ email: 'rt-replay@panelscan.test' });
      const { plainToken } = await createTestRefreshToken({ userId: user.id });

      const first = await request(app).post('/api/auth/refresh').send({ refreshToken: plainToken });
      expect(first.status).toBe(200);

      const replay = await request(app).post('/api/auth/refresh').send({ refreshToken: plainToken });
      expect(replay.status).toBe(401);
      expect(replay.body.success).toBe(false);
      expect(replay.body.message).toMatch(/revoked/i);
    });

    it('rejects an expired refresh token and leaves the database row unchanged', async () => {
      const { user } = await createTestUser({ email: 'rt-expired@panelscan.test' });
      const { plainToken, record } = await createTestRefreshToken({
        userId: user.id,
        expiresAt: new Date(Date.now() - 60 * 1000),
      });

      const response = await request(app).post('/api/auth/refresh').send({ refreshToken: plainToken });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/expired/i);

      const row = await prisma.refreshToken.findUnique({ where: { id: record.id } });
      expect(row?.revokedAt).toBeNull();
      expect(row?.expiresAt.getTime()).toBe(record.expiresAt.getTime());
    });

    it('rejects an already-revoked refresh token', async () => {
      const { user } = await createTestUser({ email: 'rt-revoked@panelscan.test' });
      const { plainToken } = await createTestRefreshToken({ userId: user.id, revokedAt: new Date() });

      const response = await request(app).post('/api/auth/refresh').send({ refreshToken: plainToken });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/revoked/i);
    });

    it('rejects a tampered/unknown refresh token and creates no rows', async () => {
      const beforeCount = await prisma.refreshToken.count();

      const response = await request(app).post('/api/auth/refresh').send({ refreshToken: 'not-a-real-token-at-all' });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toMatch(/invalid/i);

      const afterCount = await prisma.refreshToken.count();
      expect(afterCount).toBe(beforeCount);
    });

    it('rejects a refresh token whose signature/characters were altered', async () => {
      const { user } = await createTestUser({ email: 'rt-tampered@panelscan.test' });
      const { plainToken } = await createTestRefreshToken({ userId: user.id });
      const tampered = `${plainToken.slice(0, -1)}${plainToken.at(-1) === 'a' ? 'b' : 'a'}`;

      const response = await request(app).post('/api/auth/refresh').send({ refreshToken: tampered });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('rejects a missing refreshToken field with a validation error', async () => {
      const response = await request(app).post('/api/auth/refresh').send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Validation failed.');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('requires authentication', async () => {
      const response = await request(app).post('/api/auth/logout').send({ refreshToken: 'whatever' });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('revokes exactly the supplied refresh token', async () => {
      const { user, token } = await createTestUser({ email: 'rt-logout@panelscan.test' });
      const { plainToken, record } = await createTestRefreshToken({ userId: user.id });

      const response = await request(app).post('/api/auth/logout').set(authHeader(token)).send({ refreshToken: plainToken });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const row = await prisma.refreshToken.findUnique({ where: { id: record.id } });
      expect(row?.revokedAt).not.toBeNull();
    });

    it('rejects refresh attempts after logout', async () => {
      const { user, token } = await createTestUser({ email: 'rt-logout-then-refresh@panelscan.test' });
      const { plainToken } = await createTestRefreshToken({ userId: user.id });

      const logoutResponse = await request(app).post('/api/auth/logout').set(authHeader(token)).send({ refreshToken: plainToken });
      expect(logoutResponse.status).toBe(200);

      const refreshResponse = await request(app).post('/api/auth/refresh').send({ refreshToken: plainToken });
      expect(refreshResponse.status).toBe(401);
      expect(refreshResponse.body.message).toMatch(/revoked/i);
    });

    it('returns 404 for an unknown refresh token and leaves the database unchanged', async () => {
      const { token } = await createTestUser({ email: 'rt-logout-unknown@panelscan.test' });
      const beforeCount = await prisma.refreshToken.count();

      const response = await request(app).post('/api/auth/logout').set(authHeader(token)).send({ refreshToken: 'no-such-token' });

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);

      const afterCount = await prisma.refreshToken.count();
      expect(afterCount).toBe(beforeCount);
    });

    it("returns 404 when a user tries to log out with another user's refresh token", async () => {
      const owner = await createTestUser({ email: 'rt-logout-owner@panelscan.test' });
      const attacker = await createTestUser({ email: 'rt-logout-attacker@panelscan.test' });
      const { plainToken, record } = await createTestRefreshToken({ userId: owner.user.id });

      const response = await request(app)
        .post('/api/auth/logout')
        .set(authHeader(attacker.token))
        .send({ refreshToken: plainToken });

      expect(response.status).toBe(404);

      const row = await prisma.refreshToken.findUnique({ where: { id: record.id } });
      expect(row?.revokedAt).toBeNull();
    });
  });

  describe('Multiple devices', () => {
    it('issues independent refresh tokens per login, and revoking one does not revoke the other', async () => {
      const { user, token } = await createTestUser({ email: 'rt-multi-device@panelscan.test' });
      const deviceA = await createTestRefreshToken({ userId: user.id });
      const deviceB = await createTestRefreshToken({ userId: user.id });

      expect(deviceA.plainToken).not.toBe(deviceB.plainToken);

      const logoutResponse = await request(app)
        .post('/api/auth/logout')
        .set(authHeader(token))
        .send({ refreshToken: deviceA.plainToken });
      expect(logoutResponse.status).toBe(200);

      const rowA = await prisma.refreshToken.findUnique({ where: { id: deviceA.record.id } });
      const rowB = await prisma.refreshToken.findUnique({ where: { id: deviceB.record.id } });
      expect(rowA?.revokedAt).not.toBeNull();
      expect(rowB?.revokedAt).toBeNull();

      const refreshB = await request(app).post('/api/auth/refresh').send({ refreshToken: deviceB.plainToken });
      expect(refreshB.status).toBe(200);

      const refreshA = await request(app).post('/api/auth/refresh').send({ refreshToken: deviceA.plainToken });
      expect(refreshA.status).toBe(401);
    });
  });
});
