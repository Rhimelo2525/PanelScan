import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import { createCustomer, createModerator, createOwner, createTestMeasurement, createTestProduct } from '../helpers/factories';
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

describe('AR Support module', () => {
  // ================================================================
  // AUTHENTICATION
  // ================================================================
  describe('Authentication', () => {
    it('returns 401 for a request without a JWT', async () => {
      const response = await request(app).get('/api/ar/measurements');
      expectApiError(response, 401);
    });

    it('returns 401 for a malformed JWT', async () => {
      const response = await request(app).get('/api/ar/measurements').set('Authorization', 'Bearer not-a-real-token');
      expectApiError(response, 401);
    });
  });

  // ================================================================
  // POST /api/ar/measurements (create)
  // ================================================================
  describe('POST /api/ar/measurements', () => {
    it('lets a CUSTOMER create a measurement, verified in the database', async () => {
      const customer = await createCustomer();

      const response = await request(app)
        .post('/api/ar/measurements')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ label: 'Living room wall', width: 4, height: 2.5, depth: 0.1, unit: 'm' });

      expectApiSuccess(response, 201, 'Measurement created successfully.');
      expect(response.body.data.measurement.label).toBe('Living room wall');

      const dbMeasurement = await prisma.measurement.findUnique({ where: { id: response.body.data.measurement.id } });
      expect(dbMeasurement).not.toBeNull();
      expect(dbMeasurement?.customerId).toBe(customer.user.id);
      expect(Number(dbMeasurement?.width)).toBe(4);
      expect(Number(dbMeasurement?.height)).toBe(2.5);
      expect(Number(dbMeasurement?.depth)).toBe(0.1);
      expect(dbMeasurement?.createdAt).toBeInstanceOf(Date);
    });

    it('defaults unit to "m" when not provided', async () => {
      const customer = await createCustomer();

      const response = await request(app).post('/api/ar/measurements').set('Authorization', `Bearer ${customer.token}`).send({ width: 3, height: 2 });

      expectApiSuccess(response, 201);
      expect(response.body.data.measurement.unit).toBe('m');
    });

    it('rejects a MODERATOR creating a measurement with 403', async () => {
      const moderator = await createModerator();

      const response = await request(app).post('/api/ar/measurements').set('Authorization', `Bearer ${moderator.token}`).send({ width: 3, height: 2 });

      expectApiError(response, 403);
    });

    it('rejects an OWNER creating a measurement with 403', async () => {
      const owner = await createOwner();

      const response = await request(app).post('/api/ar/measurements').set('Authorization', `Bearer ${owner.token}`).send({ width: 3, height: 2 });

      expectApiError(response, 403);
    });

    it('rejects a negative width with 400, no row created', async () => {
      const customer = await createCustomer();

      const response = await request(app).post('/api/ar/measurements').set('Authorization', `Bearer ${customer.token}`).send({ width: -4, height: 2 });

      expectApiError(response, 400, 'Validation failed.');

      const count = await prisma.measurement.count({ where: { customerId: customer.user.id } });
      expect(count).toBe(0);
    });

    it('rejects a zero height with 400', async () => {
      const customer = await createCustomer();

      const response = await request(app).post('/api/ar/measurements').set('Authorization', `Bearer ${customer.token}`).send({ width: 3, height: 0 });

      expectApiError(response, 400, 'Validation failed.');
    });

    it('rejects an unrealistically large dimension with 400', async () => {
      const customer = await createCustomer();

      const response = await request(app).post('/api/ar/measurements').set('Authorization', `Bearer ${customer.token}`).send({ width: 5000, height: 2 });

      expectApiError(response, 400, 'Validation failed.');
    });

    it('rejects an invalid imageUrl with 400', async () => {
      const customer = await createCustomer();

      const response = await request(app)
        .post('/api/ar/measurements')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ width: 3, height: 2, imageUrl: 'not-a-url' });

      expectApiError(response, 400, 'Validation failed.');
    });
  });

  // ================================================================
  // GET /api/ar/measurements (list, filter, search, pagination)
  // ================================================================
  describe('GET /api/ar/measurements', () => {
    it("scopes a CUSTOMER to only their own measurements, confirmed against the database", async () => {
      const customerA = await createCustomer();
      const customerB = await createCustomer();
      const measurementA = await createTestMeasurement({ customerId: customerA.user.id });
      const measurementB = await createTestMeasurement({ customerId: customerB.user.id });

      const response = await request(app).get('/api/ar/measurements').set('Authorization', `Bearer ${customerA.token}`);

      expectApiSuccess(response, 200, 'Measurements retrieved successfully.');
      const ids = (response.body.data.measurements as Array<{ id: string }>).map((m) => m.id);
      expect(ids).toContain(measurementA.id);
      expect(ids).not.toContain(measurementB.id);

      const dbMeasurementB = await prisma.measurement.findUnique({ where: { id: measurementB.id } });
      expect(dbMeasurementB).not.toBeNull();
    });

    it('lets a MODERATOR view every measurement across customers', async () => {
      const moderator = await createModerator();
      const customerA = await createCustomer();
      const customerB = await createCustomer();
      await createTestMeasurement({ customerId: customerA.user.id });
      await createTestMeasurement({ customerId: customerB.user.id });

      const response = await request(app).get('/api/ar/measurements').set('Authorization', `Bearer ${moderator.token}`);

      expectApiSuccess(response, 200);
      expect(response.body.data.measurements.length).toBeGreaterThanOrEqual(2);
    });

    it('lets an OWNER filter by customerId', async () => {
      const owner = await createOwner();
      const customerA = await createCustomer();
      const customerB = await createCustomer();
      const measurementA = await createTestMeasurement({ customerId: customerA.user.id });
      await createTestMeasurement({ customerId: customerB.user.id });

      const response = await request(app)
        .get('/api/ar/measurements')
        .set('Authorization', `Bearer ${owner.token}`)
        .query({ customerId: customerA.user.id });

      expectApiSuccess(response, 200);
      const ids = (response.body.data.measurements as Array<{ id: string }>).map((m) => m.id);
      expect(ids).toEqual([measurementA.id]);
    });

    it('finds a measurement by label search', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const match = await createTestMeasurement({ customerId: customer.user.id, label: 'Leaking roof panel wall' });
      await createTestMeasurement({ customerId: customer.user.id, label: 'Unrelated wall' });

      const response = await request(app).get('/api/ar/measurements').set('Authorization', `Bearer ${moderator.token}`).query({ search: 'roof' });

      expectApiSuccess(response, 200);
      const ids = (response.body.data.measurements as Array<{ id: string }>).map((m) => m.id);
      expect(ids).toContain(match.id);
    });

    it('paginates measurements', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      for (let i = 0; i < 3; i += 1) {
        await createTestMeasurement({ customerId: customer.user.id });
      }

      const response = await request(app).get('/api/ar/measurements').set('Authorization', `Bearer ${moderator.token}`).query({ limit: '2', page: '1' });

      expectApiSuccess(response, 200);
      expect(response.body.data.measurements.length).toBeLessThanOrEqual(2);
      expect(response.body.data.pagination.limit).toBe(2);
      expect(response.body.data.pagination.total).toBeGreaterThanOrEqual(3);
    });
  });

  // ================================================================
  // GET /api/ar/measurements/:id
  // ================================================================
  describe('GET /api/ar/measurements/:id', () => {
    it('lets a CUSTOMER view their own measurement', async () => {
      const customer = await createCustomer();
      const measurement = await createTestMeasurement({ customerId: customer.user.id });

      const response = await request(app).get(`/api/ar/measurements/${measurement.id}`).set('Authorization', `Bearer ${customer.token}`);

      expectApiSuccess(response, 200, 'Measurement retrieved successfully.');
      expect(response.body.data.measurement.id).toBe(measurement.id);
    });

    it("returns 404 (not 403) when a CUSTOMER requests another customer's measurement - no ID enumeration", async () => {
      const outsider = await createCustomer();
      const owner = await createCustomer();
      const measurement = await createTestMeasurement({ customerId: owner.user.id });

      const response = await request(app).get(`/api/ar/measurements/${measurement.id}`).set('Authorization', `Bearer ${outsider.token}`);

      expectApiError(response, 404);
    });

    it('lets an OWNER view any measurement', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const measurement = await createTestMeasurement({ customerId: customer.user.id });

      const response = await request(app).get(`/api/ar/measurements/${measurement.id}`).set('Authorization', `Bearer ${owner.token}`);

      expectApiSuccess(response, 200);
    });

    it('returns 404 for a nonexistent measurement', async () => {
      const customer = await createCustomer();

      const response = await request(app)
        .get('/api/ar/measurements/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${customer.token}`);

      expectApiError(response, 404);
    });

    it('rejects an invalid (non-UUID) measurement id with 400', async () => {
      const customer = await createCustomer();

      const response = await request(app).get('/api/ar/measurements/not-a-uuid').set('Authorization', `Bearer ${customer.token}`);

      expectApiError(response, 400, 'Validation failed.');
    });
  });

  // ================================================================
  // PATCH /api/ar/measurements/:id
  // ================================================================
  describe('PATCH /api/ar/measurements/:id', () => {
    it('lets a CUSTOMER update their own measurement, verified in the database', async () => {
      const customer = await createCustomer();
      const measurement = await createTestMeasurement({ customerId: customer.user.id, width: 3, height: 2 });

      const response = await request(app)
        .patch(`/api/ar/measurements/${measurement.id}`)
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ width: 5, height: 3.5, label: 'Updated wall' });

      expectApiSuccess(response, 200, 'Measurement updated successfully.');

      const dbMeasurement = await prisma.measurement.findUnique({ where: { id: measurement.id } });
      expect(Number(dbMeasurement?.width)).toBe(5);
      expect(Number(dbMeasurement?.height)).toBe(3.5);
      expect(dbMeasurement?.label).toBe('Updated wall');
    });

    it("returns 404 (not 403) updating another customer's measurement - no ID enumeration, row unchanged", async () => {
      const outsider = await createCustomer();
      const owner = await createCustomer();
      const measurement = await createTestMeasurement({ customerId: owner.user.id, width: 3, height: 2 });

      const response = await request(app)
        .patch(`/api/ar/measurements/${measurement.id}`)
        .set('Authorization', `Bearer ${outsider.token}`)
        .send({ width: 10 });

      expectApiError(response, 404);

      const dbMeasurement = await prisma.measurement.findUnique({ where: { id: measurement.id } });
      expect(Number(dbMeasurement?.width)).toBe(3);
    });

    it('rejects a MODERATOR updating a measurement with 403', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const measurement = await createTestMeasurement({ customerId: customer.user.id });

      const response = await request(app)
        .patch(`/api/ar/measurements/${measurement.id}`)
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ width: 10 });

      expectApiError(response, 403);
    });

    it('rejects a negative height update with 400', async () => {
      const customer = await createCustomer();
      const measurement = await createTestMeasurement({ customerId: customer.user.id });

      const response = await request(app)
        .patch(`/api/ar/measurements/${measurement.id}`)
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ height: -2 });

      expectApiError(response, 400, 'Validation failed.');
    });

    it('rejects an empty update body with 400', async () => {
      const customer = await createCustomer();
      const measurement = await createTestMeasurement({ customerId: customer.user.id });

      const response = await request(app).patch(`/api/ar/measurements/${measurement.id}`).set('Authorization', `Bearer ${customer.token}`).send({});

      expectApiError(response, 400, 'Validation failed.');
    });
  });

  // ================================================================
  // DELETE /api/ar/measurements/:id
  // ================================================================
  describe('DELETE /api/ar/measurements/:id', () => {
    it('lets a CUSTOMER delete their own measurement, verified in the database', async () => {
      const customer = await createCustomer();
      const measurement = await createTestMeasurement({ customerId: customer.user.id });

      const response = await request(app).delete(`/api/ar/measurements/${measurement.id}`).set('Authorization', `Bearer ${customer.token}`);

      expectApiSuccess(response, 200, 'Measurement deleted successfully.');

      const dbMeasurement = await prisma.measurement.findUnique({ where: { id: measurement.id } });
      expect(dbMeasurement).toBeNull();
    });

    it("returns 404 (not 403) deleting another customer's measurement - no ID enumeration, row remains", async () => {
      const outsider = await createCustomer();
      const owner = await createCustomer();
      const measurement = await createTestMeasurement({ customerId: owner.user.id });

      const response = await request(app).delete(`/api/ar/measurements/${measurement.id}`).set('Authorization', `Bearer ${outsider.token}`);

      expectApiError(response, 404);

      const dbMeasurement = await prisma.measurement.findUnique({ where: { id: measurement.id } });
      expect(dbMeasurement).not.toBeNull();
    });

    it('rejects an OWNER deleting a measurement with 403', async () => {
      const owner = await createOwner();
      const customer = await createCustomer();
      const measurement = await createTestMeasurement({ customerId: customer.user.id });

      const response = await request(app).delete(`/api/ar/measurements/${measurement.id}`).set('Authorization', `Bearer ${owner.token}`);

      expectApiError(response, 403);
    });
  });

  // ================================================================
  // POST /api/ar/estimate
  // ================================================================
  describe('POST /api/ar/estimate', () => {
    it('computes the correct panel estimate from a saved measurement (exact division)', async () => {
      const customer = await createCustomer();
      const measurement = await createTestMeasurement({ customerId: customer.user.id, width: 4, height: 3 }); // wall area 12
      const product = await createTestProduct({ price: 150, width: 1, height: 2 }); // panel area 2

      const response = await request(app)
        .post('/api/ar/estimate')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ productId: product.id, measurementId: measurement.id });

      expectApiSuccess(response, 200, 'Panel estimate calculated successfully.');
      const data = response.body.data;
      expect(data.wallArea).toBe(12);
      expect(data.panelArea).toBe(2);
      expect(data.requiredPanels).toBe(6);
      expect(data.unitPrice).toBe(150);
      expect(data.estimatedCost).toBe(900);
      expect(data.measurementId).toBe(measurement.id);
    });

    it('rounds up to a whole panel count when the area does not divide evenly', async () => {
      const customer = await createCustomer();
      const product = await createTestProduct({ price: 200, width: 1.2, height: 1 }); // panel area 1.2

      const response = await request(app)
        .post('/api/ar/estimate')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ productId: product.id, width: 5, height: 3 }); // wall area 15 -> 15/1.2 = 12.5 -> ceil 13

      expectApiSuccess(response, 200);
      expect(response.body.data.requiredPanels).toBe(13);
      expect(response.body.data.estimatedCost).toBe(13 * 200);
    });

    it('accepts width/height directly without a saved measurement', async () => {
      const customer = await createCustomer();
      const product = await createTestProduct({ price: 100, width: 2, height: 1 });

      const response = await request(app)
        .post('/api/ar/estimate')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ productId: product.id, width: 4, height: 2 });

      expectApiSuccess(response, 200);
      expect(response.body.data.measurementId).toBeUndefined();
      expect(response.body.data.requiredPanels).toBe(4);
    });

    it("returns 404 when a CUSTOMER references another customer's measurement", async () => {
      const outsider = await createCustomer();
      const owner = await createCustomer();
      const measurement = await createTestMeasurement({ customerId: owner.user.id });
      const product = await createTestProduct({ width: 1, height: 1 });

      const response = await request(app)
        .post('/api/ar/estimate')
        .set('Authorization', `Bearer ${outsider.token}`)
        .send({ productId: product.id, measurementId: measurement.id });

      expectApiError(response, 404);
    });

    it('lets a MODERATOR reference any measurement', async () => {
      const moderator = await createModerator();
      const customer = await createCustomer();
      const measurement = await createTestMeasurement({ customerId: customer.user.id, width: 2, height: 2 });
      const product = await createTestProduct({ width: 1, height: 1, price: 50 });

      const response = await request(app)
        .post('/api/ar/estimate')
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ productId: product.id, measurementId: measurement.id });

      expectApiSuccess(response, 200);
      expect(response.body.data.requiredPanels).toBe(4);
    });

    it('returns 404 for a nonexistent product', async () => {
      const customer = await createCustomer();

      const response = await request(app)
        .post('/api/ar/estimate')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ productId: '00000000-0000-0000-0000-000000000000', width: 3, height: 2 });

      expectApiError(response, 404);
    });

    it('rejects a product with no panel dimensions configured with 400', async () => {
      const customer = await createCustomer();
      const product = await createTestProduct({}); // no width/height

      const response = await request(app)
        .post('/api/ar/estimate')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ productId: product.id, width: 3, height: 2 });

      expectApiError(response, 400);
    });

    it('rejects a request with neither measurementId nor width/height with 400', async () => {
      const customer = await createCustomer();
      const product = await createTestProduct({ width: 1, height: 1 });

      const response = await request(app).post('/api/ar/estimate').set('Authorization', `Bearer ${customer.token}`).send({ productId: product.id });

      expectApiError(response, 400, 'Validation failed.');
    });

    it('rejects a negative width in a direct estimate with 400', async () => {
      const customer = await createCustomer();
      const product = await createTestProduct({ width: 1, height: 1 });

      const response = await request(app)
        .post('/api/ar/estimate')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ productId: product.id, width: -3, height: 2 });

      expectApiError(response, 400, 'Validation failed.');
    });

    it('does not write any database row - a pure calculation', async () => {
      const customer = await createCustomer();
      const product = await createTestProduct({ width: 1, height: 1 });
      const measurementCountBefore = await prisma.measurement.count();

      const response = await request(app)
        .post('/api/ar/estimate')
        .set('Authorization', `Bearer ${customer.token}`)
        .send({ productId: product.id, width: 3, height: 2 });

      expectApiSuccess(response, 200);
      const measurementCountAfter = await prisma.measurement.count();
      expect(measurementCountAfter).toBe(measurementCountBefore);
    });
  });
});
