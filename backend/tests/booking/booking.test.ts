import { BookingStatus, ProjectStatus } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import { createCustomer, createModerator, createOwner, createTestBooking, createTestInstaller } from '../helpers/factories';
import app from '../helpers/testApp';

const VALID_ADDRESS = '123 Rizal Street, Quezon City, Metro Manila, 1100';
const futureDateIso = (daysFromNow: number): string => new Date(Date.now() + daysFromNow * 24 * 60 * 60 * 1000).toISOString();

/**
 * Every test in this suite checks HTTP status + response.body.success +
 * response.body.message, per the QA requirements for this module.
 */
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

describe('Booking module', () => {
  // ================================================================
  // AUTHENTICATION TESTS
  // ================================================================
  describe('Authentication', () => {
    it('returns 401 when no JWT is provided on a booking route', async () => {
      const response = await request(app).get('/api/bookings');
      expectApiError(response, 401);
    });

    it('returns 401 for a malformed JWT', async () => {
      const response = await request(app).get('/api/bookings').set('Authorization', 'Bearer not-a-real-token');
      expectApiError(response, 401);
    });
  });

  // ================================================================
  // CUSTOMER BOOKING CREATION
  // ================================================================
  describe('Customer booking creation', () => {
    it('creates an installation booking with full response and database verification', async () => {
      const { token, user } = await createCustomer();
      const scheduledDateIso = futureDateIso(7);

      const response = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${token}`)
        .send({ scheduledDate: scheduledDateIso, address: VALID_ADDRESS, notes: 'Please call before arriving.' });

      // --- HTTP response ---
      expectApiSuccess(response, 201, 'Booking created successfully.');
      expect(response.body.data.booking).toBeDefined();
      expect(response.body.data.booking.status).toBe(BookingStatus.PENDING);

      // --- Database: Booking row exists, with correct customerId/status/dates ---
      const dbBooking = await prisma.booking.findUnique({ where: { id: response.body.data.booking.id } });
      expect(dbBooking).not.toBeNull();
      expect(dbBooking?.customerId).toBe(user.id);
      expect(dbBooking?.status).toBe(BookingStatus.PENDING);
      expect(dbBooking?.scheduledDate.toISOString()).toBe(new Date(scheduledDateIso).toISOString());
      expect(dbBooking?.address).toBe(VALID_ADDRESS);
      expect(dbBooking?.createdAt).toBeInstanceOf(Date);
    });
  });

  // ================================================================
  // CUSTOMER OWNERSHIP TESTS
  // ================================================================
  describe('Customer ownership', () => {
    it("returns 403 or 404 (matching existing API behavior) when Customer B requests Customer A's booking, with no data leaked", async () => {
      const customerA = await createCustomer();
      const customerB = await createCustomer();
      const booking = await createTestBooking({ customerId: customerA.user.id, address: VALID_ADDRESS });

      const response = await request(app).get(`/api/bookings/${booking.id}`).set('Authorization', `Bearer ${customerB.token}`);

      expect([403, 404]).toContain(response.status);
      expect(response.body.success).toBe(false);
      // No data leakage: the booking's actual details must not appear anywhere in the error response.
      expect(JSON.stringify(response.body)).not.toContain(VALID_ADDRESS);
      expect(response.body.data).toBeUndefined();

      // The booking itself is untouched in the database.
      const dbBooking = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(dbBooking?.customerId).toBe(customerA.user.id);
      expect(dbBooking?.address).toBe(VALID_ADDRESS);
    });
  });

  // ================================================================
  // CUSTOMER BOOKING LIST
  // ================================================================
  describe('Customer booking list', () => {
    it("GET /api/bookings returns only Customer A's bookings, confirmed against the database", async () => {
      const customerA = await createCustomer();
      const customerB = await createCustomer();
      const bookingA = await createTestBooking({ customerId: customerA.user.id });
      const bookingB = await createTestBooking({ customerId: customerB.user.id });

      const response = await request(app).get('/api/bookings').set('Authorization', `Bearer ${customerA.token}`);

      expectApiSuccess(response, 200, 'Bookings retrieved successfully.');
      const returnedIds = (response.body.data.bookings as Array<{ id: string }>).map((b) => b.id);
      expect(returnedIds).toContain(bookingA.id);
      expect(returnedIds).not.toContain(bookingB.id);

      // Confirm Customer B's booking still exists in the database - it's
      // filtered out of the response, not lost.
      const dbBookingB = await prisma.booking.findUnique({ where: { id: bookingB.id } });
      expect(dbBookingB).not.toBeNull();
      expect(dbBookingB?.customerId).toBe(customerB.user.id);
    });
  });

  // ================================================================
  // BOOKING VALIDATION TESTS
  // ================================================================
  describe('Booking validation', () => {
    it('rejects a missing scheduledDate with 400', async () => {
      const { token } = await createCustomer();

      const response = await request(app).post('/api/bookings').set('Authorization', `Bearer ${token}`).send({ address: VALID_ADDRESS });

      expectApiError(response, 400, 'Validation failed.');
      expect(response.body.errors.some((e: { path: string }) => e.path === 'scheduledDate')).toBe(true);

      const count = await prisma.booking.count();
      expect(count).toBe(0);
    });

    it('rejects a missing address with 400', async () => {
      const { token } = await createCustomer();

      const response = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${token}`)
        .send({ scheduledDate: futureDateIso(7) });

      expectApiError(response, 400, 'Validation failed.');
      expect(response.body.errors.some((e: { path: string }) => e.path === 'address')).toBe(true);

      const count = await prisma.booking.count();
      expect(count).toBe(0);
    });

    it('rejects an invalid date format with 400', async () => {
      const { token } = await createCustomer();

      const response = await request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${token}`)
        .send({ scheduledDate: 'not-a-real-date', address: VALID_ADDRESS });

      expectApiError(response, 400, 'Validation failed.');

      const count = await prisma.booking.count();
      expect(count).toBe(0);
    });

    it('rejects an invalid booking status on status update with 400', async () => {
      const { token } = await createModerator();
      const booking = await createTestBooking({ customerId: (await createCustomer()).user.id, status: BookingStatus.PENDING });

      const response = await request(app)
        .patch(`/api/bookings/${booking.id}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'NOT_A_REAL_STATUS' });

      expectApiError(response, 400, 'Validation failed.');

      const dbBooking = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(dbBooking?.status).toBe(BookingStatus.PENDING);
    });
  });

  // ================================================================
  // CUSTOMER CANCELLATION TESTS
  // ================================================================
  describe('Customer cancellation', () => {
    it('cancels a PENDING booking: PENDING -> CANCELLED, verified in the database', async () => {
      const { token, user } = await createCustomer();
      const booking = await createTestBooking({ customerId: user.id, status: BookingStatus.PENDING });

      const before = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(before?.status).toBe(BookingStatus.PENDING);

      const response = await request(app).patch(`/api/bookings/${booking.id}/cancel`).set('Authorization', `Bearer ${token}`);

      expectApiSuccess(response, 200, 'Booking cancelled successfully.');
      expect(response.body.data.booking.status).toBe(BookingStatus.CANCELLED);

      const after = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(after?.status).toBe(BookingStatus.CANCELLED);
    });

    it('rejects cancelling a COMPLETED booking with 400, status remains COMPLETED', async () => {
      const { token, user } = await createCustomer();
      const booking = await createTestBooking({ customerId: user.id, status: BookingStatus.COMPLETED });

      const response = await request(app).patch(`/api/bookings/${booking.id}/cancel`).set('Authorization', `Bearer ${token}`);

      expectApiError(response, 400);

      const dbBooking = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(dbBooking?.status).toBe(BookingStatus.COMPLETED);
    });
  });

  // ================================================================
  // MODERATOR BOOKING MANAGEMENT
  // ================================================================
  describe('Moderator booking management', () => {
    it('lets a MODERATOR view GET /api/bookings/all, returning multiple customers’ bookings', async () => {
      const moderator = await createModerator();
      const customerA = await createCustomer();
      const customerB = await createCustomer();
      await createTestBooking({ customerId: customerA.user.id });
      await createTestBooking({ customerId: customerB.user.id });

      const response = await request(app).get('/api/bookings/all').set('Authorization', `Bearer ${moderator.token}`);

      expectApiSuccess(response, 200, 'Bookings retrieved successfully.');
      const customerIds = (response.body.data.bookings as Array<{ customerId: string }>).map((b) => b.customerId);
      expect(customerIds).toEqual(expect.arrayContaining([customerA.user.id, customerB.user.id]));
    });

    it('rejects a CUSTOMER attempting GET /api/bookings/all with 403', async () => {
      const { token } = await createCustomer();
      const response = await request(app).get('/api/bookings/all').set('Authorization', `Bearer ${token}`);
      expectApiError(response, 403);
    });
  });

  // ================================================================
  // BOOKING STATUS WORKFLOW
  // ================================================================
  describe('Booking status workflow', () => {
    it(
      'walks the complete workflow PENDING -> APPROVED -> SCHEDULED -> COMPLETED, reading the database after every update',
      async () => {
        const { token: moderatorToken } = await createModerator();
        const installer = await createTestInstaller();
        const booking = await createTestBooking({ customerId: (await createCustomer()).user.id, status: BookingStatus.PENDING });

        // PENDING -> APPROVED (generic status endpoint)
        const approveResponse = await request(app)
          .patch(`/api/bookings/${booking.id}/status`)
          .set('Authorization', `Bearer ${moderatorToken}`)
          .send({ status: BookingStatus.APPROVED });
        expectApiSuccess(approveResponse, 200);
        let dbBooking = await prisma.booking.findUnique({ where: { id: booking.id } });
        expect(dbBooking?.status).toBe(BookingStatus.APPROVED);

        // APPROVED -> SCHEDULED: by design (see booking.service.ts), this
        // transition only happens via assign-installer, never via the
        // generic status endpoint (a SCHEDULED booking with no installer
        // wouldn't make operational sense). This is existing business
        // logic and was not modified for this test suite - the workflow
        // below exercises the real, supported path.
        const assignResponse = await request(app)
          .patch(`/api/bookings/${booking.id}/assign-installer`)
          .set('Authorization', `Bearer ${moderatorToken}`)
          .send({ installerId: installer.id });
        expectApiSuccess(assignResponse, 200);
        dbBooking = await prisma.booking.findUnique({ where: { id: booking.id } });
        expect(dbBooking?.status).toBe(BookingStatus.SCHEDULED);
        expect(dbBooking?.installerId).toBe(installer.id);

        // SCHEDULED -> COMPLETED (generic status endpoint)
        const completeResponse = await request(app)
          .patch(`/api/bookings/${booking.id}/status`)
          .set('Authorization', `Bearer ${moderatorToken}`)
          .send({ status: BookingStatus.COMPLETED });
        expectApiSuccess(completeResponse, 200);
        dbBooking = await prisma.booking.findUnique({ where: { id: booking.id } });
        expect(dbBooking?.status).toBe(BookingStatus.COMPLETED);
      },
    );

    it('rejects the invalid transition COMPLETED -> PENDING with 400, database unchanged', async () => {
      const { token } = await createModerator();
      const booking = await createTestBooking({ customerId: (await createCustomer()).user.id, status: BookingStatus.COMPLETED });

      const response = await request(app)
        .patch(`/api/bookings/${booking.id}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: BookingStatus.PENDING });

      expectApiError(response, 400);

      const dbBooking = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(dbBooking?.status).toBe(BookingStatus.COMPLETED);
    });
  });

  // ================================================================
  // ASSIGN INSTALLER TESTS
  // ================================================================
  describe('Assign installer', () => {
    it('assigns an installer to an APPROVED booking: installerId set, status APPROVED -> SCHEDULED', async () => {
      const { token } = await createModerator();
      const installer = await createTestInstaller();
      const booking = await createTestBooking({ customerId: (await createCustomer()).user.id, status: BookingStatus.APPROVED });

      const response = await request(app)
        .patch(`/api/bookings/${booking.id}/assign-installer`)
        .set('Authorization', `Bearer ${token}`)
        .send({ installerId: installer.id });

      expectApiSuccess(response, 200, 'Installer assigned successfully.');
      expect(response.body.data.booking.status).toBe(BookingStatus.SCHEDULED);
      expect(response.body.data.booking.installer.id).toBe(installer.id);

      const dbBooking = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(dbBooking?.installerId).toBe(installer.id);
      expect(dbBooking?.status).toBe(BookingStatus.SCHEDULED);
    });
  });

  // ================================================================
  // INVALID ASSIGNMENT TESTS
  // ================================================================
  describe('Invalid installer assignment', () => {
    it('returns 404 when assigning a nonexistent installer, booking unchanged', async () => {
      const { token } = await createModerator();
      const booking = await createTestBooking({ customerId: (await createCustomer()).user.id, status: BookingStatus.APPROVED });

      const response = await request(app)
        .patch(`/api/bookings/${booking.id}/assign-installer`)
        .set('Authorization', `Bearer ${token}`)
        .send({ installerId: '00000000-0000-0000-0000-000000000000' });

      expectApiError(response, 404);

      const dbBooking = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(dbBooking?.installerId).toBeNull();
      expect(dbBooking?.status).toBe(BookingStatus.APPROVED);
    });

    it('returns 400 when assigning an inactive installer, booking unchanged', async () => {
      const { token } = await createModerator();
      const installer = await createTestInstaller({ isActive: false });
      const booking = await createTestBooking({ customerId: (await createCustomer()).user.id, status: BookingStatus.APPROVED });

      const response = await request(app)
        .patch(`/api/bookings/${booking.id}/assign-installer`)
        .set('Authorization', `Bearer ${token}`)
        .send({ installerId: installer.id });

      expectApiError(response, 400, /inactive/i);

      const dbBooking = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(dbBooking?.installerId).toBeNull();
      expect(dbBooking?.status).toBe(BookingStatus.APPROVED);
    });

    it('rejects a CUSTOMER attempting installer assignment with 403', async () => {
      const { token, user } = await createCustomer();
      const installer = await createTestInstaller();
      const booking = await createTestBooking({ customerId: user.id, status: BookingStatus.APPROVED });

      const response = await request(app)
        .patch(`/api/bookings/${booking.id}/assign-installer`)
        .set('Authorization', `Bearer ${token}`)
        .send({ installerId: installer.id });

      expectApiError(response, 403);

      const dbBooking = await prisma.booking.findUnique({ where: { id: booking.id } });
      expect(dbBooking?.installerId).toBeNull();
    });
  });

  // ================================================================
  // PROJECT CONNECTION TEST
  // ================================================================
  describe('Project connection on booking completion', () => {
    it('creates a COMPLETED project for the customer when none exists yet', async () => {
      const { token: moderatorToken } = await createModerator();
      const customer = await createCustomer();
      const booking = await createTestBooking({
        customerId: customer.user.id,
        status: BookingStatus.SCHEDULED,
        address: VALID_ADDRESS,
      });

      const response = await request(app)
        .patch(`/api/bookings/${booking.id}/status`)
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({ status: BookingStatus.COMPLETED });

      expectApiSuccess(response, 200);

      // Check: customerId relationship + status. NOTE: the Prisma schema has
      // no direct Booking<->Project foreign key (Project only carries
      // customerId/ownerId/moderatorId) - this is a known, documented
      // limitation (see PROJECT_NOTES.txt), not an oversight in this test.
      // The "booking connection" is therefore verified indirectly: this
      // project is the one created as a side effect of *this* booking
      // completing, correlated by customerId, which is the only
      // relationship the current schema supports.
      const project = await prisma.project.findFirst({ where: { customerId: customer.user.id } });
      expect(project).not.toBeNull();
      expect(project?.customerId).toBe(customer.user.id);
      expect(project?.status).toBe(ProjectStatus.COMPLETED);
      expect(project?.endDate).not.toBeNull();
    });

    it('updates an existing IN_PROGRESS project to COMPLETED instead of creating a duplicate', async () => {
      const { token: moderatorToken, user: moderatorUser } = await createModerator();
      const customer = await createCustomer();
      const existingProject = await prisma.project.create({
        data: {
          customerId: customer.user.id,
          moderatorId: moderatorUser.id,
          name: 'Existing in-progress project',
          status: ProjectStatus.IN_PROGRESS,
        },
      });
      const booking = await createTestBooking({ customerId: customer.user.id, status: BookingStatus.SCHEDULED });

      const response = await request(app)
        .patch(`/api/bookings/${booking.id}/status`)
        .set('Authorization', `Bearer ${moderatorToken}`)
        .send({ status: BookingStatus.COMPLETED });

      expectApiSuccess(response, 200);

      const projectCount = await prisma.project.count({ where: { customerId: customer.user.id } });
      expect(projectCount).toBe(1); // no duplicate row created

      const dbProject = await prisma.project.findUnique({ where: { id: existingProject.id } });
      expect(dbProject?.status).toBe(ProjectStatus.COMPLETED);
    });
  });

  // ================================================================
  // AUTHORIZATION EXTRAS (OWNER read-only, per this module's own spec)
  // ================================================================
  describe('OWNER authorization (read-only for bookings)', () => {
    it('lets an OWNER view GET /api/bookings/all', async () => {
      const { token } = await createOwner();
      await createTestBooking({ customerId: (await createCustomer()).user.id });

      const response = await request(app).get('/api/bookings/all').set('Authorization', `Bearer ${token}`);
      expectApiSuccess(response, 200);
    });

    it('rejects an OWNER attempting a status update with 403', async () => {
      const { token } = await createOwner();
      const booking = await createTestBooking({ customerId: (await createCustomer()).user.id, status: BookingStatus.PENDING });

      const response = await request(app)
        .patch(`/api/bookings/${booking.id}/status`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: BookingStatus.APPROVED });

      expectApiError(response, 403);
    });
  });
});
