import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import {
  addCartItem,
  createCustomer,
  createTestCart,
  createTestProduct,
} from '../helpers/factories';
import app from '../helpers/testApp';

const VALID_ADDRESS = '123 Rizal Street, Quezon City, Metro Manila, 1100';

describe('Order item selection during checkout', () => {
  it('allows checking out only selected products while retaining unselected products in cart', async () => {
    const customer = await createCustomer();
    const productA = await createTestProduct({ name: 'Product A', withInventory: true, quantity: 10, price: 100 });
    const productB = await createTestProduct({ name: 'Product B', withInventory: true, quantity: 10, price: 200 });
    const productC = await createTestProduct({ name: 'Product C', withInventory: true, quantity: 10, price: 300 });

    const cart = await createTestCart(customer.user.id);
    await addCartItem(cart.id, productA.id, 1);
    await addCartItem(cart.id, productB.id, 1);
    await addCartItem(cart.id, productC.id, 1);

    // Customer selects only Product A and Product C
    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        shippingAddress: VALID_ADDRESS,
        selectedProductIds: [productA.id, productC.id],
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    const order = response.body.data.order;
    expect(order.items).toHaveLength(2);
    const orderedProductIds = order.items.map((item: { productId: string }) => item.productId);
    expect(orderedProductIds).toContain(productA.id);
    expect(orderedProductIds).toContain(productC.id);
    expect(orderedProductIds).not.toContain(productB.id);

    // Verify subtotal = 100 + 300 = 400
    expect(Number(order.subtotal)).toBe(400);

    // Verify Product B is still in the customer's cart
    const remainingCartItems = await prisma.cartItem.findMany({
      where: { cartId: cart.id },
    });
    expect(remainingCartItems).toHaveLength(1);
    expect(remainingCartItems[0].productId).toBe(productB.id);

    // Verify inventory: A decremented from 10 to 9, C decremented from 10 to 9, B still 10
    const invA = await prisma.inventory.findUnique({ where: { productId: productA.id } });
    const invB = await prisma.inventory.findUnique({ where: { productId: productB.id } });
    const invC = await prisma.inventory.findUnique({ where: { productId: productC.id } });
    expect(invA?.quantity).toBe(9);
    expect(invB?.quantity).toBe(10);
    expect(invC?.quantity).toBe(9);
  });

  it('rejects order creation if selectedProductIds contains no matching cart items', async () => {
    const customer = await createCustomer();
    const productA = await createTestProduct({ withInventory: true, quantity: 10, price: 100 });
    const productUnrelated = await createTestProduct({ withInventory: true, quantity: 10, price: 100 });

    const cart = await createTestCart(customer.user.id);
    await addCartItem(cart.id, productA.id, 1);

    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        shippingAddress: VALID_ADDRESS,
        selectedProductIds: [productUnrelated.id],
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/No selected items found/i);
  });

  it('allows direct checkout of a product without adding to cart and preserves existing cart items', async () => {
    const customer = await createCustomer();
    const productA = await createTestProduct({ name: 'Direct Product A', withInventory: true, quantity: 5, price: 150 });
    const productB = await createTestProduct({ name: 'Cart Product B', withInventory: true, quantity: 10, price: 200 });

    // Customer already has Product B in their cart
    const cart = await createTestCart(customer.user.id);
    await addCartItem(cart.id, productB.id, 2);

    // Customer performs direct checkout for Product A with quantity 3
    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        shippingAddress: VALID_ADDRESS,
        directItem: {
          productId: productA.id,
          quantity: 3,
        },
      });

    expect(response.status).toBe(201);
    expect(response.body.success).toBe(true);
    const order = response.body.data.order;
    expect(order.items).toHaveLength(1);
    expect(order.items[0].productId).toBe(productA.id);
    expect(order.items[0].quantity).toBe(3);
    expect(Number(order.subtotal)).toBe(450);

    // Product B must STILL be in the customer's cart with quantity 2
    const remainingCartItems = await prisma.cartItem.findMany({
      where: { cartId: cart.id },
    });
    expect(remainingCartItems).toHaveLength(1);
    expect(remainingCartItems[0].productId).toBe(productB.id);
    expect(remainingCartItems[0].quantity).toBe(2);

    // Inventory check: Product A decreased from 5 to 2; Product B remains 10
    const invA = await prisma.inventory.findUnique({ where: { productId: productA.id } });
    const invB = await prisma.inventory.findUnique({ where: { productId: productB.id } });
    expect(invA?.quantity).toBe(2);
    expect(invB?.quantity).toBe(10);
  });

  it('rejects direct checkout if requested quantity exceeds available stock', async () => {
    const customer = await createCustomer();
    const productA = await createTestProduct({ name: 'Limited Stock Product', withInventory: true, quantity: 2, price: 100 });

    const response = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        shippingAddress: VALID_ADDRESS,
        directItem: {
          productId: productA.id,
          quantity: 5,
        },
      });

    expect(response.status).toBe(400);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/limited availability/i);
  });
});
