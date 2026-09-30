import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import { hasAllowedDimensionDigits } from '../../src/modules/product/product.validation';
import { serializeDescription } from '../../src/modules/request/request.types';
import { createModerator, createOwner, createTestCategory, createTestProduct } from '../helpers/factories';
import app from '../helpers/testApp';

type Dimensions = { width?: number; height?: number; thickness?: number };

const ALLOWED: Array<[keyof Dimensions, number]> = [
  ['width', 2.9],
  ['width', 99],
  ['width', 0.5],
  ['height', 25],
  ['height', 250],
  ['height', 2.55],
  ['thickness', 8],
  ['thickness', 99],
  ['thickness', 1.2],
];

const REJECTED: Array<[keyof Dimensions, number, string]> = [
  ['width', 123, 'Width can have at most 2 digits.'],
  ['width', 1.25, 'Width can have at most 2 digits.'],
  ['height', 1234, 'Height can have at most 3 digits.'],
  ['height', 25.55, 'Height can have at most 3 digits.'],
  ['thickness', 100, 'Thickness can have at most 2 digits.'],
  ['thickness', 1.25, 'Thickness can have at most 2 digits.'],
];

const addProduct = async (token: string, dimensions: Dimensions) => {
  const category = await createTestCategory();
  return request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ categoryId: category.id, name: 'Dimension Test Panel', sku: `SKU-DIM-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, price: 500, ...dimensions });
};

const approve = (token: string, requestId: string) =>
  request(app).patch(`/api/requests/${requestId}/approve`).set('Authorization', `Bearer ${token}`).send({});

describe('Product dimension digit limits', () => {
  it.each(ALLOWED)('counts %s %s as within the limit', (field, value) => {
    expect(hasAllowedDimensionDigits(field, value)).toBe(true);
  });

  it.each(REJECTED)('counts %s %s as over the limit', (field, value) => {
    expect(hasAllowedDimensionDigits(field, value)).toBe(false);
  });

  it('does not read an exponent form as a short number', () => {
    expect(hasAllowedDimensionDigits('height', 1e21)).toBe(false);
    expect(hasAllowedDimensionDigits('width', 1e-7)).toBe(false);
  });

  describe('POST /api/products', () => {
    it.each(ALLOWED)('accepts %s %s', async (field, value) => {
      const { token } = await createModerator();
      const response = await addProduct(token, { [field]: value });
      expect(response.status).toBe(201);
    });

    it.each(REJECTED)('rejects %s %s and creates no change request', async (field, value, message) => {
      const { token } = await createModerator();
      const response = await addProduct(token, { [field]: value });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContainEqual({ path: field, message });
      expect(await prisma.request.count()).toBe(0);
    });
  });

  describe('PATCH /api/products/:id', () => {
    it.each(REJECTED)('rejects %s %s when editing an existing product', async (field, value, message) => {
      const { token } = await createModerator();
      const product = await createTestProduct();

      const response = await request(app).patch(`/api/products/${product.id}`).set('Authorization', `Bearer ${token}`).send({ [field]: value });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContainEqual({ path: field, message });
      expect(await prisma.request.count()).toBe(0);
    });
  });

  describe('owner approval', () => {
    it('stores a new product with exactly the dimensions entered (no rounding or truncation)', async () => {
      const moderator = await createModerator();
      const owner = await createOwner();
      const created = await addProduct(moderator.token, { width: 2.9, height: 250, thickness: 8 });

      expect((await approve(owner.token, created.body.data.request.id)).status).toBe(200);

      const product = await prisma.product.findFirstOrThrow({ where: { name: 'Dimension Test Panel' } });
      expect([Number(product.width), Number(product.height), Number(product.thickness)]).toEqual([2.9, 250, 8]);
    });

    it('applies an edit to an existing product', async () => {
      const moderator = await createModerator();
      const owner = await createOwner();
      const product = await createTestProduct();

      const edit = await request(app)
        .patch(`/api/products/${product.id}`)
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ width: 99, height: 25, thickness: 99 });
      expect(edit.status).toBe(200);
      expect((await approve(owner.token, edit.body.data.request.id)).status).toBe(200);

      const updated = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect([Number(updated.width), Number(updated.height), Number(updated.thickness)]).toEqual([99, 25, 99]);
    });

    it.each([
      ['ADD_PRODUCT', 'width', 123],
      ['EDIT_PRODUCT', 'height', 1234],
      ['EDIT_PRODUCT', 'thickness', 100],
    ] as const)('refuses a hand-made %s request with %s %s sent straight to /api/requests', async (action, field, value) => {
      const moderator = await createModerator();
      const owner = await createOwner();
      const category = await createTestCategory();
      const product = await createTestProduct({ categoryId: category.id });

      const payload =
        action === 'ADD_PRODUCT'
          ? { action, scope: 'PRODUCTS', productData: { categoryId: category.id, name: 'Forged Panel', sku: 'SKU-FORGED', price: 100, [field]: value } }
          : { action, scope: 'PRODUCTS', productId: product.id, updateData: { [field]: value } };
      const forged = await request(app)
        .post('/api/requests')
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ type: 'OTHER', title: 'Forged dimension change', description: serializeDescription('Forged', payload as never) });
      expect(forged.status).toBe(201);

      const response = await approve(owner.token, forged.body.data.request.id);

      expect(response.status).toBe(400);
      expect(await prisma.product.count({ where: { sku: 'SKU-FORGED' } })).toBe(0);
      const unchanged = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(unchanged[field]?.toString() ?? null).toBe(product[field]?.toString() ?? null);
    });
  });
});
