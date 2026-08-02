import { NotificationType, RequestStatus, RequestType } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import { createCustomer, createModerator, createOwner, createTestRequest } from '../helpers/factories';
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

describe('Request Approval module', () => {
  // ================================================================
  // AUTHENTICATION
  // ================================================================
  describe('Authentication', () => {
    it('returns 401 for a request without a JWT', async () => {
      const response = await request(app).get('/api/requests');
      expectApiError(response, 401);
    });

    it('returns 401 for a malformed JWT', async () => {
      const response = await request(app).get('/api/requests').set('Authorization', 'Bearer not-a-real-token');
      expectApiError(response, 401);
    });
  });

  // ================================================================
  // AUTHORIZATION - CUSTOMER HAS NO ACCESS ANYWHERE
  // ================================================================
  describe('Authorization - CUSTOMER has no access', () => {
    it('returns 403 for a CUSTOMER on every endpoint in this module', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const req = await createTestRequest({ requestedById: moderator.user.id });

      const attempts = [
        request(app).post('/api/requests').set('Authorization', `Bearer ${customer.token}`).send({ type: RequestType.OTHER, title: 'Should fail' }),
        request(app).get('/api/requests').set('Authorization', `Bearer ${customer.token}`),
        request(app).get(`/api/requests/${req.id}`).set('Authorization', `Bearer ${customer.token}`),
        request(app).patch(`/api/requests/${req.id}`).set('Authorization', `Bearer ${customer.token}`).send({ title: 'Should not update' }),
        request(app).patch(`/api/requests/${req.id}/approve`).set('Authorization', `Bearer ${customer.token}`).send({}),
        request(app).patch(`/api/requests/${req.id}/reject`).set('Authorization', `Bearer ${customer.token}`).send({}),
        request(app).patch(`/api/requests/${req.id}/cancel`).set('Authorization', `Bearer ${customer.token}`),
        request(app).delete(`/api/requests/${req.id}`).set('Authorization', `Bearer ${customer.token}`),
      ];

      for (const attempt of attempts) {
        const response = await attempt;
        expectApiError(response, 403);
      }

      const dbRequest = await prisma.request.findUnique({ where: { id: req.id } });
      expect(dbRequest?.status).toBe(RequestStatus.PENDING);
    });
  });

  // ================================================================
  // POST /api/requests (create)
  // ================================================================
  describe('POST /api/requests', () => {
    it('lets a MODERATOR create a request, verified in the database', async () => {
      const moderator = await createModerator();

      const response = await request(app)
        .post('/api/requests')
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ type: RequestType.INVENTORY_RESTOCK, title: 'Restock cladding panels', description: 'Down to 3 units.' });

      expectApiSuccess(response, 201, 'Request submitted successfully.');
      expect(response.body.data.request.status).toBe(RequestStatus.PENDING);

      const dbRequest = await prisma.request.findUnique({ where: { id: response.body.data.request.id } });
      expect(dbRequest).not.toBeNull();
      expect(dbRequest?.requestedById).toBe(moderator.user.id);
      expect(dbRequest?.reviewedById).toBeNull();
      expect(dbRequest?.status).toBe(RequestStatus.PENDING);
      expect(dbRequest?.type).toBe(RequestType.INVENTORY_RESTOCK);
      expect(dbRequest?.createdAt).toBeInstanceOf(Date);
    });

    it('rejects an OWNER creating a request with 403 - creation is MODERATOR-only', async () => {
      const owner = await createOwner();

      const response = await request(app)
        .post('/api/requests')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ type: RequestType.OTHER, title: 'Owner should not create this' });

      expectApiError(response, 403);

      const count = await prisma.request.count({ where: { title: 'Owner should not create this' } });
      expect(count).toBe(0);
    });

    it('rejects an invalid request type with 400', async () => {
      const moderator = await createModerator();

      const response = await request(app)
        .post('/api/requests')
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ type: 'NOT_A_REAL_TYPE', title: 'Invalid Type Request' });

      expectApiError(response, 400, 'Validation failed.');
    });

    it('rejects a title below the minimum length with 400', async () => {
      const moderator = await createModerator();

      const response = await request(app)
        .post('/api/requests')
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ type: RequestType.OTHER, title: 'AB' });

      expectApiError(response, 400, 'Validation failed.');
    });

    it('rejects a title over the maximum length with 400', async () => {
      const moderator = await createModerator();

      const response = await request(app)
        .post('/api/requests')
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ type: RequestType.OTHER, title: 'a'.repeat(151) });

      expectApiError(response, 400, 'Validation failed.');
    });

    it('rejects a description over the maximum length with 400', async () => {
      const moderator = await createModerator();

      const response = await request(app)
        .post('/api/requests')
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ type: RequestType.OTHER, title: 'Valid Title', description: 'a'.repeat(2001) });

      expectApiError(response, 400, 'Validation failed.');
    });

    it.each([
      RequestType.INVENTORY_RESTOCK,
      RequestType.REFUND,
      RequestType.DISCOUNT_APPROVAL,
      RequestType.PROJECT_BUDGET_CHANGE,
      RequestType.OTHER,
    ])('supports request type %s', async (type) => {
      const moderator = await createModerator();

      const response = await request(app)
        .post('/api/requests')
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ type, title: `Request of type ${type}` });

      expectApiSuccess(response, 201);
      expect(response.body.data.request.type).toBe(type);
    });
  });

  // ================================================================
  // AUTOMATIC NOTIFICATIONS
  // ================================================================
  describe('Automatic notifications - Request', () => {
    it('notifies every active OWNER when a moderator submits a request, but not an inactive owner or other moderators', async () => {
      const moderator = await createModerator();
      const owner = await createOwner();
      const inactiveOwner = await createOwner({ isActive: false });
      const otherModerator = await createModerator();

      const response = await request(app)
        .post('/api/requests')
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ type: RequestType.REFUND, title: 'Refund for damaged panel' });

      expectApiSuccess(response, 201);
      const requestId = response.body.data.request.id as string;

      const ownerNotification = await prisma.notification.findFirst({
        where: { userId: owner.user.id, type: NotificationType.SYSTEM, title: 'New request submitted' },
      });
      expect(ownerNotification).not.toBeNull();
      expect((ownerNotification?.metadata as { requestId?: string; event?: string } | null)?.requestId).toBe(requestId);
      expect((ownerNotification?.metadata as { event?: string } | null)?.event).toBe('REQUEST_SUBMITTED');

      const inactiveOwnerNotification = await prisma.notification.findFirst({ where: { userId: inactiveOwner.user.id } });
      expect(inactiveOwnerNotification).toBeNull();

      const otherModeratorNotification = await prisma.notification.findFirst({ where: { userId: otherModerator.user.id } });
      expect(otherModeratorNotification).toBeNull();
    });

    it('notifies the requesting moderator when an owner approves the request', async () => {
      const moderator = await createModerator();
      const owner = await createOwner();
      const req = await createTestRequest({ requestedById: moderator.user.id });

      const response = await request(app).patch(`/api/requests/${req.id}/approve`).set('Authorization', `Bearer ${owner.token}`).send({});
      expectApiSuccess(response, 200);

      const notification = await prisma.notification.findFirst({
        where: { userId: moderator.user.id, type: NotificationType.SYSTEM, title: 'Request approved' },
      });
      expect(notification).not.toBeNull();
      expect((notification?.metadata as { event?: string } | null)?.event).toBe('REQUEST_APPROVED');
    });

    it('notifies the requesting moderator when an owner rejects the request', async () => {
      const moderator = await createModerator();
      const owner = await createOwner();
      const req = await createTestRequest({ requestedById: moderator.user.id });

      const response = await request(app).patch(`/api/requests/${req.id}/reject`).set('Authorization', `Bearer ${owner.token}`).send({});
      expectApiSuccess(response, 200);

      const notification = await prisma.notification.findFirst({
        where: { userId: moderator.user.id, type: NotificationType.SYSTEM, title: 'Request rejected' },
      });
      expect(notification).not.toBeNull();
      expect((notification?.metadata as { event?: string } | null)?.event).toBe('REQUEST_REJECTED');
    });

    it('notifies every active OWNER when a moderator cancels their request', async () => {
      const moderator = await createModerator();
      const owner = await createOwner();
      const req = await createTestRequest({ requestedById: moderator.user.id });

      const response = await request(app).patch(`/api/requests/${req.id}/cancel`).set('Authorization', `Bearer ${moderator.token}`);
      expectApiSuccess(response, 200);

      const notification = await prisma.notification.findFirst({
        where: { userId: owner.user.id, type: NotificationType.SYSTEM, title: 'Request cancelled' },
      });
      expect(notification).not.toBeNull();
      expect((notification?.metadata as { event?: string } | null)?.event).toBe('REQUEST_CANCELLED');
    });
  });

  // ================================================================
  // GET /api/requests (list, filter, search, pagination, sorting)
  // ================================================================
  describe('GET /api/requests', () => {
    it('lets an OWNER view every request across moderators', async () => {
      const owner = await createOwner();
      const moderatorA = await createModerator();
      const moderatorB = await createModerator();
      await createTestRequest({ requestedById: moderatorA.user.id });
      await createTestRequest({ requestedById: moderatorB.user.id });

      const response = await request(app).get('/api/requests').set('Authorization', `Bearer ${owner.token}`);

      expectApiSuccess(response, 200, 'Requests retrieved successfully.');
      expect(response.body.data.requests.length).toBeGreaterThanOrEqual(2);
    });

    it("scopes a MODERATOR to their own requests only, confirmed against the database", async () => {
      const moderatorA = await createModerator();
      const moderatorB = await createModerator();
      const ownRequest = await createTestRequest({ requestedById: moderatorA.user.id });
      const otherRequest = await createTestRequest({ requestedById: moderatorB.user.id });

      const response = await request(app).get('/api/requests').set('Authorization', `Bearer ${moderatorA.token}`);

      expectApiSuccess(response, 200);
      const ids = (response.body.data.requests as Array<{ id: string }>).map((r) => r.id);
      expect(ids).toContain(ownRequest.id);
      expect(ids).not.toContain(otherRequest.id);

      const dbOther = await prisma.request.findUnique({ where: { id: otherRequest.id } });
      expect(dbOther).not.toBeNull();
    });

    it('filters by status', async () => {
      const owner = await createOwner();
      const moderator = await createModerator();
      const approved = await createTestRequest({ requestedById: moderator.user.id, status: RequestStatus.APPROVED });
      await createTestRequest({ requestedById: moderator.user.id, status: RequestStatus.PENDING });

      const response = await request(app).get('/api/requests').set('Authorization', `Bearer ${owner.token}`).query({ status: RequestStatus.APPROVED });

      expectApiSuccess(response, 200);
      const ids = (response.body.data.requests as Array<{ id: string }>).map((r) => r.id);
      expect(ids).toContain(approved.id);
      expect((response.body.data.requests as Array<{ status: string }>).every((r) => r.status === RequestStatus.APPROVED)).toBe(true);
    });

    it('filters by request type', async () => {
      const owner = await createOwner();
      const moderator = await createModerator();
      const refund = await createTestRequest({ requestedById: moderator.user.id, type: RequestType.REFUND });
      await createTestRequest({ requestedById: moderator.user.id, type: RequestType.OTHER });

      const response = await request(app).get('/api/requests').set('Authorization', `Bearer ${owner.token}`).query({ type: RequestType.REFUND });

      expectApiSuccess(response, 200);
      const ids = (response.body.data.requests as Array<{ id: string }>).map((r) => r.id);
      expect(ids).toEqual([refund.id]);
    });

    it('filters by requestedById (OWNER)', async () => {
      const owner = await createOwner();
      const moderatorA = await createModerator();
      const moderatorB = await createModerator();
      const requestA = await createTestRequest({ requestedById: moderatorA.user.id });
      await createTestRequest({ requestedById: moderatorB.user.id });

      const response = await request(app)
        .get('/api/requests')
        .set('Authorization', `Bearer ${owner.token}`)
        .query({ requestedById: moderatorA.user.id });

      expectApiSuccess(response, 200);
      const ids = (response.body.data.requests as Array<{ id: string }>).map((r) => r.id);
      expect(ids).toEqual([requestA.id]);
    });

    it('filters by reviewedById (OWNER)', async () => {
      const owner = await createOwner();
      const otherOwner = await createOwner();
      const moderator = await createModerator();
      const reviewed = await createTestRequest({
        requestedById: moderator.user.id,
        reviewedById: owner.user.id,
        status: RequestStatus.APPROVED,
        reviewedAt: new Date(),
      });
      await createTestRequest({
        requestedById: moderator.user.id,
        reviewedById: otherOwner.user.id,
        status: RequestStatus.APPROVED,
        reviewedAt: new Date(),
      });

      const response = await request(app)
        .get('/api/requests')
        .set('Authorization', `Bearer ${owner.token}`)
        .query({ reviewedById: owner.user.id });

      expectApiSuccess(response, 200);
      const ids = (response.body.data.requests as Array<{ id: string }>).map((r) => r.id);
      expect(ids).toEqual([reviewed.id]);
    });

    it('finds a request by title search', async () => {
      const owner = await createOwner();
      const moderator = await createModerator();
      const match = await createTestRequest({ requestedById: moderator.user.id, title: 'Leaking roof panel replacement' });
      await createTestRequest({ requestedById: moderator.user.id, title: 'Unrelated request' });

      const response = await request(app).get('/api/requests').set('Authorization', `Bearer ${owner.token}`).query({ search: 'roof' });

      expectApiSuccess(response, 200);
      const ids = (response.body.data.requests as Array<{ id: string }>).map((r) => r.id);
      expect(ids).toContain(match.id);
    });

    it('sorts by title ascending/descending', async () => {
      const owner = await createOwner();
      const moderator = await createModerator();
      await createTestRequest({ requestedById: moderator.user.id, title: 'Alpha Request' });
      await createTestRequest({ requestedById: moderator.user.id, title: 'Zeta Request' });

      const asc = await request(app).get('/api/requests').set('Authorization', `Bearer ${owner.token}`).query({ sortBy: 'title', sortOrder: 'asc' });
      expectApiSuccess(asc, 200);
      expect(asc.body.data.requests[0].title).toBe('Alpha Request');

      const desc = await request(app).get('/api/requests').set('Authorization', `Bearer ${owner.token}`).query({ sortBy: 'title', sortOrder: 'desc' });
      expectApiSuccess(desc, 200);
      expect(desc.body.data.requests[0].title).toBe('Zeta Request');
    });

    it('paginates requests', async () => {
      const owner = await createOwner();
      const moderator = await createModerator();
      for (let i = 0; i < 3; i += 1) {
        await createTestRequest({ requestedById: moderator.user.id });
      }

      const response = await request(app).get('/api/requests').set('Authorization', `Bearer ${owner.token}`).query({ limit: '2', page: '1' });

      expectApiSuccess(response, 200);
      expect(response.body.data.requests.length).toBeLessThanOrEqual(2);
      expect(response.body.data.pagination.limit).toBe(2);
      expect(response.body.data.pagination.total).toBeGreaterThanOrEqual(3);
    });
  });

  // ================================================================
  // GET /api/requests/:id
  // ================================================================
  describe('GET /api/requests/:id', () => {
    it('lets an OWNER view any request', async () => {
      const owner = await createOwner();
      const moderator = await createModerator();
      const req = await createTestRequest({ requestedById: moderator.user.id });

      const response = await request(app).get(`/api/requests/${req.id}`).set('Authorization', `Bearer ${owner.token}`);

      expectApiSuccess(response, 200, 'Request retrieved successfully.');
      expect(response.body.data.request.id).toBe(req.id);
    });

    it('lets a MODERATOR view their own request', async () => {
      const moderator = await createModerator();
      const req = await createTestRequest({ requestedById: moderator.user.id });

      const response = await request(app).get(`/api/requests/${req.id}`).set('Authorization', `Bearer ${moderator.token}`);

      expectApiSuccess(response, 200);
    });

    it("returns 404 for a MODERATOR requesting another moderator's request - no ID enumeration", async () => {
      const moderatorA = await createModerator();
      const moderatorB = await createModerator();
      const req = await createTestRequest({ requestedById: moderatorB.user.id });

      const response = await request(app).get(`/api/requests/${req.id}`).set('Authorization', `Bearer ${moderatorA.token}`);

      expectApiError(response, 404);
    });

    it('returns 404 for a nonexistent request', async () => {
      const owner = await createOwner();

      const response = await request(app)
        .get('/api/requests/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${owner.token}`);

      expectApiError(response, 404);
    });

    it('rejects an invalid (non-UUID) request id with 400', async () => {
      const owner = await createOwner();

      const response = await request(app).get('/api/requests/not-a-uuid').set('Authorization', `Bearer ${owner.token}`);

      expectApiError(response, 400, 'Validation failed.');
    });
  });

  // ================================================================
  // PATCH /api/requests/:id (own PENDING edit)
  // ================================================================
  describe('PATCH /api/requests/:id', () => {
    it('lets a MODERATOR edit their own PENDING request, verified in the database', async () => {
      const moderator = await createModerator();
      const req = await createTestRequest({ requestedById: moderator.user.id, title: 'Original Title' });

      const response = await request(app)
        .patch(`/api/requests/${req.id}`)
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ title: 'Updated Title', description: 'Updated description.' });

      expectApiSuccess(response, 200, 'Request updated successfully.');

      const dbRequest = await prisma.request.findUnique({ where: { id: req.id } });
      expect(dbRequest?.title).toBe('Updated Title');
      expect(dbRequest?.description).toBe('Updated description.');
    });

    it('rejects editing an already-APPROVED request with 409, database unchanged', async () => {
      const moderator = await createModerator();
      const req = await createTestRequest({ requestedById: moderator.user.id, status: RequestStatus.APPROVED, title: 'Approved Title' });

      const response = await request(app)
        .patch(`/api/requests/${req.id}`)
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ title: 'Should not change' });

      expectApiError(response, 409);

      const dbRequest = await prisma.request.findUnique({ where: { id: req.id } });
      expect(dbRequest?.title).toBe('Approved Title');
    });

    it("returns 404 editing another moderator's request, database unchanged", async () => {
      const moderatorA = await createModerator();
      const moderatorB = await createModerator();
      const req = await createTestRequest({ requestedById: moderatorB.user.id, title: 'Untouched Title' });

      const response = await request(app)
        .patch(`/api/requests/${req.id}`)
        .set('Authorization', `Bearer ${moderatorA.token}`)
        .send({ title: 'Should not apply' });

      expectApiError(response, 404);

      const dbRequest = await prisma.request.findUnique({ where: { id: req.id } });
      expect(dbRequest?.title).toBe('Untouched Title');
    });

    it('rejects an OWNER calling this endpoint with 403', async () => {
      const owner = await createOwner();
      const moderator = await createModerator();
      const req = await createTestRequest({ requestedById: moderator.user.id });

      const response = await request(app).patch(`/api/requests/${req.id}`).set('Authorization', `Bearer ${owner.token}`).send({ title: 'Owner edit' });

      expectApiError(response, 403);
    });

    it('rejects an empty update body with 400', async () => {
      const moderator = await createModerator();
      const req = await createTestRequest({ requestedById: moderator.user.id });

      const response = await request(app).patch(`/api/requests/${req.id}`).set('Authorization', `Bearer ${moderator.token}`).send({});

      expectApiError(response, 400, 'Validation failed.');
    });
  });

  // ================================================================
  // PATCH /api/requests/:id/approve
  // ================================================================
  describe('PATCH /api/requests/:id/approve', () => {
    it('lets an OWNER approve a PENDING request, verified in the database (reviewedById, reviewedAt, reviewNote)', async () => {
      const owner = await createOwner();
      const moderator = await createModerator();
      const req = await createTestRequest({ requestedById: moderator.user.id });

      const response = await request(app)
        .patch(`/api/requests/${req.id}/approve`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ reviewNote: 'Approved - budget confirmed.' });

      expectApiSuccess(response, 200, 'Request approved successfully.');

      const dbRequest = await prisma.request.findUnique({ where: { id: req.id } });
      expect(dbRequest?.status).toBe(RequestStatus.APPROVED);
      expect(dbRequest?.reviewedById).toBe(owner.user.id);
      expect(dbRequest?.reviewedAt).toBeInstanceOf(Date);
      expect(dbRequest?.reviewNote).toBe('Approved - budget confirmed.');
    });

    it('rejects approving the same request twice with 409, database unchanged on the second attempt', async () => {
      const owner = await createOwner();
      const moderator = await createModerator();
      const req = await createTestRequest({ requestedById: moderator.user.id });

      const first = await request(app).patch(`/api/requests/${req.id}/approve`).set('Authorization', `Bearer ${owner.token}`).send({});
      expectApiSuccess(first, 200);
      const afterFirst = await prisma.request.findUnique({ where: { id: req.id } });

      const second = await request(app).patch(`/api/requests/${req.id}/approve`).set('Authorization', `Bearer ${owner.token}`).send({});
      expectApiError(second, 409);

      const afterSecond = await prisma.request.findUnique({ where: { id: req.id } });
      expect(afterSecond?.reviewedAt?.getTime()).toBe(afterFirst?.reviewedAt?.getTime());
    });

    it('rejects approving an already-REJECTED request with 409', async () => {
      const owner = await createOwner();
      const moderator = await createModerator();
      const req = await createTestRequest({ requestedById: moderator.user.id, status: RequestStatus.REJECTED, reviewedById: owner.user.id, reviewedAt: new Date() });

      const response = await request(app).patch(`/api/requests/${req.id}/approve`).set('Authorization', `Bearer ${owner.token}`).send({});

      expectApiError(response, 409);
      const dbRequest = await prisma.request.findUnique({ where: { id: req.id } });
      expect(dbRequest?.status).toBe(RequestStatus.REJECTED);
    });

    it('rejects approving a CANCELLED request with 409', async () => {
      const owner = await createOwner();
      const moderator = await createModerator();
      const req = await createTestRequest({ requestedById: moderator.user.id, status: RequestStatus.CANCELLED });

      const response = await request(app).patch(`/api/requests/${req.id}/approve`).set('Authorization', `Bearer ${owner.token}`).send({});

      expectApiError(response, 409);
      const dbRequest = await prisma.request.findUnique({ where: { id: req.id } });
      expect(dbRequest?.status).toBe(RequestStatus.CANCELLED);
    });

    it('rejects a MODERATOR approving a request with 403 - moderators cannot approve', async () => {
      const moderator = await createModerator();
      const req = await createTestRequest({ requestedById: moderator.user.id });

      const response = await request(app).patch(`/api/requests/${req.id}/approve`).set('Authorization', `Bearer ${moderator.token}`).send({});

      expectApiError(response, 403);
    });

    it('returns 404 for a nonexistent request', async () => {
      const owner = await createOwner();

      const response = await request(app)
        .patch('/api/requests/00000000-0000-0000-0000-000000000000/approve')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({});

      expectApiError(response, 404);
    });
  });

  // ================================================================
  // PATCH /api/requests/:id/reject
  // ================================================================
  describe('PATCH /api/requests/:id/reject', () => {
    it('lets an OWNER reject a PENDING request, verified in the database (reviewedById, reviewedAt, reviewNote)', async () => {
      const owner = await createOwner();
      const moderator = await createModerator();
      const req = await createTestRequest({ requestedById: moderator.user.id });

      const response = await request(app)
        .patch(`/api/requests/${req.id}/reject`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ reviewNote: 'Budget not available this quarter.' });

      expectApiSuccess(response, 200, 'Request rejected successfully.');

      const dbRequest = await prisma.request.findUnique({ where: { id: req.id } });
      expect(dbRequest?.status).toBe(RequestStatus.REJECTED);
      expect(dbRequest?.reviewedById).toBe(owner.user.id);
      expect(dbRequest?.reviewedAt).toBeInstanceOf(Date);
      expect(dbRequest?.reviewNote).toBe('Budget not available this quarter.');
    });

    it('rejects rejecting the same request twice with 409', async () => {
      const owner = await createOwner();
      const moderator = await createModerator();
      const req = await createTestRequest({ requestedById: moderator.user.id });

      const first = await request(app).patch(`/api/requests/${req.id}/reject`).set('Authorization', `Bearer ${owner.token}`).send({});
      expectApiSuccess(first, 200);

      const second = await request(app).patch(`/api/requests/${req.id}/reject`).set('Authorization', `Bearer ${owner.token}`).send({});
      expectApiError(second, 409);
    });

    it('rejects a MODERATOR rejecting a request with 403 - moderators cannot reject', async () => {
      const moderator = await createModerator();
      const req = await createTestRequest({ requestedById: moderator.user.id });

      const response = await request(app).patch(`/api/requests/${req.id}/reject`).set('Authorization', `Bearer ${moderator.token}`).send({});

      expectApiError(response, 403);
    });
  });

  // ================================================================
  // PATCH /api/requests/:id/cancel
  // ================================================================
  describe('PATCH /api/requests/:id/cancel', () => {
    it('lets a MODERATOR cancel their own PENDING request, verified in the database (reviewedBy/reviewedAt stay null)', async () => {
      const moderator = await createModerator();
      const req = await createTestRequest({ requestedById: moderator.user.id });

      const response = await request(app).patch(`/api/requests/${req.id}/cancel`).set('Authorization', `Bearer ${moderator.token}`);

      expectApiSuccess(response, 200, 'Request cancelled successfully.');

      const dbRequest = await prisma.request.findUnique({ where: { id: req.id } });
      expect(dbRequest?.status).toBe(RequestStatus.CANCELLED);
      expect(dbRequest?.reviewedById).toBeNull();
      expect(dbRequest?.reviewedAt).toBeNull();
    });

    it('rejects cancelling an APPROVED request with 409, database unchanged', async () => {
      const moderator = await createModerator();
      const owner = await createOwner();
      const req = await createTestRequest({ requestedById: moderator.user.id, status: RequestStatus.APPROVED, reviewedById: owner.user.id, reviewedAt: new Date() });

      const response = await request(app).patch(`/api/requests/${req.id}/cancel`).set('Authorization', `Bearer ${moderator.token}`);

      expectApiError(response, 409);
      const dbRequest = await prisma.request.findUnique({ where: { id: req.id } });
      expect(dbRequest?.status).toBe(RequestStatus.APPROVED);
    });

    it('rejects cancelling a REJECTED request with 409', async () => {
      const moderator = await createModerator();
      const owner = await createOwner();
      const req = await createTestRequest({ requestedById: moderator.user.id, status: RequestStatus.REJECTED, reviewedById: owner.user.id, reviewedAt: new Date() });

      const response = await request(app).patch(`/api/requests/${req.id}/cancel`).set('Authorization', `Bearer ${moderator.token}`);

      expectApiError(response, 409);
      const dbRequest = await prisma.request.findUnique({ where: { id: req.id } });
      expect(dbRequest?.status).toBe(RequestStatus.REJECTED);
    });

    it('rejects cancelling an already-CANCELLED request with 409', async () => {
      const moderator = await createModerator();
      const req = await createTestRequest({ requestedById: moderator.user.id, status: RequestStatus.CANCELLED });

      const response = await request(app).patch(`/api/requests/${req.id}/cancel`).set('Authorization', `Bearer ${moderator.token}`);

      expectApiError(response, 409);
    });

    it("returns 404 cancelling another moderator's request", async () => {
      const moderatorA = await createModerator();
      const moderatorB = await createModerator();
      const req = await createTestRequest({ requestedById: moderatorB.user.id });

      const response = await request(app).patch(`/api/requests/${req.id}/cancel`).set('Authorization', `Bearer ${moderatorA.token}`);

      expectApiError(response, 404);
    });

    it('rejects an OWNER calling the cancel endpoint with 403', async () => {
      const owner = await createOwner();
      const moderator = await createModerator();
      const req = await createTestRequest({ requestedById: moderator.user.id });

      const response = await request(app).patch(`/api/requests/${req.id}/cancel`).set('Authorization', `Bearer ${owner.token}`);

      expectApiError(response, 403);
    });
  });

  // ================================================================
  // DELETE /api/requests/:id
  // ================================================================
  describe('DELETE /api/requests/:id', () => {
    it('lets an OWNER delete any request regardless of status, verified in the database', async () => {
      const owner = await createOwner();
      const moderator = await createModerator();
      const req = await createTestRequest({ requestedById: moderator.user.id, status: RequestStatus.APPROVED, reviewedById: owner.user.id, reviewedAt: new Date() });

      const response = await request(app).delete(`/api/requests/${req.id}`).set('Authorization', `Bearer ${owner.token}`);

      expectApiSuccess(response, 200, 'Request deleted successfully.');
      const dbRequest = await prisma.request.findUnique({ where: { id: req.id } });
      expect(dbRequest).toBeNull();
    });

    it('lets a MODERATOR delete their own PENDING request', async () => {
      const moderator = await createModerator();
      const req = await createTestRequest({ requestedById: moderator.user.id, status: RequestStatus.PENDING });

      const response = await request(app).delete(`/api/requests/${req.id}`).set('Authorization', `Bearer ${moderator.token}`);

      expectApiSuccess(response, 200);
      const dbRequest = await prisma.request.findUnique({ where: { id: req.id } });
      expect(dbRequest).toBeNull();
    });

    it('lets a MODERATOR delete their own CANCELLED request', async () => {
      const moderator = await createModerator();
      const req = await createTestRequest({ requestedById: moderator.user.id, status: RequestStatus.CANCELLED });

      const response = await request(app).delete(`/api/requests/${req.id}`).set('Authorization', `Bearer ${moderator.token}`);

      expectApiSuccess(response, 200);
    });

    it('rejects a MODERATOR deleting their own APPROVED request with 409, row remains', async () => {
      const moderator = await createModerator();
      const owner = await createOwner();
      const req = await createTestRequest({ requestedById: moderator.user.id, status: RequestStatus.APPROVED, reviewedById: owner.user.id, reviewedAt: new Date() });

      const response = await request(app).delete(`/api/requests/${req.id}`).set('Authorization', `Bearer ${moderator.token}`);

      expectApiError(response, 409);
      const dbRequest = await prisma.request.findUnique({ where: { id: req.id } });
      expect(dbRequest).not.toBeNull();
    });

    it('rejects a MODERATOR deleting their own REJECTED request with 409, row remains', async () => {
      const moderator = await createModerator();
      const owner = await createOwner();
      const req = await createTestRequest({ requestedById: moderator.user.id, status: RequestStatus.REJECTED, reviewedById: owner.user.id, reviewedAt: new Date() });

      const response = await request(app).delete(`/api/requests/${req.id}`).set('Authorization', `Bearer ${moderator.token}`);

      expectApiError(response, 409);
      const dbRequest = await prisma.request.findUnique({ where: { id: req.id } });
      expect(dbRequest).not.toBeNull();
    });

    it("returns 404 deleting another moderator's request, row remains", async () => {
      const moderatorA = await createModerator();
      const moderatorB = await createModerator();
      const req = await createTestRequest({ requestedById: moderatorB.user.id });

      const response = await request(app).delete(`/api/requests/${req.id}`).set('Authorization', `Bearer ${moderatorA.token}`);

      expectApiError(response, 404);
      const dbRequest = await prisma.request.findUnique({ where: { id: req.id } });
      expect(dbRequest).not.toBeNull();
    });

    it('returns 404 deleting a nonexistent request', async () => {
      const owner = await createOwner();

      const response = await request(app)
        .delete('/api/requests/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${owner.token}`);

      expectApiError(response, 404);
    });
  });
});
