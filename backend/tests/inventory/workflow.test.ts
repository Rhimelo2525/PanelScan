import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import { createModerator, createOwner, createTestCategory } from '../helpers/factories';
import app from '../helpers/testApp';

describe('Workflow & Role Separation (9 Scenarios)', () => {
  it('Scenario 1: Product Creation Approval Flow', async () => {
    const { token: modToken } = await createModerator();
    const { token: ownerToken } = await createOwner();
    const category = await createTestCategory();
    const sku = `SKU-SCENARIO-1-${Date.now()}`;

    // Moderator submits Product A
    const createRes = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${modToken}`)
      .send({
        categoryId: category.id,
        name: 'Product A',
        sku,
        price: 1500,
      });

    expect(createRes.status).toBe(201);
    expect(createRes.body.data.requiresApproval).toBe(true);
    const requestId = createRes.body.data.request.id;

    // Product is not live yet
    const unapproved = await prisma.product.findFirst({ where: { sku, deletedAt: null } });
    expect(unapproved).toBeNull();

    // Owner approves
    const approveRes = await request(app)
      .post(`/api/requests/${requestId}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(approveRes.status).toBe(200);

    // Product is now live
    const liveProduct = await prisma.product.findFirst({ where: { sku, deletedAt: null } });
    expect(liveProduct).not.toBeNull();
    expect(liveProduct?.name).toBe('Product A');

    // Product appears in Record Stock dropdown (available-products)
    const availRes = await request(app)
      .get('/api/inventory/available-products')
      .set('Authorization', `Bearer ${modToken}`);
    expect(availRes.status).toBe(200);
    const ids = (availRes.body.data.products as Array<{ id: string }>).map((p) => p.id);
    expect(ids).toContain(liveProduct!.id);
  });

  it('Scenario 2: Record Initial Stock Flow', async () => {
    const { token: modToken } = await createModerator();
    const { token: ownerToken } = await createOwner();
    const category = await createTestCategory();
    const sku = `SKU-SCENARIO-2-${Date.now()}`;

    // Setup: create and approve Product A
    const prodRes = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${modToken}`)
      .send({ categoryId: category.id, name: 'Product A2', sku, price: 1000 });
    await request(app)
      .post(`/api/requests/${prodRes.body.data.request.id}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const product = (await prisma.product.findFirst({ where: { sku } }))!;

    // Moderator records initial stock of 50
    const stockRes = await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${modToken}`)
      .send({ productId: product.id, quantity: 50, reorderLevel: 10 });
    expect(stockRes.status).toBe(202);
    const stockRequestId = stockRes.body.data.request.id;

    // Live inventory not created yet
    let liveInventory = await prisma.inventory.findUnique({ where: { productId: product.id } });
    expect(liveInventory).toBeNull();

    // Product disappears from Record Stock dropdown due to pending request
    let availRes = await request(app)
      .get('/api/inventory/available-products')
      .set('Authorization', `Bearer ${modToken}`);
    let ids = (availRes.body.data.products as Array<{ id: string }>).map((p) => p.id);
    expect(ids).not.toContain(product.id);

    // Owner approves initial stock request
    const approveRes = await request(app)
      .post(`/api/requests/${stockRequestId}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(approveRes.status).toBe(200);

    // Live inventory exists with quantity 50
    liveInventory = await prisma.inventory.findUnique({ where: { productId: product.id } });
    expect(liveInventory).not.toBeNull();
    expect(liveInventory?.quantity).toBe(50);

    // Product remains absent from Record Stock dropdown
    availRes = await request(app)
      .get('/api/inventory/available-products')
      .set('Authorization', `Bearer ${modToken}`);
    ids = (availRes.body.data.products as Array<{ id: string }>).map((p) => p.id);
    expect(ids).not.toContain(product.id);
  });

  it('Scenario 3: Adjust Existing Inventory Flow', async () => {
    const { token: modToken } = await createModerator();
    const { token: ownerToken } = await createOwner();
    const category = await createTestCategory();
    const sku = `SKU-SCENARIO-3-${Date.now()}`;

    // Create & approve product
    const prodRes = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${modToken}`)
      .send({ categoryId: category.id, name: 'Product A3', sku, price: 1000 });
    await request(app)
      .post(`/api/requests/${prodRes.body.data.request.id}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const product = (await prisma.product.findFirst({ where: { sku } }))!;

    // Record initial stock = 50 & approve
    const stockRes = await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${modToken}`)
      .send({ productId: product.id, quantity: 50 });
    await request(app)
      .post(`/api/requests/${stockRes.body.data.request.id}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`);

    // Moderator adjusts stock from 50 to 75
    const adjRes = await request(app)
      .patch(`/api/inventory/${product.id}/adjust`)
      .set('Authorization', `Bearer ${modToken}`)
      .send({ targetQuantity: 75 });
    expect(adjRes.status).toBe(202);
    const adjRequestId = adjRes.body.data.request.id;

    // Live inventory still 50 before approval
    let inv = await prisma.inventory.findUnique({ where: { productId: product.id } });
    expect(inv?.quantity).toBe(50);

    // Owner approves
    const approveRes = await request(app)
      .post(`/api/requests/${adjRequestId}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(approveRes.status).toBe(200);

    // Live inventory updated to 75
    inv = await prisma.inventory.findUnique({ where: { productId: product.id } });
    expect(inv?.quantity).toBe(75);

    // Product remains absent from Record Stock dropdown
    const availRes = await request(app)
      .get('/api/inventory/available-products')
      .set('Authorization', `Bearer ${modToken}`);
    const ids = (availRes.body.data.products as Array<{ id: string }>).map((p) => p.id);
    expect(ids).not.toContain(product.id);
  });

  it('Scenario 4: Zero Stock Flow', async () => {
    const { token: modToken } = await createModerator();
    const { token: ownerToken } = await createOwner();
    const category = await createTestCategory();
    const sku = `SKU-SCENARIO-4-${Date.now()}`;

    // Create & approve product
    const prodRes = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${modToken}`)
      .send({ categoryId: category.id, name: 'Product A4', sku, price: 1000 });
    await request(app)
      .post(`/api/requests/${prodRes.body.data.request.id}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const product = (await prisma.product.findFirst({ where: { sku } }))!;

    // Record initial stock = 75 & approve
    const stockRes = await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${modToken}`)
      .send({ productId: product.id, quantity: 75 });
    await request(app)
      .post(`/api/requests/${stockRes.body.data.request.id}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`);

    // Moderator adjusts stock to 0
    const adjRes = await request(app)
      .patch(`/api/inventory/${product.id}/adjust`)
      .set('Authorization', `Bearer ${modToken}`)
      .send({ targetQuantity: 0 });
    expect(adjRes.status).toBe(202);

    // Owner approves
    await request(app)
      .post(`/api/requests/${adjRes.body.data.request.id}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`);

    // Inventory record exists and quantity is 0
    const inv = await prisma.inventory.findUnique({ where: { productId: product.id } });
    expect(inv).not.toBeNull();
    expect(inv?.quantity).toBe(0);

    // Product does NOT reappear in Record Stock dropdown
    const availRes = await request(app)
      .get('/api/inventory/available-products')
      .set('Authorization', `Bearer ${modToken}`);
    const ids = (availRes.body.data.products as Array<{ id: string }>).map((p) => p.id);
    expect(ids).not.toContain(product.id);
  });

  it('Scenario 5: Multiple Products Flow', async () => {
    const { token: modToken } = await createModerator();
    const { token: ownerToken } = await createOwner();
    const category = await createTestCategory();

    // Product A with inventory
    const skuA = `SKU-SCENARIO-5A-${Date.now()}`;
    const prodARes = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${modToken}`)
      .send({ categoryId: category.id, name: 'Product A5', sku: skuA, price: 1000 });
    await request(app)
      .post(`/api/requests/${prodARes.body.data.request.id}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const productA = (await prisma.product.findFirst({ where: { sku: skuA } }))!;
    const stockARes = await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${modToken}`)
      .send({ productId: productA.id, quantity: 20 });
    await request(app)
      .post(`/api/requests/${stockARes.body.data.request.id}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`);

    // Product B without inventory
    const skuB = `SKU-SCENARIO-5B-${Date.now()}`;
    const prodBRes = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${modToken}`)
      .send({ categoryId: category.id, name: 'Product B5', sku: skuB, price: 1200 });
    await request(app)
      .post(`/api/requests/${prodBRes.body.data.request.id}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const productB = (await prisma.product.findFirst({ where: { sku: skuB } }))!;

    // Available products shows Product B, but NOT Product A
    const availRes = await request(app)
      .get('/api/inventory/available-products')
      .set('Authorization', `Bearer ${modToken}`);
    const ids = (availRes.body.data.products as Array<{ id: string }>).map((p) => p.id);
    expect(ids).toContain(productB.id);
    expect(ids).not.toContain(productA.id);
  });

  it('Scenario 6: Duplicate Initial Stock Prevention Flow', async () => {
    const { token: modToken } = await createModerator();
    const { token: ownerToken } = await createOwner();
    const category = await createTestCategory();
    const sku = `SKU-SCENARIO-6-${Date.now()}`;

    // Create & approve Product B
    const prodRes = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${modToken}`)
      .send({ categoryId: category.id, name: 'Product B6', sku, price: 1000 });
    await request(app)
      .post(`/api/requests/${prodRes.body.data.request.id}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const productB = (await prisma.product.findFirst({ where: { sku } }))!;

    // Moderator submits first initial stock request
    const firstReq = await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${modToken}`)
      .send({ productId: productB.id, quantity: 30 });
    expect(firstReq.status).toBe(202);

    // Moderator submits second initial stock request -> 409
    const secondReq = await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${modToken}`)
      .send({ productId: productB.id, quantity: 30 });
    expect(secondReq.status).toBe(409);

    // Owner rejects first request
    const rejectRes = await request(app)
      .post(`/api/requests/${firstReq.body.data.request.id}/reject`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ reason: 'Incorrect quantity' });
    expect(rejectRes.status).toBe(200);

    // Product B remains without inventory and reappears in Record Stock dropdown
    const inv = await prisma.inventory.findUnique({ where: { productId: productB.id } });
    expect(inv).toBeNull();

    const availRes = await request(app)
      .get('/api/inventory/available-products')
      .set('Authorization', `Bearer ${modToken}`);
    const ids = (availRes.body.data.products as Array<{ id: string }>).map((p) => p.id);
    expect(ids).toContain(productB.id);
  });

  it('Scenario 7: Product Edit vs Stock Flow', async () => {
    const { token: modToken } = await createModerator();
    const { token: ownerToken } = await createOwner();
    const category = await createTestCategory();
    const sku = `SKU-SCENARIO-7-${Date.now()}`;

    // Create & approve Product A
    const prodRes = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${modToken}`)
      .send({ categoryId: category.id, name: 'Product A7', sku, price: 1000 });
    await request(app)
      .post(`/api/requests/${prodRes.body.data.request.id}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const productA = (await prisma.product.findFirst({ where: { sku } }))!;

    // Record stock 50 & approve
    const stockRes = await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${modToken}`)
      .send({ productId: productA.id, quantity: 50 });
    await request(app)
      .post(`/api/requests/${stockRes.body.data.request.id}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`);

    // Moderator submits price edit: 1000 -> 1200
    const editRes = await request(app)
      .patch(`/api/products/${productA.id}`)
      .set('Authorization', `Bearer ${modToken}`)
      .send({ price: 1200 });
    expect(editRes.status).toBe(200);
    expect(editRes.body.data.requiresApproval).toBe(true);

    // Owner approves price edit
    await request(app)
      .post(`/api/requests/${editRes.body.data.request.id}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`);

    // Check product price updated
    const updatedProd = await prisma.product.findUnique({ where: { id: productA.id } });
    expect(Number(updatedProd?.price)).toBe(1200);

    // Check inventory quantity unchanged (still 50)
    const inv = await prisma.inventory.findUnique({ where: { productId: productA.id } });
    expect(inv?.quantity).toBe(50);
  });

  it('Scenario 8: Owner Direct Action Block Flow', async () => {
    const { token: ownerToken } = await createOwner();
    const category = await createTestCategory();
    const sku = `SKU-SCENARIO-8-${Date.now()}`;

    // Owner direct product create -> 403
    const createProd = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ categoryId: category.id, name: 'Owner Prod', sku, price: 500 });
    expect(createProd.status).toBe(403);

    // Moderator creates product for further owner tests
    const { token: modToken } = await createModerator();
    const prodRes = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${modToken}`)
      .send({ categoryId: category.id, name: 'Mod Prod', sku, price: 500 });
    await request(app)
      .post(`/api/requests/${prodRes.body.data.request.id}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const product = (await prisma.product.findFirst({ where: { sku } }))!;

    // Owner direct product edit -> 403
    const editProd = await request(app)
      .patch(`/api/products/${product.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ price: 600 });
    expect(editProd.status).toBe(403);

    // Owner direct initial stock record -> 403
    const recordStock = await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ productId: product.id, quantity: 10 });
    expect(recordStock.status).toBe(403);

    // Moderator records stock & owner approves so we have inventory
    const stockRes = await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${modToken}`)
      .send({ productId: product.id, quantity: 10 });
    await request(app)
      .post(`/api/requests/${stockRes.body.data.request.id}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`);

    // Owner direct adjust stock -> 403
    const adjustStock = await request(app)
      .patch(`/api/inventory/${product.id}/adjust`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ targetQuantity: 20 });
    expect(adjustStock.status).toBe(403);

    // Owner direct add stock -> 403
    const addStock = await request(app)
      .patch(`/api/inventory/${product.id}/add`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ quantity: 5 });
    expect(addStock.status).toBe(403);

    // Owner direct reduce stock -> 403
    const reduceStock = await request(app)
      .patch(`/api/inventory/${product.id}/reduce`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ quantity: 2 });
    expect(reduceStock.status).toBe(403);

    // Owner direct product delete -> 403
    const deleteProd = await request(app)
      .delete(`/api/products/${product.id}`)
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(deleteProd.status).toBe(403);
  });

  it('Scenario 9: Duplicate Live Inventory Prevention', async () => {
    const { token: modToken } = await createModerator();
    const { token: ownerToken } = await createOwner();
    const category = await createTestCategory();
    const sku = `SKU-SCENARIO-9-${Date.now()}`;

    // Create & approve Product
    const prodRes = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${modToken}`)
      .send({ categoryId: category.id, name: 'Product A9', sku, price: 1000 });
    await request(app)
      .post(`/api/requests/${prodRes.body.data.request.id}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`);
    const product = (await prisma.product.findFirst({ where: { sku } }))!;

    // Record stock & approve
    const stockRes = await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${modToken}`)
      .send({ productId: product.id, quantity: 40 });
    await request(app)
      .post(`/api/requests/${stockRes.body.data.request.id}/approve`)
      .set('Authorization', `Bearer ${ownerToken}`);

    // Moderator attempts Record Stock again on product with live inventory -> 400
    const duplicateRes = await request(app)
      .post('/api/inventory')
      .set('Authorization', `Bearer ${modToken}`)
      .send({ productId: product.id, quantity: 50 });
    expect(duplicateRes.status).toBe(400);
  });
});
