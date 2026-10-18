import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import {
  FLAT_GROOVES_MESSAGE,
  GROOVE_COUNT_MESSAGE,
  GROOVE_COUNT_REQUIRED_MESSAGE,
  PANEL_PROFILE_MESSAGE,
  panel3dLabel,
  panel3dProblem,
} from '../../src/modules/product/product.panel3d';
import { serializeDescription } from '../../src/modules/request/request.types';
import { createModerator, createOwner, createTestCategory, createTestProduct } from '../helpers/factories';
import app from '../helpers/testApp';

const SURFACE = 'https://example.com/surfaces/bamboo-breeze.webp';

type Panel3d = { panelProfile?: string | null; grooveCount?: number | null; surfaceImageUrl?: string | null };

const addProduct = async (token: string, panel3d: Panel3d) => {
  const category = await createTestCategory();
  return request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ categoryId: category.id, name: '3D Test Panel', sku: `SKU-3D-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, price: 500, ...panel3d });
};

const editProduct = (token: string, productId: string, body: Panel3d) =>
  request(app).patch(`/api/products/${productId}`).set('Authorization', `Bearer ${token}`).send(body);

const approve = (token: string, requestId: string) =>
  request(app).patch(`/api/requests/${requestId}/approve`).set('Authorization', `Bearer ${token}`).send({});

const flutedProduct = async (grooveCount = 5) => {
  const product = await createTestProduct();
  return prisma.product.update({
    where: { id: product.id },
    data: { panelProfile: 'FLUTED', grooveCount, surfaceImageUrl: SURFACE },
  });
};

describe('Product 3D preview settings', () => {
  describe('panel3dProblem', () => {
    it.each([
      [undefined, undefined],
      [null, null],
      ['FLAT', null],
      ['FLUTED', 5],
      ['INVERTED_CIRCLE', 6],
      ['SPANDREL', 2],
    ])('accepts %s with %s grooves', (profile, grooves) => {
      expect(panel3dProblem(profile, grooves)).toBeNull();
    });

    it.each([
      ['FLUTED', null, GROOVE_COUNT_REQUIRED_MESSAGE],
      ['FLAT', 3, FLAT_GROOVES_MESSAGE],
      ['FLUTED', 0, GROOVE_COUNT_MESSAGE],
      ['FLUTED', 13, GROOVE_COUNT_MESSAGE],
      ['FLUTED', 2.5, GROOVE_COUNT_MESSAGE],
      ['ROUND', 4, PANEL_PROFILE_MESSAGE],
      [null, 4, PANEL_PROFILE_MESSAGE],
    ])('rejects %s with %s grooves', (profile, grooves, message) => {
      expect(panel3dProblem(profile, grooves)).toBe(message);
    });

    it('labels the shape for the owner', () => {
      expect(panel3dLabel('FLUTED', 5)).toBe('Fluted, 5 grooves');
      expect(panel3dLabel('SPANDREL', 1)).toBe('Spandrel, 1 groove');
      expect(panel3dLabel('FLAT', null)).toBe('Flat');
      expect(panel3dLabel(null, null)).toBe('Not set');
    });
  });

  describe('a moderator adds a product', () => {
    it('stores the shape, grooves and surface photo once the owner approves', async () => {
      const moderator = await createModerator();
      const owner = await createOwner();
      const created = await addProduct(moderator.token, { panelProfile: 'FLUTED', grooveCount: 5, surfaceImageUrl: SURFACE });
      expect(created.status).toBe(201);

      expect((await approve(owner.token, created.body.data.request.id)).status).toBe(200);

      const product = await prisma.product.findFirstOrThrow({ where: { name: '3D Test Panel' } });
      expect([product.panelProfile, product.grooveCount, product.surfaceImageUrl]).toEqual(['FLUTED', 5, SURFACE]);
    });

    it('shows the 3D shape in the request the owner reviews', async () => {
      const moderator = await createModerator();
      const created = await addProduct(moderator.token, { panelProfile: 'INVERTED_CIRCLE', grooveCount: 6 });

      const stored = await prisma.request.findUniqueOrThrow({ where: { id: created.body.data.request.id } });
      expect(stored.description).toContain('Inverted circle, 6 grooves');
    });

    it('still adds a product without any 3D settings', async () => {
      const moderator = await createModerator();
      const owner = await createOwner();
      const created = await addProduct(moderator.token, {});
      expect((await approve(owner.token, created.body.data.request.id)).status).toBe(200);

      const product = await prisma.product.findFirstOrThrow({ where: { name: '3D Test Panel' } });
      expect([product.panelProfile, product.grooveCount, product.surfaceImageUrl]).toEqual([null, null, null]);
    });

    it.each([
      [{ panelProfile: 'FLUTED' }, 'grooveCount', GROOVE_COUNT_REQUIRED_MESSAGE],
      [{ panelProfile: 'FLAT', grooveCount: 4 }, 'grooveCount', FLAT_GROOVES_MESSAGE],
      [{ panelProfile: 'ROUND', grooveCount: 4 }, 'panelProfile', PANEL_PROFILE_MESSAGE],
      [{ panelProfile: 'FLUTED', grooveCount: 40 }, 'grooveCount', GROOVE_COUNT_MESSAGE],
      [{ surfaceImageUrl: 'not a url' }, 'surfaceImageUrl', 'Please provide a valid surface photo URL.'],
    ] as const)('rejects %j and creates no change request', async (panel3d, path, message) => {
      const { token } = await createModerator();
      const response = await addProduct(token, panel3d);

      expect(response.status).toBe(400);
      expect(response.body.errors).toContainEqual({ path, message });
      expect(await prisma.request.count()).toBe(0);
    });
  });

  describe('a moderator edits a product', () => {
    it('changes only the groove count, keeping the shape', async () => {
      const moderator = await createModerator();
      const owner = await createOwner();
      const product = await flutedProduct(5);

      const edit = await editProduct(moderator.token, product.id, { grooveCount: 7 });
      expect(edit.status).toBe(200);
      expect((await approve(owner.token, edit.body.data.request.id)).status).toBe(200);

      const updated = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect([updated.panelProfile, updated.grooveCount]).toEqual(['FLUTED', 7]);
    });

    it('drops the groove count when the panel becomes flat', async () => {
      const moderator = await createModerator();
      const owner = await createOwner();
      const product = await flutedProduct(5);

      const edit = await editProduct(moderator.token, product.id, { panelProfile: 'FLAT' });
      expect((await approve(owner.token, edit.body.data.request.id)).status).toBe(200);

      const updated = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect([updated.panelProfile, updated.grooveCount]).toEqual(['FLAT', null]);
    });

    it('removes the surface photo so the main product photo is used', async () => {
      const moderator = await createModerator();
      const owner = await createOwner();
      const product = await flutedProduct();

      const edit = await editProduct(moderator.token, product.id, { surfaceImageUrl: null });
      const stored = await prisma.request.findUniqueOrThrow({ where: { id: edit.body.data.request.id } });
      expect(stored.description).toContain('Surface photo: Set → Main product photo');
      expect((await approve(owner.token, edit.body.data.request.id)).status).toBe(200);

      const updated = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(updated.surfaceImageUrl).toBeNull();
    });

    it('refuses a hand-made request whose shape and grooves do not fit', async () => {
      const moderator = await createModerator();
      const owner = await createOwner();
      const product = await createTestProduct();

      const payload = { action: 'EDIT_PRODUCT', scope: 'PRODUCTS', productId: product.id, updateData: { panelProfile: 'SPANDREL' } };
      const forged = await request(app)
        .post('/api/requests')
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ type: 'OTHER', title: 'Forged 3D change', description: serializeDescription('Forged', payload as never) });
      expect(forged.status).toBe(201);

      const response = await approve(owner.token, forged.body.data.request.id);

      expect(response.status).toBe(400);
      const unchanged = await prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(unchanged.panelProfile).toBeNull();
    });
  });

  it('gives the 3D settings to anyone viewing the product, so the app can draw it', async () => {
    const product = await flutedProduct(6);

    const response = await request(app).get(`/api/products/${product.id}`);

    expect(response.status).toBe(200);
    expect(response.body.data.product).toMatchObject({ panelProfile: 'FLUTED', grooveCount: 6, surfaceImageUrl: SURFACE });
  });
});
