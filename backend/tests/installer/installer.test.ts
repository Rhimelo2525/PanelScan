import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import { createCustomer, createModerator, createOwner, createTestBooking, createTestInstaller } from '../helpers/factories';
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

describe('Installer module', () => {
  // ================================================================
  // AUTHENTICATION
  // ================================================================
  describe('Authentication', () => {
    it('returns 401 when no JWT is provided', async () => {
      const response = await request(app).get('/api/installers');
      expectApiError(response, 401);
    });

    it('returns 401 for a malformed JWT', async () => {
      const response = await request(app).get('/api/installers').set('Authorization', 'Bearer not-a-real-token');
      expectApiError(response, 401);
    });
  });

  // ================================================================
  // CREATE INSTALLER
  // ================================================================
  describe('Create installer', () => {
    it('lets a MODERATOR create an installer, with every field verified in the database', async () => {
      const { token } = await createModerator();

      const response = await request(app).post('/api/installers').set('Authorization', `Bearer ${token}`).send({
        firstName: 'Juan',
        lastName: 'Dela Cruz',
        email: 'juan.delacruz@panelscan.test',
        phone: '09171234567',
        specialty: 'Wall Panels',
      });

      expectApiSuccess(response, 201, 'Installer created successfully.');
      expect(response.body.data.installer).toBeDefined();

      const dbInstaller = await prisma.installer.findUnique({ where: { id: response.body.data.installer.id } });
      expect(dbInstaller).not.toBeNull();
      expect(dbInstaller?.firstName).toBe('Juan');
      expect(dbInstaller?.lastName).toBe('Dela Cruz');
      expect(dbInstaller?.email).toBe('juan.delacruz@panelscan.test');
      expect(dbInstaller?.phone).toBe('+639171234567');
      expect(dbInstaller?.specialty).toBe('Wall Panels');
      expect(dbInstaller?.isActive).toBe(true);
      expect(dbInstaller?.createdAt).toBeInstanceOf(Date);
      expect(dbInstaller?.middleInitial).toBeNull();
    });

    it('stores an optional middle initial as bare letters', async () => {
      const { token } = await createModerator();

      const response = await request(app).post('/api/installers').set('Authorization', `Bearer ${token}`).send({
        firstName: 'Clarisse',
        middleInitial: 'm.',
        lastName: 'Labampa',
        phone: '09181234567',
      });

      expect(response.status).toBe(201);
      const dbInstaller = await prisma.installer.findUnique({ where: { id: response.body.data.installer.id } });
      expect(dbInstaller?.middleInitial).toBe('M');
    });

    it.each([
      ['a leading space in the first name', { firstName: ' Clarisse' }],
      ['a double space in the last name', { lastName: 'Dela  Cruz' }],
      ['a trailing space in the first name', { firstName: 'Clarisse ' }],
      ['a space in the middle initial', { middleInitial: 'M .' }],
      ['a middle initial with numbers', { middleInitial: 'M1' }],
      ['a first name over 35 characters', { firstName: 'A'.repeat(36) }],
    ])('refuses %s, same as Create Account', async (_case, override) => {
      const { token } = await createModerator();

      const response = await request(app)
        .post('/api/installers')
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Clarisse', lastName: 'Labampa', phone: '09451234567', ...override });

      expect(response.status).toBe(400);
      expect(await prisma.installer.count({ where: { phone: '+639451234567' } })).toBe(0);
    });

    it('rejects a CUSTOMER attempting to create an installer with 403, no row created', async () => {
      const { token } = await createCustomer();

      const response = await request(app).post('/api/installers').set('Authorization', `Bearer ${token}`).send({
        firstName: 'Should',
        lastName: 'NotWork',
        phone: '09171234567',
      });

      expectApiError(response, 403);

      const count = await prisma.installer.count({ where: { firstName: 'Should', lastName: 'NotWork' } });
      expect(count).toBe(0);
    });

    it('rejects an OWNER attempting to create an installer with 403 - installer management is MODERATOR-only', async () => {
      const { token } = await createOwner();

      const response = await request(app).post('/api/installers').set('Authorization', `Bearer ${token}`).send({
        firstName: 'Should',
        lastName: 'AlsoNotWork',
        phone: '09171234567',
      });

      expectApiError(response, 403);
    });
  });

  // ================================================================
  // LIST INSTALLERS
  // ================================================================
  describe('List installers', () => {
    it('returns active installers only', async () => {
      const { token } = await createModerator();
      const active = await createTestInstaller({ isActive: true });
      const inactive = await createTestInstaller({ isActive: false });

      const response = await request(app).get('/api/installers').set('Authorization', `Bearer ${token}`);

      expectApiSuccess(response, 200, 'Installers retrieved successfully.');
      const ids = (response.body.data.installers as Array<{ id: string }>).map((i) => i.id);
      expect(ids).toContain(active.id);
      expect(ids).not.toContain(inactive.id);

      // Confirm the inactive installer still exists in the database - it's
      // filtered from the response, not deleted.
      const dbInactive = await prisma.installer.findUnique({ where: { id: inactive.id } });
      expect(dbInactive).not.toBeNull();
      expect(dbInactive?.isActive).toBe(false);
    });

    it('lists every installer with status=all, active ones first', async () => {
      const { token } = await createModerator();
      const inactive = await createTestInstaller({ firstName: 'Aaron', isActive: false });
      const active = await createTestInstaller({ firstName: 'Zed', isActive: true });

      const response = await request(app).get('/api/installers?status=all').set('Authorization', `Bearer ${token}`);

      expectApiSuccess(response, 200);
      expect((response.body.data.installers as Array<{ id: string }>).map((i) => i.id)).toEqual([active.id, inactive.id]);
    });

    it('lists only deactivated installers with status=inactive', async () => {
      const { token } = await createModerator();
      const inactive = await createTestInstaller({ isActive: false });
      await createTestInstaller({ isActive: true });

      const response = await request(app).get('/api/installers?status=inactive').set('Authorization', `Bearer ${token}`);

      expect((response.body.data.installers as Array<{ id: string }>).map((i) => i.id)).toEqual([inactive.id]);
    });

    it('refuses an unknown status', async () => {
      const { token } = await createModerator();
      const response = await request(app).get('/api/installers?status=gone').set('Authorization', `Bearer ${token}`);
      expectApiError(response, 400);
    });
  });

  // ================================================================
  // UPDATE INSTALLER
  // ================================================================
  describe('Update installer', () => {
    it('updates name, phone, and specialty, verified in the database', async () => {
      const { token } = await createModerator();
      const installer = await createTestInstaller({ firstName: 'Original', lastName: 'Name', phone: '09170000000' });

      const response = await request(app)
        .patch(`/api/installers/${installer.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Updated', lastName: 'Surname', phone: '09170001111', specialty: 'Ceiling Panels' });

      expectApiSuccess(response, 200, 'Installer updated successfully.');

      const dbInstaller = await prisma.installer.findUnique({ where: { id: installer.id } });
      expect(dbInstaller?.firstName).toBe('Updated');
      expect(dbInstaller?.lastName).toBe('Surname');
      expect(dbInstaller?.phone).toBe('+639170001111');
      expect(dbInstaller?.specialty).toBe('Ceiling Panels');
    });

    it('returns 404 when updating a nonexistent installer', async () => {
      const { token } = await createModerator();

      const response = await request(app)
        .patch('/api/installers/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${token}`)
        .send({ firstName: 'Anyone' });

      expectApiError(response, 404);
    });
  });

  // ================================================================
  // DEACTIVATE INSTALLER
  // ================================================================
  describe('Deactivate installer', () => {
    it('sets isActive to false, verified in the database, and excludes it from the active list afterward', async () => {
      const { token } = await createModerator();
      const installer = await createTestInstaller({ isActive: true });

      const response = await request(app).patch(`/api/installers/${installer.id}/deactivate`).set('Authorization', `Bearer ${token}`);

      expectApiSuccess(response, 200, 'Installer deactivated successfully.');
      expect(response.body.data.installer.isActive).toBe(false);

      const dbInstaller = await prisma.installer.findUnique({ where: { id: installer.id } });
      expect(dbInstaller?.isActive).toBe(false);

      const listResponse = await request(app).get('/api/installers').set('Authorization', `Bearer ${token}`);
      const ids = (listResponse.body.data.installers as Array<{ id: string }>).map((i) => i.id);
      expect(ids).not.toContain(installer.id);
    });
  });

  // ================================================================
  // ACTIVATE INSTALLER
  // ================================================================
  describe('Activate installer', () => {
    it('brings a deactivated installer back to the active list', async () => {
      const { token } = await createModerator();
      const installer = await createTestInstaller({ isActive: false });

      const response = await request(app).patch(`/api/installers/${installer.id}/activate`).set('Authorization', `Bearer ${token}`);

      expectApiSuccess(response, 200, 'Installer activated successfully.');
      const dbInstaller = await prisma.installer.findUnique({ where: { id: installer.id } });
      expect(dbInstaller?.isActive).toBe(true);

      const listResponse = await request(app).get('/api/installers').set('Authorization', `Bearer ${token}`);
      expect((listResponse.body.data.installers as Array<{ id: string }>).map((i) => i.id)).toContain(installer.id);
    });

    it('returns 404 for a nonexistent installer', async () => {
      const { token } = await createModerator();
      const response = await request(app).patch('/api/installers/00000000-0000-0000-0000-000000000000/activate').set('Authorization', `Bearer ${token}`);
      expectApiError(response, 404);
    });

    it('rejects an OWNER with 403 and leaves the installer inactive', async () => {
      const { token } = await createOwner();
      const installer = await createTestInstaller({ isActive: false });

      const response = await request(app).patch(`/api/installers/${installer.id}/activate`).set('Authorization', `Bearer ${token}`);

      expectApiError(response, 403);
      expect((await prisma.installer.findUnique({ where: { id: installer.id } }))?.isActive).toBe(false);
    });
  });

  // ================================================================
  // DELETE INSTALLER
  // ================================================================
  describe('Delete installer', () => {
    it('removes an installer with no bookings, active or not', async () => {
      const { token } = await createModerator();
      const active = await createTestInstaller({ isActive: true });
      const inactive = await createTestInstaller({ isActive: false });

      for (const installer of [active, inactive]) {
        const response = await request(app).delete(`/api/installers/${installer.id}`).set('Authorization', `Bearer ${token}`);
        expectApiSuccess(response, 200, 'Installer deleted successfully.');
        expect(await prisma.installer.findUnique({ where: { id: installer.id } })).toBeNull();
      }
    });

    it('refuses an installer with a booking, keeping both the installer and the booking', async () => {
      const { token } = await createModerator();
      const customer = await createCustomer();
      const installer = await createTestInstaller();
      const booking = await createTestBooking({ customerId: customer.user.id });
      await prisma.booking.update({ where: { id: booking.id }, data: { installerId: installer.id } });

      const response = await request(app).delete(`/api/installers/${installer.id}`).set('Authorization', `Bearer ${token}`);

      expectApiError(response, 409, /1 installation booking on record/);
      expect(await prisma.installer.findUnique({ where: { id: installer.id } })).not.toBeNull();
      expect((await prisma.booking.findUnique({ where: { id: booking.id } }))?.installerId).toBe(installer.id);
    });

    it('returns 404 for a nonexistent installer', async () => {
      const { token } = await createModerator();
      const response = await request(app).delete('/api/installers/00000000-0000-0000-0000-000000000000').set('Authorization', `Bearer ${token}`);
      expectApiError(response, 404);
    });

    it('rejects an OWNER with 403 and keeps the installer', async () => {
      const { token } = await createOwner();
      const installer = await createTestInstaller();

      const response = await request(app).delete(`/api/installers/${installer.id}`).set('Authorization', `Bearer ${token}`);

      expectApiError(response, 403);
      expect(await prisma.installer.findUnique({ where: { id: installer.id } })).not.toBeNull();
    });
  });
});
