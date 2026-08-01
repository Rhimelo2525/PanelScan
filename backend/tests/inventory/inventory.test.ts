import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import { createCustomer, createOwner, createTestProduct } from '../helpers/factories';
import app from '../helpers/testApp';

describe('Inventory module', () => {
  describe('access control', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const response = await request(app).get('/api/inventory');
      expect(response.status).toBe(401);
    });

    it('rejects a CUSTOMER with 403', async () => {
      const { token } = await createCustomer();

      const response = await request(app).get('/api/inventory').set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/inventory and /api/inventory/:productId (view inventory)', () => {
    it('lists all inventory records with pagination metadata', async () => {
      const { token } = await createOwner();
      await createTestProduct({ withInventory: true });

      const response = await request(app).get('/api/inventory').set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.inventory.length).toBeGreaterThan(0);
      expect(response.body.data.pagination.total).toBeGreaterThan(0);
    });

    it('returns inventory for a single product', async () => {
      const { token } = await createOwner();
      const product = await createTestProduct({ withInventory: true, quantity: 30 });

      const response = await request(app).get(`/api/inventory/${product.id}`).set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.inventory.quantity).toBe(30);
      expect(response.body.data.inventory.product.id).toBe(product.id);
    });

    it('returns 404 for a product with no inventory record', async () => {
      const { token } = await createOwner();
      const product = await createTestProduct({ withInventory: false });

      const response = await request(app).get(`/api/inventory/${product.id}`).set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /api/inventory/:productId/add (add stock)', () => {
    it('increases quantity and stamps lastRestockedAt', async () => {
      const { token } = await createOwner();
      const product = await createTestProduct({ withInventory: true, quantity: 10 });

      const response = await request(app)
        .patch(`/api/inventory/${product.id}/add`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 20 });

      expect(response.status).toBe(200);
      expect(response.body.data.inventory.quantity).toBe(30);

      const dbInventory = await prisma.inventory.findUnique({ where: { productId: product.id } });
      expect(dbInventory?.quantity).toBe(30);
      expect(dbInventory?.lastRestockedAt).not.toBeNull();
    });
  });

  describe('PATCH /api/inventory/:productId/reduce (reduce stock)', () => {
    it('decreases quantity', async () => {
      const { token } = await createOwner();
      const product = await createTestProduct({ withInventory: true, quantity: 20 });

      const response = await request(app)
        .patch(`/api/inventory/${product.id}/reduce`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 5 });

      expect(response.status).toBe(200);
      expect(response.body.data.inventory.quantity).toBe(15);
    });

    it('prevents quantity from going negative and leaves the row unchanged', async () => {
      const { token } = await createOwner();
      const product = await createTestProduct({ withInventory: true, quantity: 5 });

      const response = await request(app)
        .patch(`/api/inventory/${product.id}/reduce`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 10 });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);

      const dbInventory = await prisma.inventory.findUnique({ where: { productId: product.id } });
      expect(dbInventory?.quantity).toBe(5);
    });
  });

  describe('PATCH /api/inventory/:productId/reserve (reserve stock)', () => {
    it('increases reservedQty when enough stock is available', async () => {
      const { token } = await createOwner();
      const product = await createTestProduct({ withInventory: true, quantity: 20, reservedQty: 0 });

      const response = await request(app)
        .patch(`/api/inventory/${product.id}/reserve`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 8 });

      expect(response.status).toBe(200);
      expect(response.body.data.inventory.reservedQty).toBe(8);
    });

    it('rejects reserving more than the available quantity and leaves the row unchanged', async () => {
      const { token } = await createOwner();
      // quantity 10, already reservedQty 8 -> only 2 available
      const product = await createTestProduct({ withInventory: true, quantity: 10, reservedQty: 8 });

      const response = await request(app)
        .patch(`/api/inventory/${product.id}/reserve`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 5 });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);

      const dbInventory = await prisma.inventory.findUnique({ where: { productId: product.id } });
      expect(dbInventory?.reservedQty).toBe(8);
    });
  });

  describe('PATCH /api/inventory/:productId/release (release reserved stock)', () => {
    it('decreases reservedQty', async () => {
      const { token } = await createOwner();
      const product = await createTestProduct({ withInventory: true, quantity: 20, reservedQty: 10 });

      const response = await request(app)
        .patch(`/api/inventory/${product.id}/release`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 4 });

      expect(response.status).toBe(200);
      expect(response.body.data.inventory.reservedQty).toBe(6);
    });

    it('rejects releasing more than is currently reserved and leaves the row unchanged', async () => {
      const { token } = await createOwner();
      const product = await createTestProduct({ withInventory: true, quantity: 20, reservedQty: 3 });

      const response = await request(app)
        .patch(`/api/inventory/${product.id}/release`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 5 });

      expect(response.status).toBe(400);

      const dbInventory = await prisma.inventory.findUnique({ where: { productId: product.id } });
      expect(dbInventory?.reservedQty).toBe(3);
    });
  });

  describe('GET /api/inventory/low-stock (low stock report)', () => {
    it('reports only products at or below their reorder level', async () => {
      const { token } = await createOwner();
      const lowStock = await createTestProduct({ withInventory: true, quantity: 5, reorderLevel: 10 });
      await createTestProduct({ withInventory: true, quantity: 100, reorderLevel: 10 });

      const response = await request(app).get('/api/inventory/low-stock').set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      const productIds = (response.body.data.inventory as Array<{ productId: string }>).map((i) => i.productId);
      expect(productIds).toContain(lowStock.id);
      expect(productIds).toHaveLength(1);
    });
  });
});
