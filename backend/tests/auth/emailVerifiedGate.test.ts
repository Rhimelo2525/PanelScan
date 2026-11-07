import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import { addCartItem, authHeader, createCustomer, createTestCart, createTestProduct, TEST_PASSWORD } from '../helpers/factories';
import app from '../helpers/testApp';

const VERIFY_FIRST = 'Please verify your email address first. You can do this in your profile.';

const HOME = {
  label: 'Home',
  recipientName: 'Maria Santos',
  recipientPhone: '0917 123 4567',
  addressLine1: '219 Talisay Street',
  regionCode: '030000000',
  regionName: 'Region III – Central Luzon',
  provinceCode: '0301400000',
  provinceName: 'Bulacan',
  cityMunicipalityCode: '0301410000',
  cityMunicipalityName: 'City of Malolos',
  barangayCode: '0301410049',
  barangayName: 'Santo Niño',
  postalCode: '3000',
  latitude: 14.8433,
  longitude: 120.8114,
};

const SHIPPING_ADDRESS = '123 Rizal Street, Quezon City, Metro Manila, 1100';

const unverifiedCustomer = () => createCustomer({ emailVerified: false });

const expectVerifyFirst = (response: request.Response) => {
  expect(response.status).toBe(403);
  expect(response.body.message).toBe(VERIFY_FIRST);
};

describe('A customer whose email is not verified', () => {
  describe('cannot check out', () => {
    it('is refused an order, and the cart is left as it was', async () => {
      const { token, user } = await unverifiedCustomer();
      const product = await createTestProduct({ withInventory: true, quantity: 20 });
      const cart = await createTestCart(user.id);
      await addCartItem(cart.id, product.id, 2);

      const response = await request(app).post('/api/orders').set(authHeader(token)).send({ shippingAddress: SHIPPING_ADDRESS });

      expectVerifyFirst(response);
      expect(await prisma.order.count({ where: { customerId: user.id } })).toBe(0);
      expect(await prisma.cartItem.count({ where: { cartId: cart.id } })).toBe(1);
    });

    it('can check out as soon as the email is verified', async () => {
      const { token, user } = await unverifiedCustomer();
      const product = await createTestProduct({ withInventory: true, quantity: 20 });
      const cart = await createTestCart(user.id);
      await addCartItem(cart.id, product.id, 2);

      await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });
      const response = await request(app).post('/api/orders').set(authHeader(token)).send({ shippingAddress: SHIPPING_ADDRESS });

      expect(response.status).toBe(201);
    });
  });

  describe('cannot edit the profile', () => {
    it('is refused a change to personal details', async () => {
      const { token, user } = await unverifiedCustomer();

      const response = await request(app).patch('/api/auth/me').set(authHeader(token)).send({ firstName: 'Changed' });

      expectVerifyFirst(response);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).firstName).toBe(user.firstName);
    });

    it('can edit the profile as soon as the email is verified', async () => {
      const { token, user } = await unverifiedCustomer();

      await prisma.user.update({ where: { id: user.id }, data: { emailVerified: true } });
      const response = await request(app).patch('/api/auth/me').set(authHeader(token)).send({ firstName: 'Changed' });

      expect(response.status).toBe(200);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).firstName).toBe('Changed');
    });

    it('is refused a new or removed profile picture', async () => {
      const { token } = await unverifiedCustomer();

      const upload = await request(app)
        .put('/api/auth/me/profile-picture')
        .set(authHeader(token))
        .attach('image', Buffer.from('not looked at'), { filename: 'x.jpg', contentType: 'image/jpeg' });
      expectVerifyFirst(upload);

      expectVerifyFirst(await request(app).delete('/api/auth/me/profile-picture').set(authHeader(token)));
    });

    it('is refused any change to saved addresses, but can still read them', async () => {
      const { token, user } = await createCustomer();
      const saved = await request(app).post('/api/addresses').set(authHeader(token)).send(HOME);
      expect(saved.status).toBe(201);
      const id = saved.body.data.address.id as string;
      await prisma.user.update({ where: { id: user.id }, data: { emailVerified: false } });

      expectVerifyFirst(await request(app).post('/api/addresses').set(authHeader(token)).send(HOME));
      expectVerifyFirst(await request(app).put(`/api/addresses/${id}`).set(authHeader(token)).send({ ...HOME, label: 'Changed' }));
      expectVerifyFirst(await request(app).patch(`/api/addresses/${id}/default`).set(authHeader(token)));
      expectVerifyFirst(await request(app).delete(`/api/addresses/${id}`).set(authHeader(token)));

      const list = await request(app).get('/api/addresses').set(authHeader(token));
      expect(list.status).toBe(200);
      expect(list.body.data.addresses).toHaveLength(1);
      expect(list.body.data.addresses[0].label).toBe('Home');
    });
  });

  describe('can still', () => {
    it('measure with AR and save the project for the 3D preview', async () => {
      const { token } = await unverifiedCustomer();

      const measurement = await request(app).post('/api/ar/measurements').set(authHeader(token)).send({ width: 3, height: 2 });
      expect(measurement.status).toBe(201);

      const project = await request(app)
        .post('/api/projects/mobile')
        .set(authHeader(token))
        .send({
          externalProjectId: 'unverified-project',
          name: 'Wall · 3.20 × 2.60 m',
          arMetadata: { surfaceType: 'WALL', widthMeters: 3.2, heightMeters: 2.6, finalQuantity: 7 },
        });
      expect(project.status).toBe(200);
    });

    it('fill the cart', async () => {
      const { token } = await unverifiedCustomer();
      const product = await createTestProduct({ withInventory: true, quantity: 20 });

      const response = await request(app).post('/api/cart/items').set(authHeader(token)).send({ productId: product.id, quantity: 1 });

      expect(response.status).toBe(201);
    });

    it('change the password', async () => {
      const { token } = await unverifiedCustomer();
      const newPassword = 'N3w-Str0ng!Pass';

      const response = await request(app)
        .post('/api/auth/change-password')
        .set(authHeader(token))
        .send({ currentPassword: TEST_PASSWORD, newPassword, confirmPassword: newPassword });

      expect(response.status).toBe(200);
    });
  });
});
