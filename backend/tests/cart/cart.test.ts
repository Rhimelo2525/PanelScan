import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import { addCartItem, createCustomer, createOwner, createTestCart, createTestProduct } from '../helpers/factories';
import app from '../helpers/testApp';

describe('Cart module', () => {
  describe('access control', () => {
    it('rejects an unauthenticated request with 401', async () => {
      const response = await request(app).get('/api/cart');
      expect(response.status).toBe(401);
    });

    it('rejects a non-CUSTOMER (OWNER) with 403', async () => {
      const { token } = await createOwner();

      const response = await request(app).get('/api/cart').set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(403);
    });
  });

  describe('GET /api/cart (get current cart)', () => {
    it('auto-creates an empty cart for a customer who has none yet', async () => {
      const { token, user } = await createCustomer();

      const response = await request(app).get('/api/cart').set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.cart.items).toEqual([]);

      const dbCart = await prisma.cart.findUnique({ where: { customerId: user.id } });
      expect(dbCart).not.toBeNull();
    });
  });

  describe('POST /api/cart/items (add item)', () => {
    it('adds a product to the cart and persists it to the database', async () => {
      const { token } = await createCustomer();
      const product = await createTestProduct({ withInventory: true, quantity: 20 });

      const response = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: product.id, quantity: 3 });

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Item added to cart successfully.');
      expect(response.body.data.cart.items).toHaveLength(1);
      expect(response.body.data.cart.items[0].quantity).toBe(3);
      expect(response.body.data.cart.items[0].product.id).toBe(product.id);

      const dbItem = await prisma.cartItem.findFirst({ where: { productId: product.id } });
      expect(dbItem?.quantity).toBe(3);
    });

    it('combines quantities when the same product is added twice', async () => {
      const { token } = await createCustomer();
      const product = await createTestProduct({ withInventory: true, quantity: 20 });

      await request(app).post('/api/cart/items').set('Authorization', `Bearer ${token}`).send({ productId: product.id, quantity: 3 });

      const response = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: product.id, quantity: 2 });

      expect(response.status).toBe(201);
      expect(response.body.data.cart.items).toHaveLength(1);
      expect(response.body.data.cart.items[0].quantity).toBe(5);

      const dbItem = await prisma.cartItem.findFirst({ where: { productId: product.id } });
      expect(dbItem?.quantity).toBe(5);
    });

    it('rejects a zero/negative quantity with a 400 validation error', async () => {
      const { token } = await createCustomer();
      const product = await createTestProduct({ withInventory: true, quantity: 20 });

      const response = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: product.id, quantity: -1 });

      expect(response.status).toBe(400);
      expect(response.body.errors.some((e: { path: string }) => e.path === 'quantity')).toBe(true);
    });

    it('returns 404 for a product that does not exist', async () => {
      const { token } = await createCustomer();

      const response = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: '00000000-0000-0000-0000-000000000000', quantity: 1 });

      expect(response.status).toBe(404);
    });

    it('rejects an inactive product with 400', async () => {
      const { token } = await createCustomer();
      const product = await createTestProduct({ withInventory: true, quantity: 20, isActive: false });

      const response = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: product.id, quantity: 1 });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
    });

    it('rejects a product with no available stock with 400', async () => {
      const { token } = await createCustomer();
      // quantity 5, all 5 already reserved -> 0 available
      const product = await createTestProduct({ withInventory: true, quantity: 5, reservedQty: 5 });

      const response = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: product.id, quantity: 1 });

      expect(response.status).toBe(400);
    });

    it('rejects a quantity greater than the available inventory and does not create a row', async () => {
      const { token } = await createCustomer();
      const product = await createTestProduct({ withInventory: true, quantity: 5, reservedQty: 0 });

      const response = await request(app)
        .post('/api/cart/items')
        .set('Authorization', `Bearer ${token}`)
        .send({ productId: product.id, quantity: 10 });

      expect(response.status).toBe(400);

      const dbItem = await prisma.cartItem.findFirst({ where: { productId: product.id } });
      expect(dbItem).toBeNull();
    });
  });

  describe('PATCH /api/cart/items/:productId (update quantity)', () => {
    it('updates the quantity of an existing cart item', async () => {
      const { token, user } = await createCustomer();
      const product = await createTestProduct({ withInventory: true, quantity: 20 });
      const cart = await createTestCart(user.id);
      await addCartItem(cart.id, product.id, 2);

      const response = await request(app)
        .patch(`/api/cart/items/${product.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 7 });

      expect(response.status).toBe(200);
      expect(response.body.data.cart.items[0].quantity).toBe(7);

      const dbItem = await prisma.cartItem.findUnique({
        where: { cartId_productId: { cartId: cart.id, productId: product.id } },
      });
      expect(dbItem?.quantity).toBe(7);
    });

    it('rejects a quantity greater than available inventory and leaves the row unchanged', async () => {
      const { token, user } = await createCustomer();
      const product = await createTestProduct({ withInventory: true, quantity: 5 });
      const cart = await createTestCart(user.id);
      await addCartItem(cart.id, product.id, 2);

      const response = await request(app)
        .patch(`/api/cart/items/${product.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 50 });

      expect(response.status).toBe(400);

      const dbItem = await prisma.cartItem.findUnique({
        where: { cartId_productId: { cartId: cart.id, productId: product.id } },
      });
      expect(dbItem?.quantity).toBe(2);
    });

    it('returns 404 when the product is not already in the cart', async () => {
      const { token, user } = await createCustomer();
      const product = await createTestProduct({ withInventory: true, quantity: 20 });
      await createTestCart(user.id);

      const response = await request(app)
        .patch(`/api/cart/items/${product.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ quantity: 3 });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/cart/items/:productId (remove item)', () => {
    it('removes an item from the cart and persists the removal', async () => {
      const { token, user } = await createCustomer();
      const product = await createTestProduct({ withInventory: true, quantity: 20 });
      const cart = await createTestCart(user.id);
      await addCartItem(cart.id, product.id, 2);

      const response = await request(app).delete(`/api/cart/items/${product.id}`).set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.cart.items).toHaveLength(0);

      const dbItem = await prisma.cartItem.findUnique({
        where: { cartId_productId: { cartId: cart.id, productId: product.id } },
      });
      expect(dbItem).toBeNull();
    });

    it('returns 404 when the product is not in the cart', async () => {
      const { token } = await createCustomer();
      const product = await createTestProduct({ withInventory: true, quantity: 20 });

      const response = await request(app).delete(`/api/cart/items/${product.id}`).set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/cart (clear cart)', () => {
    it('removes every item but keeps the cart itself', async () => {
      const { token, user } = await createCustomer();
      const productA = await createTestProduct({ withInventory: true, quantity: 20 });
      const productB = await createTestProduct({ withInventory: true, quantity: 20 });
      const cart = await createTestCart(user.id);
      await addCartItem(cart.id, productA.id, 1);
      await addCartItem(cart.id, productB.id, 2);

      const response = await request(app).delete('/api/cart').set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.data.cart.items).toHaveLength(0);

      const dbCart = await prisma.cart.findUnique({ where: { id: cart.id } });
      expect(dbCart).not.toBeNull();

      const remainingItems = await prisma.cartItem.count({ where: { cartId: cart.id } });
      expect(remainingItems).toBe(0);
    });
  });
});
