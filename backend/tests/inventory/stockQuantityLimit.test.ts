import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import { STOCK_QUANTITY_MESSAGE } from '../../src/modules/inventory/inventory.validation';
import { serializeDescription } from '../../src/modules/request/request.types';
import { createModerator, createOwner, createTestProduct } from '../helpers/factories';
import app from '../helpers/testApp';

const approve = (token: string, requestId: string) =>
  request(app).patch(`/api/requests/${requestId}/approve`).set('Authorization', `Bearer ${token}`).send({});

describe('Stock quantities are capped at 5 digits (99,999)', () => {
  describe('POST /api/inventory (record physical stock)', () => {
    it('accepts 99,999 units and a 5-digit reorder threshold', async () => {
      const { token } = await createModerator();
      const product = await createTestProduct();

      const response = await request(app).post('/api/inventory').set('Authorization', `Bearer ${token}`).send({ productId: product.id, quantity: 99999, reorderLevel: 99999 });

      expect(response.status).toBe(201);
    });

    it.each([
      ['quantity', { quantity: 100000 }],
      ['reorderLevel', { quantity: 10, reorderLevel: 100000 }],
    ] as const)('rejects a 6-digit %s and creates no request', async (field, body) => {
      const { token } = await createModerator();
      const product = await createTestProduct();

      const response = await request(app).post('/api/inventory').set('Authorization', `Bearer ${token}`).send({ productId: product.id, ...body });

      expect(response.status).toBe(400);
      expect(response.body.errors).toContainEqual({ path: field, message: STOCK_QUANTITY_MESSAGE });
      expect(await prisma.request.count()).toBe(0);
    });
  });

  describe('adjust stock', () => {
    it.each([
      ['add', { quantity: 100000 }],
      ['reduce', { quantity: 100000 }],
      ['adjust', { targetQuantity: 100000 }],
    ] as const)('rejects a 6-digit amount on /%s', async (route, body) => {
      const { token } = await createModerator();
      const product = await createTestProduct({ withInventory: true, quantity: 50 });

      const response = await request(app).patch(`/api/inventory/${product.id}/${route}`).set('Authorization', `Bearer ${token}`).send(body);

      expect(response.status).toBe(400);
      expect(await prisma.request.count()).toBe(0);
    });

    it('accepts 5-digit amounts', async () => {
      const { token } = await createModerator();
      const product = await createTestProduct({ withInventory: true, quantity: 50 });

      expect((await request(app).patch(`/api/inventory/${product.id}/adjust`).set('Authorization', `Bearer ${token}`).send({ targetQuantity: 99999 })).status).toBe(200);
      expect((await request(app).patch(`/api/inventory/${product.id}/add`).set('Authorization', `Bearer ${token}`).send({ quantity: 99949 })).status).toBe(200);
    });

    it('refuses an addition that would take on-hand stock past 99,999', async () => {
      const { token } = await createModerator();
      const product = await createTestProduct({ withInventory: true, quantity: 50 });

      const response = await request(app).patch(`/api/inventory/${product.id}/add`).set('Authorization', `Bearer ${token}`).send({ quantity: 99950 });

      expect(response.status).toBe(400);
      expect(response.body.message).toContain(STOCK_QUANTITY_MESSAGE);
      expect(await prisma.request.count()).toBe(0);
    });
  });

  describe('owner approval', () => {
    it('applies an approved 5-digit stock change', async () => {
      const moderator = await createModerator();
      const owner = await createOwner();
      const product = await createTestProduct({ withInventory: true, quantity: 50 });

      const submitted = await request(app).patch(`/api/inventory/${product.id}/adjust`).set('Authorization', `Bearer ${moderator.token}`).send({ targetQuantity: 99999 });
      expect((await approve(owner.token, submitted.body.data.request.id)).status).toBe(200);

      expect((await prisma.inventory.findUniqueOrThrow({ where: { productId: product.id } })).quantity).toBe(99999);
    });

    it.each(['ADJUST_STOCK', 'ADD_INVENTORY'] as const)('refuses a hand-made %s request over 99,999 sent straight to /api/requests', async (action) => {
      const moderator = await createModerator();
      const owner = await createOwner();
      const product = await createTestProduct({ withInventory: action === 'ADJUST_STOCK', quantity: 50 });

      const payload =
        action === 'ADJUST_STOCK'
          ? { action, scope: 'INVENTORY', productId: product.id, adjustData: { direction: 'add', quantity: 999950, targetQuantity: 1000000 } }
          : { action, scope: 'INVENTORY', productData: { productId: product.id, quantity: 1000000, reorderLevel: 10 } };
      const forged = await request(app)
        .post('/api/requests')
        .set('Authorization', `Bearer ${moderator.token}`)
        .send({ type: 'OTHER', title: 'Forged stock change', description: serializeDescription('Forged', payload as never) });
      expect(forged.status).toBe(201);

      const response = await approve(owner.token, forged.body.data.request.id);

      expect(response.status).toBe(400);
      const inventory = await prisma.inventory.findUnique({ where: { productId: product.id } });
      expect(inventory?.quantity ?? null).toBe(action === 'ADJUST_STOCK' ? 50 : null);
    });
  });
});
