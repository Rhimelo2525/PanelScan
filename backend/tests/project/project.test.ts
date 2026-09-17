import { NotificationType, ProjectStatus } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import { createCustomer, createModerator, createOwner, createTestProject } from '../helpers/factories';
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

describe('Project module', () => {
  // ================================================================
  // AUTHENTICATION
  // ================================================================
  describe('Authentication', () => {
    it('returns 401 for a request without a JWT', async () => {
      const response = await request(app).get('/api/projects');
      expectApiError(response, 401);
    });

    it('returns 401 for a malformed JWT', async () => {
      const response = await request(app).get('/api/projects').set('Authorization', 'Bearer not-a-real-token');
      expectApiError(response, 401);
    });
  });

  // ================================================================
  // POST /api/projects (create)
  // ================================================================
  describe('POST /api/projects', () => {
    it('lets an OWNER create a project for a customer, verified in the database', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();

      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ customerId: customer.user.id, name: 'Living Room Renovation', description: 'Full panel install.', budget: 50000 });

      expectApiSuccess(response, 201, 'Project created successfully.');
      expect(response.body.data.project.status).toBe(ProjectStatus.PENDING);

      const dbProject = await prisma.project.findUnique({ where: { id: response.body.data.project.id } });
      expect(dbProject).not.toBeNull();
      expect(dbProject?.customerId).toBe(customer.user.id);
      expect(dbProject?.ownerId).toBe(owner.user.id);
      expect(dbProject?.moderatorId).toBeNull();
      expect(dbProject?.status).toBe(ProjectStatus.PENDING);
      expect(Number(dbProject?.budget)).toBe(50000);
      expect(dbProject?.createdAt).toBeInstanceOf(Date);
    });

    it('lets an OWNER create a project with a moderator assigned at creation, verified in the database', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const moderator = await createModerator();

      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ customerId: customer.user.id, moderatorId: moderator.user.id, name: 'Kitchen Renovation' });

      expectApiSuccess(response, 201);

      const dbProject = await prisma.project.findUnique({ where: { id: response.body.data.project.id } });
      expect(dbProject?.moderatorId).toBe(moderator.user.id);
    });

    it('rejects a CUSTOMER creating a project with 403, no row created', async () => {
      const customer = await createCustomer();

      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ customerId: customer.user.id, name: 'Should not be created' });

      expectApiError(response, 403);

      const count = await prisma.project.count({ where: { name: 'Should not be created' } });
      expect(count).toBe(0);
    });

    it('rejects a MODERATOR creating a project with 403', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();

      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ customerId: customer.user.id, name: 'Should not be created' });

      expectApiError(response, 403);
    });

    it('returns 404 for a nonexistent customerId', async () => {
      const owner = await createOwner();

      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ customerId: '00000000-0000-0000-0000-000000000000', name: 'Ghost Customer Project' });

      expectApiError(response, 404);
    });

    it('rejects a customerId that does not belong to a CUSTOMER role with 400', async () => {
      const owner = await createOwner();
      const moderator = await createModerator();

      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ customerId: moderator.user.id, name: 'Wrong Role Project' });

      expectApiError(response, 400);
    });

    it('rejects a moderatorId that does not belong to a MODERATOR role with 400', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const otherCustomer = await createCustomer();

      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ customerId: customer.user.id, moderatorId: otherCustomer.user.id, name: 'Wrong Moderator Role' });

      expectApiError(response, 400);
    });

    it('rejects an inactive moderator with 400', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const inactiveModerator = await createModerator({ isActive: false });

      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ customerId: customer.user.id, moderatorId: inactiveModerator.user.id, name: 'Inactive Moderator Project' });

      expectApiError(response, 400);
    });

    it('rejects a non-positive budget with 400', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();

      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ customerId: customer.user.id, name: 'Negative Budget Project', budget: -100 });

      expectApiError(response, 400, 'Validation failed.');
    });

    it('rejects a name below the minimum length with 400', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();

      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ customerId: customer.user.id, name: 'AB' });

      expectApiError(response, 400, 'Validation failed.');
    });

    it('rejects an endDate before startDate with 400', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();

      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({
          customerId: customer.user.id,
          name: 'Backwards Dates Project',
          startDate: '2027-02-01',
          endDate: '2027-01-01',
        });

      expectApiError(response, 400, 'Validation failed.');
    });

    it('rejects an invalid (non-UUID) customerId with 400', async () => {
      const owner = await createOwner();

      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ customerId: 'not-a-uuid', name: 'Invalid Id Project' });

      expectApiError(response, 400, 'Validation failed.');
    });
  });

  // ================================================================
  // AUTOMATIC NOTIFICATIONS
  // ================================================================
  describe('Automatic notifications - Project', () => {
    it('notifies the customer when a project is created', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();

      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ customerId: customer.user.id, name: 'Notification Test Project' });

      expectApiSuccess(response, 201);
      const projectId = response.body.data.project.id as string;

      const notification = await prisma.notification.findFirst({
        where: { userId: customer.user.id, type: NotificationType.SYSTEM, title: 'Project created' },
      });
      expect(notification).not.toBeNull();
      expect((notification?.metadata as { projectId?: string; event?: string } | null)?.projectId).toBe(projectId);
      expect((notification?.metadata as { event?: string } | null)?.event).toBe('PROJECT_CREATED');
    });

    it('notifies the moderator when assigned at creation', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const moderator = await createModerator();

      const response = await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ customerId: customer.user.id, moderatorId: moderator.user.id, name: 'Assigned At Creation' });

      expectApiSuccess(response, 201);

      const notification = await prisma.notification.findFirst({
        where: { userId: moderator.user.id, type: NotificationType.SYSTEM, title: 'Moderator assigned' },
      });
      expect(notification).not.toBeNull();
    });

    it('notifies the newly assigned moderator via PATCH /:id/assign', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const moderator = await createModerator();
      const project = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id });

      const response = await request(app)
        .patch(`/api/projects/${project.id}/assign`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ moderatorId: moderator.user.id });

      expectApiSuccess(response, 200);

      const notification = await prisma.notification.findFirst({
        where: { userId: moderator.user.id, type: NotificationType.SYSTEM, title: 'Moderator assigned' },
      });
      expect(notification).not.toBeNull();
      expect((notification?.metadata as { event?: string } | null)?.event).toBe('MODERATOR_ASSIGNED');
    });

    it('notifies the newly assigned owner via PATCH /:id/assign', async () => {
      const owner = await createOwner();
      const newOwner = await createOwner();
      const customer = await createCustomer();
      const project = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id });

      const response = await request(app)
        .patch(`/api/projects/${project.id}/assign`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ ownerId: newOwner.user.id });

      expectApiSuccess(response, 200);

      const notification = await prisma.notification.findFirst({
        where: { userId: newOwner.user.id, type: NotificationType.SYSTEM, title: 'Owner assigned' },
      });
      expect(notification).not.toBeNull();
      expect((notification?.metadata as { event?: string } | null)?.event).toBe('OWNER_ASSIGNED');
    });

    it('notifies the customer on every status transition (started, completed, cancelled)', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const startedProject = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id, status: ProjectStatus.PENDING });

      const started = await request(app)
        .patch(`/api/projects/${startedProject.id}/status`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ status: ProjectStatus.IN_PROGRESS });
      expectApiSuccess(started, 200);

      const startedNotification = await prisma.notification.findFirst({
        where: { userId: customer.user.id, type: NotificationType.SYSTEM, title: 'Project started' },
      });
      expect(startedNotification).not.toBeNull();

      const completed = await request(app)
        .patch(`/api/projects/${startedProject.id}/status`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ status: ProjectStatus.COMPLETED });
      expectApiSuccess(completed, 200);

      const completedNotification = await prisma.notification.findFirst({
        where: { userId: customer.user.id, type: NotificationType.SYSTEM, title: 'Project completed' },
      });
      expect(completedNotification).not.toBeNull();
      expect((completedNotification?.metadata as { status?: string } | null)?.status).toBe(ProjectStatus.COMPLETED);

      const cancelledProject = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id, status: ProjectStatus.PENDING });
      const cancelled = await request(app)
        .patch(`/api/projects/${cancelledProject.id}/status`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ status: ProjectStatus.CANCELLED });
      expectApiSuccess(cancelled, 200);

      const cancelledNotification = await prisma.notification.findFirst({
        where: { userId: customer.user.id, type: NotificationType.SYSTEM, title: 'Project cancelled' },
      });
      expect(cancelledNotification).not.toBeNull();
    });
  });

  // ================================================================
  // GET /api/projects (list, filter, search, pagination, sorting)
  // ================================================================
  describe('GET /api/projects', () => {
    it('lets an OWNER view every project across customers', async () => {
      const owner = await createOwner();
      const customerA = await createCustomer();
      const customerB = await createCustomer();
      await createTestProject({ customerId: customerA.user.id, ownerId: owner.user.id });
      await createTestProject({ customerId: customerB.user.id, ownerId: owner.user.id });

      const response = await request(app).get('/api/projects').set('Authorization', `Bearer ${owner.token}`);

      expectApiSuccess(response, 200, 'Projects retrieved successfully.');
      expect(response.body.data.projects.length).toBeGreaterThanOrEqual(2);
    });

    it("scopes a MODERATOR to their assigned projects only, confirmed against the database", async () => {
      const owner = await createOwner();
      const moderatorA = await createModerator();
      const moderatorB = await createModerator();
      const customer = await createCustomer();
      const assigned = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id, moderatorId: moderatorA.user.id });
      const notAssigned = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id, moderatorId: moderatorB.user.id });

      const response = await request(app).get('/api/projects').set('Authorization', `Bearer ${moderatorA.token}`);

      expectApiSuccess(response, 200);
      const ids = (response.body.data.projects as Array<{ id: string }>).map((p) => p.id);
      expect(ids).toContain(assigned.id);
      expect(ids).not.toContain(notAssigned.id);

      const dbNotAssigned = await prisma.project.findUnique({ where: { id: notAssigned.id } });
      expect(dbNotAssigned).not.toBeNull();
    });

    it("scopes a CUSTOMER to their own projects only, confirmed against the database", async () => {
      const owner = await createOwner();
      const customerA = await createCustomer();
      const customerB = await createCustomer();
      const ownProject = await createTestProject({ customerId: customerA.user.id, ownerId: owner.user.id });
      const otherProject = await createTestProject({ customerId: customerB.user.id, ownerId: owner.user.id });

      const response = await request(app).get('/api/projects').set('Authorization', `Bearer ${customerA.token}`);

      expectApiSuccess(response, 200);
      const ids = (response.body.data.projects as Array<{ id: string }>).map((p) => p.id);
      expect(ids).toContain(ownProject.id);
      expect(ids).not.toContain(otherProject.id);

      const dbOther = await prisma.project.findUnique({ where: { id: otherProject.id } });
      expect(dbOther).not.toBeNull();
    });

    it('filters by status', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const inProgress = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id, status: ProjectStatus.IN_PROGRESS });
      await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id, status: ProjectStatus.PENDING });

      const response = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${owner.token}`)
        .query({ status: ProjectStatus.IN_PROGRESS });

      expectApiSuccess(response, 200);
      const ids = (response.body.data.projects as Array<{ id: string }>).map((p) => p.id);
      expect(ids).toContain(inProgress.id);
      expect((response.body.data.projects as Array<{ status: string }>).every((p) => p.status === ProjectStatus.IN_PROGRESS)).toBe(true);
    });

    it('filters by customerId (OWNER)', async () => {
      const owner = await createOwner();
      const customerA = await createCustomer();
      const customerB = await createCustomer();
      const projectA = await createTestProject({ customerId: customerA.user.id, ownerId: owner.user.id });
      await createTestProject({ customerId: customerB.user.id, ownerId: owner.user.id });

      const response = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${owner.token}`)
        .query({ customerId: customerA.user.id });

      expectApiSuccess(response, 200);
      const ids = (response.body.data.projects as Array<{ id: string }>).map((p) => p.id);
      expect(ids).toEqual([projectA.id]);
    });

    it('filters by moderatorId (OWNER)', async () => {
      const owner = await createOwner();
      const moderator = await createModerator();
      const customer = await createCustomer();
      const assigned = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id, moderatorId: moderator.user.id });
      await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id });

      const response = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${owner.token}`)
        .query({ moderatorId: moderator.user.id });

      expectApiSuccess(response, 200);
      const ids = (response.body.data.projects as Array<{ id: string }>).map((p) => p.id);
      expect(ids).toEqual([assigned.id]);
    });

    it('finds a project by name search', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const match = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id, name: 'Leaking Roof Panel Repair' });
      await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id, name: 'Unrelated Project' });

      const response = await request(app).get('/api/projects').set('Authorization', `Bearer ${owner.token}`).query({ search: 'roof' });

      expectApiSuccess(response, 200);
      const ids = (response.body.data.projects as Array<{ id: string }>).map((p) => p.id);
      expect(ids).toContain(match.id);
    });

    it('sorts by name ascending/descending', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id, name: 'Alpha Project' });
      await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id, name: 'Zeta Project' });

      const asc = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${owner.token}`)
        .query({ sortBy: 'name', sortOrder: 'asc' });
      expectApiSuccess(asc, 200);
      expect(asc.body.data.projects[0].name).toBe('Alpha Project');

      const desc = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${owner.token}`)
        .query({ sortBy: 'name', sortOrder: 'desc' });
      expectApiSuccess(desc, 200);
      expect(desc.body.data.projects[0].name).toBe('Zeta Project');
    });

    it('paginates projects', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      for (let i = 0; i < 3; i += 1) {
        await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id });
      }

      const response = await request(app).get('/api/projects').set('Authorization', `Bearer ${owner.token}`).query({ limit: '2', page: '1' });

      expectApiSuccess(response, 200);
      expect(response.body.data.projects.length).toBeLessThanOrEqual(2);
      expect(response.body.data.pagination.limit).toBe(2);
      expect(response.body.data.pagination.total).toBeGreaterThanOrEqual(3);
    });
  });

  // ================================================================
  // GET /api/projects/:id
  // ================================================================
  describe('GET /api/projects/:id', () => {
    it('lets an OWNER view any project', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const project = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id });

      const response = await request(app).get(`/api/projects/${project.id}`).set('Authorization', `Bearer ${owner.token}`);

      expectApiSuccess(response, 200, 'Project retrieved successfully.');
      expect(response.body.data.project.id).toBe(project.id);
    });

    it('lets an assigned MODERATOR view the project', async () => {
      const owner = await createOwner();
      const moderator = await createModerator();
      const customer = await createCustomer();
      const project = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id, moderatorId: moderator.user.id });

      const response = await request(app).get(`/api/projects/${project.id}`).set('Authorization', `Bearer ${moderator.token}`);

      expectApiSuccess(response, 200);
    });

    it("returns 404 for a MODERATOR who isn't assigned to the project - no ID enumeration", async () => {
      const owner = await createOwner();
      const moderator = await createModerator();
      const customer = await createCustomer();
      const project = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id });

      const response = await request(app).get(`/api/projects/${project.id}`).set('Authorization', `Bearer ${moderator.token}`);

      expectApiError(response, 404);
    });

    it('lets a CUSTOMER view their own project', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const project = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id });

      const response = await request(app).get(`/api/projects/${project.id}`).set('Authorization', `Bearer ${customer.token}`);

      expectApiSuccess(response, 200);
    });

    it("returns 404 for a CUSTOMER requesting another customer's project - no ID enumeration", async () => {
      const owner = await createOwner();
      const outsider = await createCustomer();
      const customer = await createCustomer();
      const project = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id });

      const response = await request(app).get(`/api/projects/${project.id}`).set('Authorization', `Bearer ${outsider.token}`);

      expectApiError(response, 404);
    });

    it('returns 404 for a nonexistent project', async () => {
      const owner = await createOwner();

      const response = await request(app)
        .get('/api/projects/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${owner.token}`);

      expectApiError(response, 404);
    });

    it('rejects an invalid (non-UUID) project id with 400', async () => {
      const owner = await createOwner();

      const response = await request(app).get('/api/projects/not-a-uuid').set('Authorization', `Bearer ${owner.token}`);

      expectApiError(response, 400, 'Validation failed.');
    });
  });

  // ================================================================
  // PATCH /api/projects/:id
  // ================================================================
  describe('PATCH /api/projects/:id', () => {
    it('lets an OWNER update name/description/budget/notes/schedule, verified in the database', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const project = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id });

      const response = await request(app)
        .patch(`/api/projects/${project.id}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ name: 'Updated Project Name', description: 'Updated overview.', budget: 75000, notes: 'Owner note.' });

      expectApiSuccess(response, 200, 'Project updated successfully.');

      const dbProject = await prisma.project.findUnique({ where: { id: project.id } });
      expect(dbProject?.name).toBe('Updated Project Name');
      expect(dbProject?.description).toBe('Updated overview.');
      expect(Number(dbProject?.budget)).toBe(75000);
      expect(dbProject?.notes).toBe('Owner note.');
    });

    it('lets an assigned MODERATOR update schedule and notes, verified in the database', async () => {
      const owner = await createOwner();
      const moderator = await createModerator();
      const customer = await createCustomer();
      const project = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id, moderatorId: moderator.user.id });

      const response = await request(app)
        .patch(`/api/projects/${project.id}`)
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ notes: 'Panels delayed until Friday.', startDate: '2027-03-01' });

      expectApiSuccess(response, 200);

      const dbProject = await prisma.project.findUnique({ where: { id: project.id } });
      expect(dbProject?.notes).toBe('Panels delayed until Friday.');
      expect(dbProject?.startDate?.toISOString().slice(0, 10)).toBe('2027-03-01');
    });

    it('rejects a MODERATOR updating name/description/budget with 403, database unchanged', async () => {
      const owner = await createOwner();
      const moderator = await createModerator();
      const customer = await createCustomer();
      const project = await createTestProject({
        customerId: customer.user.id,
        ownerId: owner.user.id,
        moderatorId: moderator.user.id,
        name: 'Original Name',
      });

      const response = await request(app)
        .patch(`/api/projects/${project.id}`)
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ name: 'Moderator Should Not Set This' });

      expectApiError(response, 403);

      const dbProject = await prisma.project.findUnique({ where: { id: project.id } });
      expect(dbProject?.name).toBe('Original Name');
    });

    it("returns 404 for a MODERATOR who isn't assigned to the project, database unchanged", async () => {
      const owner = await createOwner();
      const moderator = await createModerator();
      const customer = await createCustomer();
      const project = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id, notes: 'Untouched' });

      const response = await request(app)
        .patch(`/api/projects/${project.id}`)
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ notes: 'Should not apply' });

      expectApiError(response, 404);

      const dbProject = await prisma.project.findUnique({ where: { id: project.id } });
      expect(dbProject?.notes).toBe('Untouched');
    });

    it('rejects a CUSTOMER updating a project with 403', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const project = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id });

      const response = await request(app)
        .patch(`/api/projects/${project.id}`)
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ notes: 'Customer should not be able to do this.' });

      expectApiError(response, 403);
    });

    it('rejects an endDate before the existing startDate with 400, database unchanged', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const project = await createTestProject({
        customerId: customer.user.id,
        ownerId: owner.user.id,
        startDate: new Date('2027-02-01'),
      });

      const response = await request(app)
        .patch(`/api/projects/${project.id}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ endDate: '2027-01-01' });

      expectApiError(response, 400);

      const dbProject = await prisma.project.findUnique({ where: { id: project.id } });
      expect(dbProject?.endDate).toBeNull();
    });

    it('rejects an empty update body with 400', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const project = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id });

      const response = await request(app).patch(`/api/projects/${project.id}`).set('Authorization', `Bearer ${owner.token}`).send({});

      expectApiError(response, 400, 'Validation failed.');
    });
  });

  // ================================================================
  // PATCH /api/projects/:id/status
  // ================================================================
  describe('PATCH /api/projects/:id/status', () => {
    it('walks a project through PENDING -> IN_PROGRESS -> COMPLETED, verified in the database at each step', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const project = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id });

      const toInProgress = await request(app)
        .patch(`/api/projects/${project.id}/status`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ status: ProjectStatus.IN_PROGRESS });
      expectApiSuccess(toInProgress, 200);
      let dbProject = await prisma.project.findUnique({ where: { id: project.id } });
      expect(dbProject?.status).toBe(ProjectStatus.IN_PROGRESS);

      const toCompleted = await request(app)
        .patch(`/api/projects/${project.id}/status`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ status: ProjectStatus.COMPLETED });
      expectApiSuccess(toCompleted, 200);
      dbProject = await prisma.project.findUnique({ where: { id: project.id } });
      expect(dbProject?.status).toBe(ProjectStatus.COMPLETED);
    });

    it('allows cancellation before completion (PENDING -> CANCELLED and IN_PROGRESS -> CANCELLED)', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const pendingProject = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id, status: ProjectStatus.PENDING });
      const inProgressProject = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id, status: ProjectStatus.IN_PROGRESS });

      const fromPending = await request(app)
        .patch(`/api/projects/${pendingProject.id}/status`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ status: ProjectStatus.CANCELLED });
      expectApiSuccess(fromPending, 200);

      const fromInProgress = await request(app)
        .patch(`/api/projects/${inProgressProject.id}/status`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ status: ProjectStatus.CANCELLED });
      expectApiSuccess(fromInProgress, 200);
    });

    it('rejects COMPLETED -> PENDING with 400, database unchanged', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const project = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id, status: ProjectStatus.COMPLETED });

      const response = await request(app)
        .patch(`/api/projects/${project.id}/status`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ status: ProjectStatus.PENDING });

      expectApiError(response, 400);
      const dbProject = await prisma.project.findUnique({ where: { id: project.id } });
      expect(dbProject?.status).toBe(ProjectStatus.COMPLETED);
    });

    it('rejects COMPLETED -> IN_PROGRESS with 400, database unchanged', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const project = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id, status: ProjectStatus.COMPLETED });

      const response = await request(app)
        .patch(`/api/projects/${project.id}/status`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ status: ProjectStatus.IN_PROGRESS });

      expectApiError(response, 400);
      const dbProject = await prisma.project.findUnique({ where: { id: project.id } });
      expect(dbProject?.status).toBe(ProjectStatus.COMPLETED);
    });

    it('rejects CANCELLED -> IN_PROGRESS with 400, database unchanged', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const project = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id, status: ProjectStatus.CANCELLED });

      const response = await request(app)
        .patch(`/api/projects/${project.id}/status`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ status: ProjectStatus.IN_PROGRESS });

      expectApiError(response, 400);
      const dbProject = await prisma.project.findUnique({ where: { id: project.id } });
      expect(dbProject?.status).toBe(ProjectStatus.CANCELLED);
    });

    it('rejects an invalid enum value with 400', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const project = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id });

      const response = await request(app)
        .patch(`/api/projects/${project.id}/status`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ status: 'NOT_A_REAL_STATUS' });

      expectApiError(response, 400, 'Validation failed.');
    });

    it('lets an assigned MODERATOR change status', async () => {
      const owner = await createOwner();
      const moderator = await createModerator();
      const customer = await createCustomer();
      const project = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id, moderatorId: moderator.user.id });

      const response = await request(app)
        .patch(`/api/projects/${project.id}/status`)
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ status: ProjectStatus.IN_PROGRESS });

      expectApiSuccess(response, 200);
    });

    it("returns 404 for a MODERATOR who isn't assigned to the project", async () => {
      const owner = await createOwner();
      const moderator = await createModerator();
      const customer = await createCustomer();
      const project = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id });

      const response = await request(app)
        .patch(`/api/projects/${project.id}/status`)
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ status: ProjectStatus.IN_PROGRESS });

      expectApiError(response, 404);
    });

    it('rejects a CUSTOMER changing status with 403', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const project = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id });

      const response = await request(app)
        .patch(`/api/projects/${project.id}/status`)
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ status: ProjectStatus.IN_PROGRESS });

      expectApiError(response, 403);
    });
  });

  // ================================================================
  // PATCH /api/projects/:id/assign
  // ================================================================
  describe('PATCH /api/projects/:id/assign', () => {
    it('lets an OWNER reassign the moderator, verified in the database', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const moderator = await createModerator();
      const project = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id });

      const response = await request(app)
        .patch(`/api/projects/${project.id}/assign`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ moderatorId: moderator.user.id });

      expectApiSuccess(response, 200, 'Project assignment updated successfully.');

      const dbProject = await prisma.project.findUnique({ where: { id: project.id } });
      expect(dbProject?.moderatorId).toBe(moderator.user.id);
    });

    it('lets an OWNER reassign the owner, verified in the database', async () => {
      const owner = await createOwner();
      const newOwner = await createOwner();
      const customer = await createCustomer();
      const project = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id });

      const response = await request(app)
        .patch(`/api/projects/${project.id}/assign`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ ownerId: newOwner.user.id });

      expectApiSuccess(response, 200);

      const dbProject = await prisma.project.findUnique({ where: { id: project.id } });
      expect(dbProject?.ownerId).toBe(newOwner.user.id);
    });

    it('lets an OWNER reassign the customer, verified in the database', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const newCustomer = await createCustomer();
      const project = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id });

      const response = await request(app)
        .patch(`/api/projects/${project.id}/assign`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ customerId: newCustomer.user.id });

      expectApiSuccess(response, 200);

      const dbProject = await prisma.project.findUnique({ where: { id: project.id } });
      expect(dbProject?.customerId).toBe(newCustomer.user.id);
    });

    it('returns 404 assigning a nonexistent moderator, database unchanged', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const project = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id });

      const response = await request(app)
        .patch(`/api/projects/${project.id}/assign`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ moderatorId: '00000000-0000-0000-0000-000000000000' });

      expectApiError(response, 404);
      const dbProject = await prisma.project.findUnique({ where: { id: project.id } });
      expect(dbProject?.moderatorId).toBeNull();
    });

    it('rejects assigning a moderatorId that belongs to a non-MODERATOR user with 400, database unchanged', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const otherCustomer = await createCustomer();
      const project = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id });

      const response = await request(app)
        .patch(`/api/projects/${project.id}/assign`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ moderatorId: otherCustomer.user.id });

      expectApiError(response, 400);
      const dbProject = await prisma.project.findUnique({ where: { id: project.id } });
      expect(dbProject?.moderatorId).toBeNull();
    });

    it('rejects assigning an inactive moderator with 400, database unchanged', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const inactiveModerator = await createModerator({ isActive: false });
      const project = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id });

      const response = await request(app)
        .patch(`/api/projects/${project.id}/assign`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ moderatorId: inactiveModerator.user.id });

      expectApiError(response, 400);
      const dbProject = await prisma.project.findUnique({ where: { id: project.id } });
      expect(dbProject?.moderatorId).toBeNull();
    });

    it('rejects an empty assignment body with 400', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const project = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id });

      const response = await request(app).patch(`/api/projects/${project.id}/assign`).set('Authorization', `Bearer ${owner.token}`).send({});

      expectApiError(response, 400, 'Validation failed.');
    });

    it('rejects a MODERATOR calling the assign endpoint with 403', async () => {
      const owner = await createOwner();
      const moderator = await createModerator();
      const otherModerator = await createModerator();
      const customer = await createCustomer();
      const project = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id, moderatorId: moderator.user.id });

      const response = await request(app)
        .patch(`/api/projects/${project.id}/assign`)
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ moderatorId: otherModerator.user.id });

      expectApiError(response, 403);
    });

    it('rejects a CUSTOMER calling the assign endpoint with 403', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const moderator = await createModerator();
      const project = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id });

      const response = await request(app)
        .patch(`/api/projects/${project.id}/assign`)
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ moderatorId: moderator.user.id });

      expectApiError(response, 403);
    });
  });

  // ================================================================
  // DELETE /api/projects/:id
  // ================================================================
  describe('DELETE /api/projects/:id', () => {
    it('lets an OWNER delete a project, verified in the database', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const project = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id });

      const response = await request(app).delete(`/api/projects/${project.id}`).set('Authorization', `Bearer ${owner.token}`);

      expectApiSuccess(response, 200, 'Project deleted successfully.');

      const dbProject = await prisma.project.findUnique({ where: { id: project.id } });
      expect(dbProject).toBeNull();
    });

    it('rejects a MODERATOR deleting a project with 403, row remains', async () => {
      const owner = await createOwner();
      const moderator = await createModerator();
      const customer = await createCustomer();
      const project = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id, moderatorId: moderator.user.id });

      const response = await request(app).delete(`/api/projects/${project.id}`).set('Authorization', `Bearer ${moderator.token}`);

      expectApiError(response, 403);
      const dbProject = await prisma.project.findUnique({ where: { id: project.id } });
      expect(dbProject).not.toBeNull();
    });

    it('rejects a CUSTOMER deleting a project with 403, row remains', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const project = await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id });

      const response = await request(app).delete(`/api/projects/${project.id}`).set('Authorization', `Bearer ${customer.token}`);

      expectApiError(response, 403);
      const dbProject = await prisma.project.findUnique({ where: { id: project.id } });
      expect(dbProject).not.toBeNull();
    });

    it('returns 404 deleting a nonexistent project', async () => {
      const owner = await createOwner();

      const response = await request(app)
        .delete('/api/projects/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${owner.token}`);

      expectApiError(response, 404);
    });
  });
});
