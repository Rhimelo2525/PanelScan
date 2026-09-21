import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import { createCustomer, createModerator, createOwner, createTestProduct } from '../helpers/factories';
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
    it('rejects direct add stock by OWNER with 403', async () => {
      const { token } = await createOwner();
      const product = await createTestProduct({ withInventory: true, quantity: 10 });

      const response = await request(app)
        .patch(`/api/inventory/${product.id}/add`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 20 });

      expect(response.status).toBe(403);
    });

    it('creates a Change Request when called by MODERATOR and applies on OWNER approval', async () => {
      const { token: modToken } = await createModerator();
      const { token: ownerToken } = await createOwner();
      const product = await createTestProduct({ withInventory: true, quantity: 10 });

      const response = await request(app)
        .patch(`/api/inventory/${product.id}/add`)
        .set('Authorization', `Bearer ${modToken}`)
        .send({ quantity: 20 });

      expect(response.status).toBe(200);
      expect(response.body.data.request).toBeDefined();
      const requestId = response.body.data.request.id;

      // Unchanged before approval
      const unapproved = await prisma.inventory.findUnique({ where: { productId: product.id } });
      expect(unapproved?.quantity).toBe(10);

      // Owner approves
      const approveRes = await request(app)
        .patch(`/api/requests/${requestId}/approve`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(approveRes.status).toBe(200);

      const dbInventory = await prisma.inventory.findUnique({ where: { productId: product.id } });
      expect(dbInventory?.quantity).toBe(30);
      expect(dbInventory?.lastRestockedAt).not.toBeNull();
    });
  });

  describe('PATCH /api/inventory/:productId/reduce (reduce stock)', () => {
    it('rejects direct reduce stock by OWNER with 403', async () => {
      const { token } = await createOwner();
      const product = await createTestProduct({ withInventory: true, quantity: 20 });

      const response = await request(app)
        .patch(`/api/inventory/${product.id}/reduce`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 5 });

      expect(response.status).toBe(403);
    });

    it('creates a Change Request when called by MODERATOR and applies on OWNER approval', async () => {
      const { token: modToken } = await createModerator();
      const { token: ownerToken } = await createOwner();
      const product = await createTestProduct({ withInventory: true, quantity: 20 });

      const response = await request(app)
        .patch(`/api/inventory/${product.id}/reduce`)
        .set('Authorization', `Bearer ${modToken}`)
        .send({ quantity: 5 });

      expect(response.status).toBe(200);
      const requestId = response.body.data.request.id;

      const approveRes = await request(app)
        .patch(`/api/requests/${requestId}/approve`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(approveRes.status).toBe(200);

      const dbInventory = await prisma.inventory.findUnique({ where: { productId: product.id } });
      expect(dbInventory?.quantity).toBe(15);
    });

    it('clamps proposed quantity to 0 when reducing by more than available, and approval applies that floor', async () => {
      const { token: modToken } = await createModerator();
      const { token: ownerToken } = await createOwner();
      const product = await createTestProduct({ withInventory: true, quantity: 5 });

      // reduceStock() clamps the proposed quantity with Math.max(0, current -
      // requested) at request-creation time (inventory.controller.ts) - this
      // is how the system prevents negative inventory, so a reduce-by-10 on
      // a stock of 5 proposes 0, not a rejected/negative value.
      const response = await request(app)
        .patch(`/api/inventory/${product.id}/reduce`)
        .set('Authorization', `Bearer ${modToken}`)
        .send({ quantity: 10 });

      expect(response.status).toBe(200);
      const requestId = response.body.data.request.id;

      const approveRes = await request(app)
        .patch(`/api/requests/${requestId}/approve`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(approveRes.status).toBe(200);

      const dbInventory = await prisma.inventory.findUnique({ where: { productId: product.id } });
      expect(dbInventory?.quantity).toBe(0);
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

  describe('POST /api/inventory (Record Initial Stock)', () => {
    it('rejects direct creation by OWNER with 403', async () => {
      const { token } = await createOwner();
      const product = await createTestProduct({ withInventory: false });

      const response = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: product.id, quantity: 50, reorderLevel: 5 });

      expect(response.status).toBe(403);
    });

    it('creates a Change Request when called by MODERATOR and creates live inventory on OWNER approval', async () => {
      const { token: modToken } = await createModerator();
      const { token: ownerToken } = await createOwner();
      const product = await createTestProduct({ withInventory: false });

      const response = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${modToken}`)
        .send({ productId: product.id, quantity: 50, reorderLevel: 5 });

      expect(response.status).toBe(201);
      expect(response.body.data.request).toBeDefined();
      const requestId = response.body.data.request.id;

      // Unchanged before approval
      const unapproved = await prisma.inventory.findUnique({ where: { productId: product.id } });
      expect(unapproved).toBeNull();

      // Owner approves
      const approveRes = await request(app)
        .patch(`/api/requests/${requestId}/approve`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(approveRes.status).toBe(200);

      const dbInventory = await prisma.inventory.findUnique({ where: { productId: product.id } });
      expect(dbInventory?.quantity).toBe(50);
      expect(dbInventory?.reorderLevel).toBe(5);
    });

    it('returns 400 when product already has inventory', async () => {
      const { token: modToken } = await createModerator();
      const product = await createTestProduct({ withInventory: true, quantity: 10 });

      const response = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${modToken}`)
        .send({ productId: product.id, quantity: 20 });

      expect(response.status).toBe(400);
    });

    it('returns 409 when product already has a pending ADD_INVENTORY request', async () => {
      const { token: modToken } = await createModerator();
      const product = await createTestProduct({ withInventory: false });

      // First request
      await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${modToken}`)
        .send({ productId: product.id, quantity: 30 });

      // Second duplicate request
      const response = await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${modToken}`)
        .send({ productId: product.id, quantity: 40 });

      expect(response.status).toBe(409);
    });
  });

  describe('GET /api/inventory/available-products (Record Stock eligible products)', () => {
    it('returns only approved products without inventory and without pending initial stock request', async () => {
      const { token: modToken } = await createModerator();
      const productEligible = await createTestProduct({ withInventory: false });
      const productWithInventory = await createTestProduct({ withInventory: true, quantity: 10 });
      const productPending = await createTestProduct({ withInventory: false });

      // Submit pending initial stock for productPending
      await request(app)
        .post('/api/inventory')
        .set('Authorization', `Bearer ${modToken}`)
        .send({ productId: productPending.id, quantity: 25 });

      const response = await request(app)
        .get('/api/inventory/available-products')
        .set('Authorization', `Bearer ${modToken}`);

      expect(response.status).toBe(200);
      const productIds = (response.body.data.products as Array<{ id: string }>).map((p) => p.id);
      expect(productIds).toContain(productEligible.id);
      expect(productIds).not.toContain(productWithInventory.id);
      expect(productIds).not.toContain(productPending.id);
    });
  });

  describe('PATCH /api/inventory/:productId/adjust (adjust stock)', () => {
    it('rejects direct adjust stock by OWNER with 403', async () => {
      const { token } = await createOwner();
      const product = await createTestProduct({ withInventory: true, quantity: 20 });

      const response = await request(app)
        .patch(`/api/inventory/${product.id}/adjust`)
        .set('Authorization', `Bearer ${token}`)
        .send({ targetQuantity: 75 });

      expect(response.status).toBe(403);
    });

    it('creates a Change Request when called by MODERATOR and updates quantity on OWNER approval', async () => {
      const { token: modToken } = await createModerator();
      const { token: ownerToken } = await createOwner();
      const product = await createTestProduct({ withInventory: true, quantity: 20 });

      const response = await request(app)
        .patch(`/api/inventory/${product.id}/adjust`)
        .set('Authorization', `Bearer ${modToken}`)
        .send({ targetQuantity: 75 });

      expect(response.status).toBe(200);
      const requestId = response.body.data.request.id;

      const approveRes = await request(app)
        .patch(`/api/requests/${requestId}/approve`)
        .set('Authorization', `Bearer ${ownerToken}`);
      expect(approveRes.status).toBe(200);

      const dbInventory = await prisma.inventory.findUnique({ where: { productId: product.id } });
      expect(dbInventory?.quantity).toBe(75);
    });
  });
});
