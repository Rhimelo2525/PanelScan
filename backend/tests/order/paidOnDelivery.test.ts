import { OrderStatus, PaymentStatus } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import { PAID_ON_DELIVERY_METHOD } from '../../src/modules/order/order.service';
import { authHeader, createCustomer, createModerator, createTestDelivery, createTestOrder, createTestPayment } from '../helpers/factories';
import app from '../helpers/testApp';

const setStatus = async (orderId: string, status: OrderStatus) => {
  const moderator = await createModerator();
  return request(app).patch(`/api/orders/${orderId}/status`).set(authHeader(moderator.token)).send({ status });
};

describe('Marking an order Delivered marks its payment Paid', () => {
  it('a pending payment becomes PAID, with the time it was settled', async () => {
    const customer = await createCustomer();
    const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.SHIPPED });
    const payment = await createTestPayment({ orderId: order.id, status: PaymentStatus.PENDING });

    expect((await setStatus(order.id, OrderStatus.DELIVERED)).status).toBe(200);

    const after = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(after.status).toBe(PaymentStatus.PAID);
    expect(after.paidAt).toBeInstanceOf(Date);
    expect(after.method).toBe('PayMongo');
  });

  it('an order with no payment record gets a PAID payment for its total', async () => {
    const customer = await createCustomer();
    const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.SHIPPED });

    expect((await setStatus(order.id, OrderStatus.DELIVERED)).status).toBe(200);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { orderId: order.id } });
    expect(payment.status).toBe(PaymentStatus.PAID);
    expect(payment.method).toBe(PAID_ON_DELIVERY_METHOD);
    expect(payment.amount.toString()).toBe(order.totalAmount.toString());
  });

  it('an already paid payment keeps its original paid time', async () => {
    const customer = await createCustomer();
    const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.SHIPPED });
    const paidAt = new Date('2026-09-01T08:00:00.000Z');
    const payment = await createTestPayment({ orderId: order.id, status: PaymentStatus.PAID, paidAt });

    expect((await setStatus(order.id, OrderStatus.DELIVERED)).status).toBe(200);

    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).paidAt?.toISOString()).toBe(paidAt.toISOString());
  });

  it('a delivery still awaiting payment shows Delivered and its shipping payment becomes PAID', async () => {
    const customer = await createCustomer();
    const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.SHIPPED });
    const delivery = await createTestDelivery({ orderId: order.id });
    await prisma.delivery.update({ where: { id: delivery.id }, data: { deliveryStatus: 'AWAITING_PAYMENT' } });
    await prisma.deliveryPayment.create({ data: { deliveryId: delivery.id, method: 'PayMongo', amount: 80, status: PaymentStatus.PENDING } });

    expect((await setStatus(order.id, OrderStatus.DELIVERED)).status).toBe(200);

    expect((await prisma.delivery.findUniqueOrThrow({ where: { id: delivery.id } })).deliveryStatus).toBe('COMPLETED');
    const shipping = await prisma.deliveryPayment.findUniqueOrThrow({ where: { deliveryId: delivery.id } });
    expect(shipping.status).toBe(PaymentStatus.PAID);
    expect(shipping.paidAt).toBeInstanceOf(Date);
  });

  it('a Lalamove-booked delivery keeps the status Lalamove reports', async () => {
    const customer = await createCustomer();
    const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.SHIPPED });
    const delivery = await createTestDelivery({ orderId: order.id });
    await prisma.delivery.update({ where: { id: delivery.id }, data: { deliveryStatus: 'PICKED_UP', lalamoveOrderId: `LLM-${Date.now()}` } });

    expect((await setStatus(order.id, OrderStatus.DELIVERED)).status).toBe(200);

    expect((await prisma.delivery.findUniqueOrThrow({ where: { id: delivery.id } })).deliveryStatus).toBe('PICKED_UP');
  });

  it('other status changes leave the payment pending', async () => {
    const customer = await createCustomer();
    const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.PENDING });
    const payment = await createTestPayment({ orderId: order.id, status: PaymentStatus.PENDING });

    expect((await setStatus(order.id, OrderStatus.SHIPPED)).status).toBe(200);

    expect((await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } })).status).toBe(PaymentStatus.PENDING);
  });
});
