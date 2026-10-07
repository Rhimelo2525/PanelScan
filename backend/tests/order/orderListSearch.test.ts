import { OrderStatus } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import { authHeader, createCustomer, createTestCategory, createTestOrder, createTestProduct } from '../helpers/factories';
import app from '../helpers/testApp';

const listOrders = (token: string, query: Record<string, string>) =>
  request(app).get(`/api/orders?${new URLSearchParams(query).toString()}`).set(authHeader(token));

describe('Customer order list: tabs, search and item thumbnails', () => {
  it('filters by status and searches order numbers and product names, only within your own orders', async () => {
    const { user, token } = await createCustomer();
    const other = await createCustomer();
    const category = await createTestCategory();
    const oak = await createTestProduct({ categoryId: category.id, name: 'Oak Wall Panel' });
    const pine = await createTestProduct({ categoryId: category.id, name: 'Pine Ceiling Panel' });

    const oakOrder = await createTestOrder({ customerId: user.id, status: OrderStatus.DELIVERED, items: [{ productId: oak.id, quantity: 2, productName: 'Oak Wall Panel' }] });
    await createTestOrder({ customerId: user.id, status: OrderStatus.PENDING, items: [{ productId: pine.id, quantity: 1, productName: 'Pine Ceiling Panel' }] });
    await createTestOrder({ customerId: other.user.id, status: OrderStatus.DELIVERED, items: [{ productId: oak.id, quantity: 1, productName: 'Oak Wall Panel' }] });

    const delivered = await listOrders(token, { status: 'DELIVERED' });
    expect(delivered.body.data.orders.map((order: { id: string }) => order.id)).toEqual([oakOrder.id]);

    const byProduct = await listOrders(token, { search: 'oak wall' });
    expect(byProduct.body.data.orders.map((order: { id: string }) => order.id)).toEqual([oakOrder.id]);

    const byNumber = await listOrders(token, { search: oakOrder.orderNumber.slice(-6).toLowerCase() });
    expect(byNumber.body.data.orders.map((order: { id: string }) => order.id)).toEqual([oakOrder.id]);

    const none = await listOrders(token, { search: 'oak', status: 'PENDING' });
    expect(none.body.data.orders).toEqual([]);
    expect(none.body.data.pagination.total).toBe(0);
  });

  it("each line carries its product's primary image and category for the thumbnail", async () => {
    const { user, token } = await createCustomer();
    const category = await createTestCategory();
    const product = await createTestProduct({ categoryId: category.id, name: 'Walnut Panel' });
    await prisma.productImage.createMany({
      data: [
        { productId: product.id, url: '/uploads/products/second.webp', sortOrder: 0 },
        { productId: product.id, url: '/uploads/products/primary.webp', isPrimary: true, sortOrder: 1 },
      ],
    });
    await createTestOrder({ customerId: user.id, items: [{ productId: product.id, quantity: 1, productName: 'Walnut Panel' }] });

    const response = await listOrders(token, {});

    const [line] = response.body.data.orders[0].items;
    expect(line.product).toEqual({ images: [{ url: '/uploads/products/primary.webp', altText: null }], category: { slug: category.slug } });
  });
});
