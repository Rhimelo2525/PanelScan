import { NotificationType, ProjectSource, ProjectStatus } from '@prisma/client';
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

    it('lets a MODERATOR view every customer project, assigned or not', async () => {
      const moderator = await createModerator();
      const customerA = await createCustomer();
      const customerB = await createCustomer();
      const first = await createTestProject({ customerId: customerA.user.id });
      const second = await createTestProject({ customerId: customerB.user.id });

      const response = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${moderator.token}`)
        .query({ limit: '100' });

      expectApiSuccess(response, 200);
      const ids = (response.body.data.projects as Array<{ id: string }>).map((p) => p.id);
      expect(ids).toEqual(expect.arrayContaining([first.id, second.id]));
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

    it("lets a MODERATOR view a project they aren't assigned to", async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const project = await createTestProject({ customerId: customer.user.id });

      const response = await request(app).get(`/api/projects/${project.id}`).set('Authorization', `Bearer ${moderator.token}`);

      expectApiSuccess(response, 200);
      expect(response.body.data.project.id).toBe(project.id);
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
  // Mobile app projects (POST/DELETE /api/projects/mobile)
  // ================================================================
  describe('Mobile app projects', () => {
    const appProject = {
      externalProjectId: 'app-project-1',
      name: 'Wall · 3.20 × 2.60 m',
      description: 'Wall · Oak Wall Panel',
      budget: 12950,
      arMetadata: { surfaceType: 'WALL', widthMeters: 3.2, heightMeters: 2.6, finalQuantity: 7 },
    };

    it('lets a CUSTOMER save an app project as their own MOBILE_AR_3D project, verified in the database', async () => {
      const customer = await createCustomer();

      const response = await request(app)
        .post('/api/projects/mobile')
        .set('Authorization', `Bearer ${customer.token}`)
        .send(appProject);

      expectApiSuccess(response, 200, 'Project saved successfully.');
      const dbProject = await prisma.project.findUnique({ where: { id: response.body.data.project.id } });
      expect(dbProject?.customerId).toBe(customer.user.id);
      expect(dbProject?.source).toBe(ProjectSource.MOBILE_AR_3D);
      expect(dbProject?.externalProjectId).toBe('app-project-1');
      expect(dbProject?.status).toBe(ProjectStatus.PENDING);
      expect(dbProject?.ownerId).toBeNull();
      expect(Number(dbProject?.budget)).toBe(12950);
      expect(dbProject?.arMetadata).toEqual(appProject.arMetadata);

      const listed = await request(app)
        .get('/api/projects?source=MOBILE_AR_3D')
        .set('Authorization', `Bearer ${customer.token}`);
      expect(listed.body.data.projects.map((p: { id: string }) => p.id)).toEqual([dbProject?.id]);
    });

    it('tells the owner and moderators about a new app project once, with its code', async () => {
      const owner = await createOwner();
      const moderator = await createModerator();
      const customer = await createCustomer();

      const saved = await request(app).post('/api/projects/mobile').set('Authorization', `Bearer ${customer.token}`).send(appProject);
      await request(app).post('/api/projects/mobile').set('Authorization', `Bearer ${customer.token}`).send({ ...appProject, name: 'Living room wall' });

      const code = saved.body.data.project.projectCode as string;
      for (const staff of [owner, moderator]) {
        const notifications = await prisma.notification.findMany({ where: { userId: staff.user.id, title: 'New project from the mobile app' } });
        expect(notifications).toHaveLength(1);
        expect(notifications[0]?.type).toBe(NotificationType.SYSTEM);
        expect(notifications[0]?.message).toContain(`"Wall · 3.20 × 2.60 m" (${code})`);
        expect(notifications[0]?.metadata).toEqual({ projectId: saved.body.data.project.id, projectCode: code, event: 'MOBILE_PROJECT_CREATED' });
      }
    });

    it('updates the same project when the app saves it again, instead of adding another', async () => {
      const customer = await createCustomer();
      const first = await request(app).post('/api/projects/mobile').set('Authorization', `Bearer ${customer.token}`).send(appProject);

      const second = await request(app)
        .post('/api/projects/mobile')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ ...appProject, name: 'Living room wall', arMetadata: { ...appProject.arMetadata, finalQuantity: 8 } });

      expectApiSuccess(second, 200);
      expect(second.body.data.project.id).toBe(first.body.data.project.id);
      const rows = await prisma.project.findMany({ where: { customerId: customer.user.id } });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.name).toBe('Living room wall');
      expect((rows[0]?.arMetadata as { finalQuantity: number }).finalQuantity).toBe(8);
    });

    it("keeps customers' app projects apart even with the same app project id", async () => {
      const first = await createCustomer();
      const second = await createCustomer();

      await request(app).post('/api/projects/mobile').set('Authorization', `Bearer ${first.token}`).send(appProject);
      await request(app).post('/api/projects/mobile').set('Authorization', `Bearer ${second.token}`).send(appProject);

      expect(await prisma.project.count({ where: { customerId: first.user.id } })).toBe(1);
      expect(await prisma.project.count({ where: { customerId: second.user.id } })).toBe(1);
    });

    it('rejects staff saving an app project with 403, and an invalid body with 400', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();

      const staff = await request(app).post('/api/projects/mobile').set('Authorization', `Bearer ${owner.token}`).send(appProject);
      expectApiError(staff, 403);

      const invalid = await request(app)
        .post('/api/projects/mobile')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ ...appProject, name: 'ab' });
      expectApiError(invalid, 400);
      expect(await prisma.project.count({ where: { customerId: customer.user.id } })).toBe(0);
    });

    it('lets a CUSTOMER delete their pending app project', async () => {
      const customer = await createCustomer();
      await request(app).post('/api/projects/mobile').set('Authorization', `Bearer ${customer.token}`).send(appProject);

      const response = await request(app)
        .delete('/api/projects/mobile/app-project-1')
        .set('Authorization', `Bearer ${customer.token}`);

      expectApiSuccess(response, 200, 'Project deleted successfully.');
      expect(await prisma.project.count({ where: { customerId: customer.user.id } })).toBe(0);
    });

    it('refuses to delete an app project the team has taken on, database unchanged', async () => {
      const customer = await createCustomer();
      const moderator = await createModerator();
      const saved = await request(app).post('/api/projects/mobile').set('Authorization', `Bearer ${customer.token}`).send(appProject);
      await prisma.project.update({ where: { id: saved.body.data.project.id }, data: { moderatorId: moderator.user.id } });

      const response = await request(app)
        .delete('/api/projects/mobile/app-project-1')
        .set('Authorization', `Bearer ${customer.token}`);

      expectApiError(response, 400, /already being handled/);
      expect(await prisma.project.count({ where: { id: saved.body.data.project.id } })).toBe(1);
    });

    it("returns 404 for another customer's app project and for staff-created projects", async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const other = await createCustomer();
      await request(app).post('/api/projects/mobile').set('Authorization', `Bearer ${other.token}`).send(appProject);
      await createTestProject({ customerId: customer.user.id, ownerId: owner.user.id, name: 'Manual project' });

      const response = await request(app)
        .delete('/api/projects/mobile/app-project-1')
        .set('Authorization', `Bearer ${customer.token}`);

      expectApiError(response, 404);
      expect(await prisma.project.count({ where: { customerId: other.user.id } })).toBe(1);
      expect(await prisma.project.count({ where: { customerId: customer.user.id } })).toBe(1);
    });
  });

  // ================================================================
  // Staff access is view-only
  // ================================================================
  describe('Staff access is view-only', () => {
    it('gives the OWNER and MODERATOR no way to create, edit, assign, change the status of, or delete a project', async () => {
      const owner = await createOwner();
      const moderator = await createModerator();
      const customer = await createCustomer();
      const project = await createTestProject({ customerId: customer.user.id, name: 'Customer project' });
      const before = await prisma.project.findUnique({ where: { id: project.id } });

      for (const staff of [owner, moderator]) {
        const auth = `Bearer ${staff.token}`;
        const attempts = [
          request(app).post('/api/projects').set('Authorization', auth).send({ customerId: customer.user.id, name: 'Staff project' }),
          request(app).patch(`/api/projects/${project.id}`).set('Authorization', auth).send({ name: 'Renamed', notes: 'Edited' }),
          request(app).patch(`/api/projects/${project.id}/status`).set('Authorization', auth).send({ status: ProjectStatus.IN_PROGRESS }),
          request(app).patch(`/api/projects/${project.id}/assign`).set('Authorization', auth).send({ moderatorId: moderator.user.id }),
          request(app).delete(`/api/projects/${project.id}`).set('Authorization', auth),
          request(app).post('/api/projects/mobile').set('Authorization', auth).send({ externalProjectId: 'x', name: 'Staff app project' }),
          request(app).delete(`/api/projects/mobile/${project.id}`).set('Authorization', auth),
        ];
        for (const response of await Promise.all(attempts)) {
          expect(response.status).toBeGreaterThanOrEqual(400);
          expect(response.body.success).toBe(false);
        }
      }

      expect(await prisma.project.findUnique({ where: { id: project.id } })).toEqual(before);
      expect(await prisma.project.count({ where: { customerId: customer.user.id } })).toBe(1);
    });
  });

  // ================================================================
  // Project reference codes
  // ================================================================
  describe('Project reference codes', () => {
    const codeOf = (project: { id: string; createdAt: Date }) =>
      `PRJ-${new Date(project.createdAt.getTime() + 8 * 3600 * 1000).getUTCFullYear()}-${project.id.slice(0, 8).toUpperCase()}`;

    it('gives every project a PRJ code, the same for the customer and staff', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const project = await createTestProject({ customerId: customer.user.id });

      const asCustomer = await request(app).get(`/api/projects/${project.id}`).set('Authorization', `Bearer ${customer.token}`);
      const asStaff = await request(app).get('/api/projects').set('Authorization', `Bearer ${moderator.token}`).query({ customerId: customer.user.id });

      expect(asCustomer.body.data.project.projectCode).toBe(codeOf(project));
      expect(asCustomer.body.data.project.projectCode).toMatch(/^PRJ-\d{4}-[0-9A-F]{8}$/);
      expect(asStaff.body.data.projects[0].projectCode).toBe(codeOf(project));
    });

    it('finds exactly that project by its code, in any letter case', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const wanted = await createTestProject({ customerId: customer.user.id, name: 'Wanted' });
      await createTestProject({ customerId: customer.user.id, name: 'Other' });

      const response = await request(app)
        .get('/api/projects')
        .set('Authorization', `Bearer ${owner.token}`)
        .query({ code: ` ${codeOf(wanted).toLowerCase()} ` });

      expectApiSuccess(response, 200);
      expect((response.body.data.projects as Array<{ id: string }>).map((p) => p.id)).toEqual([wanted.id]);
    });

    it("finds nothing for a code from another year, or another customer's code when a customer searches", async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const outsider = await createCustomer();
      const project = await createTestProject({ customerId: customer.user.id });
      const wrongYear = codeOf(project).replace(/^PRJ-\d{4}/, 'PRJ-1999');

      const byYear = await request(app).get('/api/projects').set('Authorization', `Bearer ${owner.token}`).query({ code: wrongYear });
      const byOutsider = await request(app).get('/api/projects').set('Authorization', `Bearer ${outsider.token}`).query({ code: codeOf(project) });

      expect(byYear.body.data.projects).toEqual([]);
      expect(byOutsider.body.data.projects).toEqual([]);
    });

    it('rejects something that is not a project code with 400', async () => {
      const owner = await createOwner();

      const response = await request(app).get('/api/projects').set('Authorization', `Bearer ${owner.token}`).query({ code: 'PRJ-12' });

      expectApiError(response, 400, 'Validation failed.');
    });
  });

  // ================================================================
  // GET /api/projects/customers (customer directory)
  // ================================================================
  describe('GET /api/projects/customers', () => {
    it('lists customers who have projects, most recently active first, with their project counts', async () => {
      const moderator = await createModerator();
      const earlier = await createCustomer();
      const later = await createCustomer();
      const withoutProjects = await createCustomer();
      await createTestProject({ customerId: earlier.user.id });
      await createTestProject({ customerId: earlier.user.id });
      await createTestProject({ customerId: later.user.id });

      const response = await request(app)
        .get('/api/projects/customers')
        .set('Authorization', `Bearer ${moderator.token}`)
        .query({ limit: '100' });

      expectApiSuccess(response, 200, 'Customers retrieved successfully.');
      const customers = response.body.data.customers as Array<{ id: string; projectCount: number; email: string; lastProjectAt: string }>;
      const ids = customers.map((c) => c.id);
      expect(ids.indexOf(later.user.id)).toBeGreaterThanOrEqual(0);
      expect(ids.indexOf(later.user.id)).toBeLessThan(ids.indexOf(earlier.user.id));
      expect(ids).not.toContain(withoutProjects.user.id);
      expect(customers.find((c) => c.id === earlier.user.id)?.projectCount).toBe(2);
      expect(customers.find((c) => c.id === earlier.user.id)?.email).toBe(earlier.user.email);
      expect(typeof customers[0]?.lastProjectAt).toBe('string');
    });

    it('searches customers by name or email', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const other = await createCustomer();
      await createTestProject({ customerId: customer.user.id });
      await createTestProject({ customerId: other.user.id });

      const byEmail = await request(app)
        .get('/api/projects/customers')
        .set('Authorization', `Bearer ${owner.token}`)
        .query({ search: customer.user.email.toUpperCase() });
      const byName = await request(app)
        .get('/api/projects/customers')
        .set('Authorization', `Bearer ${owner.token}`)
        .query({ search: `${customer.user.firstName} ${customer.user.lastName}`, limit: '100' });

      expect((byEmail.body.data.customers as Array<{ id: string }>).map((c) => c.id)).toEqual([customer.user.id]);
      expect((byName.body.data.customers as Array<{ id: string }>).map((c) => c.id)).toContain(customer.user.id);
    });

    it('refuses customers with 403', async () => {
      const customer = await createCustomer();

      const response = await request(app).get('/api/projects/customers').set('Authorization', `Bearer ${customer.token}`);

      expectApiError(response, 403);
    });
  });
});
