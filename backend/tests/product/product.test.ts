import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import { createOwner, createTestCategory, createTestProduct } from '../helpers/factories';
import app from '../helpers/testApp';

describe('Product module', () => {
  describe('POST /api/products (create)', () => {
    it('creates a product under an existing category', async () => {
      const { token } = await createOwner();
      const category = await createTestCategory();

      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${token}`)
        .send({
          categoryId: category.id,
          name: 'Oak Veneer Wall Panel',
          sku: `SKU-${Date.now()}`,
          price: 1850,
          width: 60,
          height: 240,
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.product.name).toBe('Oak Veneer Wall Panel');
      expect(response.body.data.product.category.id).toBe(category.id);

      const dbProduct = await prisma.product.findUnique({ where: { id: response.body.data.product.id } });
      expect(dbProduct).not.toBeNull();
    });

    it('rejects invalid input (non-positive price) with 400', async () => {
      const { token } = await createOwner();
      const category = await createTestCategory();

      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${token}`)
        .send({ categoryId: category.id, name: 'Bad Product', sku: `SKU-${Date.now()}`, price: -5 });

      expect(response.status).toBe(400);
      expect(response.body.errors.some((e: { path: string }) => e.path === 'price')).toBe(true);
    });

    it('returns 404 when the category does not exist', async () => {
      const { token } = await createOwner();

      const response = await request(app)
        .post('/api/products')
        .set('Authorization', `Bearer ${token}`)
        .send({
          categoryId: '00000000-0000-0000-0000-000000000000',
          name: 'Orphan Product',
          sku: `SKU-${Date.now()}`,
          price: 100,
        });

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /api/products/:id (update)', () => {
    it('updates a product and persists the change to the database', async () => {
      const { token } = await createOwner();
      const product = await createTestProduct({ price: 100 });

      const response = await request(app)
        .patch(`/api/products/${product.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ price: 250 });

      expect(response.status).toBe(200);
      expect(Number(response.body.data.product.price)).toBe(250);

      const dbProduct = await prisma.product.findUnique({ where: { id: product.id } });
      expect(Number(dbProduct?.price)).toBe(250);
    });
  });

  describe('DELETE /api/products/:id (soft delete)', () => {
    it('soft deletes a product via deletedAt and hides it from reads', async () => {
      const { token } = await createOwner();
      const product = await createTestProduct();

      const response = await request(app).delete(`/api/products/${product.id}`).set('Authorization', `Bearer ${token}`);
      expect(response.status).toBe(200);

      const dbProduct = await prisma.product.findUnique({ where: { id: product.id } });
      expect(dbProduct?.deletedAt).not.toBeNull();
      expect(dbProduct?.isActive).toBe(false);

      const getResponse = await request(app).get(`/api/products/${product.id}`);
      expect(getResponse.status).toBe(404);
    });
  });

  describe('GET /api/products/search', () => {
    it('finds only products matching the search term', async () => {
      await createTestProduct({ name: 'Aluminum Cladding Panel' });
      await createTestProduct({ name: 'Stone Veneer Cladding Panel' });
      await createTestProduct({ name: 'Vinyl Flooring Panel' });

      const response = await request(app).get('/api/products/search').query({ search: 'Cladding' });

      expect(response.status).toBe(200);
      const names = (response.body.data.products as Array<{ name: string }>).map((p) => p.name);
      expect(names).toContain('Aluminum Cladding Panel');
      expect(names).toContain('Stone Veneer Cladding Panel');
      expect(names).not.toContain('Vinyl Flooring Panel');
    });
  });

  describe('GET /api/products/category/:categoryId', () => {
    it('filters products by category', async () => {
      const categoryA = await createTestCategory({ name: 'Category A' });
      const categoryB = await createTestCategory({ name: 'Category B' });
      await createTestProduct({ categoryId: categoryA.id, name: 'Product A1' });
      await createTestProduct({ categoryId: categoryB.id, name: 'Product B1' });

      const response = await request(app).get(`/api/products/category/${categoryA.id}`);

      expect(response.status).toBe(200);
      expect(response.body.data.products).toHaveLength(1);
      expect(response.body.data.products[0].name).toBe('Product A1');
    });

    it('returns 404 when the category does not exist', async () => {
      const response = await request(app).get('/api/products/category/00000000-0000-0000-0000-000000000000');
      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/products/featured', () => {
    it('returns only featured products', async () => {
      await createTestProduct({ name: 'Featured Panel', isFeatured: true });
      await createTestProduct({ name: 'Regular Panel', isFeatured: false });

      const response = await request(app).get('/api/products/featured');

      expect(response.status).toBe(200);
      const products = response.body.data.products as Array<{ name: string; isFeatured: boolean }>;
      expect(products.length).toBeGreaterThan(0);
      expect(products.every((p) => p.isFeatured)).toBe(true);
      expect(products.some((p) => p.name === 'Featured Panel')).toBe(true);
    });
  });

  describe('GET /api/products/:id (product details)', () => {
    it('returns full product details including category/images/inventory relations', async () => {
      const product = await createTestProduct({ withInventory: true, quantity: 40 });

      const response = await request(app).get(`/api/products/${product.id}`);

      expect(response.status).toBe(200);
      expect(response.body.data.product.id).toBe(product.id);
      expect(response.body.data.product.category).toBeDefined();
      expect(response.body.data.product.inventory).toBeDefined();
      expect(response.body.data.product.inventory.quantity).toBe(40);
    });

    it('returns 404 for a product that does not exist', async () => {
      const response = await request(app).get('/api/products/00000000-0000-0000-0000-000000000000');
      expect(response.status).toBe(404);
    });
  });
});
