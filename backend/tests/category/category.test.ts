import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import { createCustomer, createModerator, createOwner, createTestCategory } from '../helpers/factories';
import app from '../helpers/testApp';

describe('Category module', () => {
  describe('GET /api/categories', () => {
    it('lists all active categories without requiring authentication', async () => {
      await createTestCategory({ name: 'Wall Panels' });
      await createTestCategory({ name: 'Ceiling Panels' });
      await createTestCategory({ name: 'Hidden Category', isActive: false });

      const response = await request(app).get('/api/categories');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      const names = (response.body.data.categories as Array<{ name: string }>).map((c) => c.name);
      expect(names).toEqual(expect.arrayContaining(['Wall Panels', 'Ceiling Panels']));
      expect(names).not.toContain('Hidden Category');
    });
  });

  describe('GET /api/categories/:id', () => {
    it('returns a category by id', async () => {
      const category = await createTestCategory({ name: 'Flooring Panels' });

      const response = await request(app).get(`/api/categories/${category.id}`);

      expect(response.status).toBe(200);
      expect(response.body.data.category.id).toBe(category.id);
      expect(response.body.data.category.name).toBe('Flooring Panels');
    });

    it('returns 404 for an id that does not exist', async () => {
      const response = await request(app).get('/api/categories/00000000-0000-0000-0000-000000000000');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/categories (create + role guards)', () => {
    it('rejects invalid input with 400', async () => {
      const { token } = await createOwner();

      const response = await request(app).post('/api/categories').set('Authorization', `Bearer ${token}`).send({ name: 'A' });

      expect(response.status).toBe(400);
      expect(response.body.errors[0].path).toBe('name');
    });

    it('rejects an unauthenticated request with 401', async () => {
      const response = await request(app).post('/api/categories').send({ name: 'No Auth Category' });

      expect(response.status).toBe(401);
    });

    it('a CUSTOMER cannot create a category (403)', async () => {
      const { token } = await createCustomer();

      const response = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Customer Category' });

      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });

    it('a MODERATOR can create a category', async () => {
      const { token } = await createModerator();

      const response = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Moderator Category' });

      expect(response.status).toBe(201);
      expect(response.body.data.category.slug).toBe('moderator-category');

      const dbCategory = await prisma.category.findUnique({ where: { id: response.body.data.category.id } });
      expect(dbCategory).not.toBeNull();
    });

    it('an OWNER can create a category', async () => {
      const { token } = await createOwner();

      const response = await request(app).post('/api/categories').set('Authorization', `Bearer ${token}`).send({ name: 'Owner Category' });

      expect(response.status).toBe(201);
      expect(response.body.data.category.name).toBe('Owner Category');
    });
  });

  describe('PATCH /api/categories/:id (update)', () => {
    it('updates a category and persists the change to the database', async () => {
      const { token } = await createOwner();
      const category = await createTestCategory({ name: 'Original Name' });

      const response = await request(app)
        .patch(`/api/categories/${category.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ description: 'Updated description.' });

      expect(response.status).toBe(200);
      expect(response.body.data.category.description).toBe('Updated description.');

      const dbCategory = await prisma.category.findUnique({ where: { id: category.id } });
      expect(dbCategory?.description).toBe('Updated description.');
    });
  });

  describe('DELETE /api/categories/:id (soft delete)', () => {
    it('soft deletes a category and hides it from public reads', async () => {
      const { token } = await createOwner();
      const category = await createTestCategory({ name: 'To Delete' });

      const response = await request(app).delete(`/api/categories/${category.id}`).set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.category.isActive).toBe(false);

      const dbCategory = await prisma.category.findUnique({ where: { id: category.id } });
      expect(dbCategory?.isActive).toBe(false);

      const getResponse = await request(app).get(`/api/categories/${category.id}`);
      expect(getResponse.status).toBe(404);
    });
  });
});
