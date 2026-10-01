import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import { PRICE_MESSAGE, hasAllowedPriceDigits } from '../../src/modules/product/product.validation';
import { serializeDescription } from '../../src/modules/request/request.types';
import { createModerator, createOwner, createTestCategory, createTestProduct } from '../helpers/factories';
import app from '../helpers/testApp';

const ALLOWED = [1, 20, 1850, 1850.5, 99999, 99999.99];
const REJECTED = [100000, 123456, 1.999, 99999.999, 1e21];

const addProduct = async (token: string, price: number) => {
  const category = await createTestCategory();
  return request(app)
    .post('/api/products')
    .set('Authorization', `Bearer ${token}`)
    .send({ categoryId: category.id, name: 'Price Test Panel', sku: `SKU-PRICE-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, price });
};

const approve = (token: string, requestId: string) =>
  request(app).patch(`/api/requests/${requestId}/approve`).set('Authorization', `Bearer ${token}`).send({});

describe('Product price is limited to 5 digits (up to 99,999.99)', () => {
  it.each(ALLOWED)('allows %s', (price) => {
    expect(hasAllowedPriceDigits(price)).toBe(true);
  });

  it.each(REJECTED)('rejects %s', (price) => {
    expect(hasAllowedPriceDigits(price)).toBe(false);
  });

  it.each(ALLOWED)('POST /api/products accepts %s', async (price) => {
    const { token } = await createModerator();
    expect((await addProduct(token, price)).status).toBe(201);
  });

  it.each(REJECTED)('POST /api/products rejects %s and creates no request', async (price) => {
    const { token } = await createModerator();
    const response = await addProduct(token, price);

    expect(response.status).toBe(400);
    expect(response.body.errors).toContainEqual({ path: 'price', message: PRICE_MESSAGE });
    expect(await prisma.request.count()).toBe(0);
  });

  it.each(REJECTED)('PATCH /api/products/:id rejects %s when editing', async (price) => {
    const { token } = await createModerator();
    const product = await createTestProduct();

    const response = await request(app).patch(`/api/products/${product.id}`).set('Authorization', `Bearer ${token}`).send({ price });

    expect(response.status).toBe(400);
    expect(await prisma.request.count()).toBe(0);
  });

  it('stores an approved 99,999.99 price exactly', async () => {
    const moderator = await createModerator();
    const owner = await createOwner();
    const created = await addProduct(moderator.token, 99999.99);

    expect((await approve(owner.token, created.body.data.request.id)).status).toBe(200);
    const product = await prisma.product.findFirstOrThrow({ where: { name: 'Price Test Panel' } });
    expect(product.price.toString()).toBe('99999.99');
  });

  it.each(['ADD_PRODUCT', 'EDIT_PRODUCT'] as const)('refuses a hand-made %s request with a 6-digit price sent straight to /api/requests', async (action) => {
    const moderator = await createModerator();
    const owner = await createOwner();
    const category = await createTestCategory();
    const product = await createTestProduct({ categoryId: category.id, price: 100 });

    const payload =
      action === 'ADD_PRODUCT'
        ? { action, scope: 'PRODUCTS', productData: { categoryId: category.id, name: 'Forged Price Panel', sku: 'SKU-FORGED-PRICE', price: 1000000 } }
        : { action, scope: 'PRODUCTS', productId: product.id, updateData: { price: 1000000 } };
    const forged = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${moderator.token}`)
      .send({ type: 'OTHER', title: 'Forged price change', description: serializeDescription('Forged', payload as never) });
    expect(forged.status).toBe(201);

    const response = await approve(owner.token, forged.body.data.request.id);

    expect(response.status).toBe(400);
    expect(await prisma.product.count({ where: { sku: 'SKU-FORGED-PRICE' } })).toBe(0);
    expect(Number((await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).price)).toBe(100);
  });
});
