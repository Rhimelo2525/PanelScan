import { DeliveryApprovalStatus, NotificationType, OrderStatus, PaymentStatus } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import { createCustomer, createModerator, createOwner, createTestOrder } from '../helpers/factories';
import app from '../helpers/testApp';

const expectApiSuccess = (response: request.Response, status: number, message?: string): void => {
  expect(response.status).toBe(status);
  expect(response.body.success).toBe(true);
  if (message) {
    expect(response.body.message).toBe(message);
  }
};

const expectApiError = (response: request.Response, status: number, messageMatch?: string | RegExp): void => {
  expect(response.status).toBe(status);
  expect(response.body.success).toBe(false);
  if (messageMatch) {
    expect(response.body.message).toMatch(messageMatch);
  }
};

describe('Delivery Coordination Approval Flow', () => {
  // ================================================================
  // TEST 1: Initial state - No delivery request
  // ================================================================
  it('TEST 1: Customer order starts with no delivery request', async () => {
    const customer = await createCustomer();
    const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.PROCESSING });

    const response = await request(app)
      .get(`/api/orders/${order.id}`)
      .set('Authorization', `Bearer ${customer.token}`);

    expectApiSuccess(response, 200);
    expect(response.body.data.order.delivery).toBeNull();
  });

  // ================================================================
  // TEST 2: Customer requests delivery -> Stored as PENDING_APPROVAL
  // ================================================================
  it('TEST 2: Customer requests delivery, stored as PENDING_APPROVAL', async () => {
    const customer = await createCustomer();
    const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.PROCESSING });

    const response = await request(app)
      .post(`/api/delivery/orders/${order.id}/request`)
      .set('Authorization', `Bearer ${customer.token}`);

    expectApiSuccess(response, 200, 'Delivery request submitted successfully.');
    expect(response.body.data.delivery.approvalStatus).toBe(DeliveryApprovalStatus.PENDING_APPROVAL);
    expect(response.body.data.delivery.requestedAt).toBeTruthy();
    expect(response.body.data.delivery.deliveryStatus).toBe('NOT_SCHEDULED');

    // Verify in database
    const dbDelivery = await prisma.delivery.findUnique({ where: { orderId: order.id } });
    expect(dbDelivery).not.toBeNull();
    expect(dbDelivery?.approvalStatus).toBe(DeliveryApprovalStatus.PENDING_APPROVAL);
    expect(dbDelivery?.requestedAt).not.toBeNull();

    // Duplicate request returns 409
    const duplicate = await request(app)
      .post(`/api/delivery/orders/${order.id}/request`)
      .set('Authorization', `Bearer ${customer.token}`);
    expectApiError(duplicate, 409, /already awaiting approval/i);
  });

  // ================================================================
  // TEST 3: Customer attempts to proceed while Pending -> Blocked by backend
  // ================================================================
  it('TEST 3: Customer cannot proceed with delivery while request is PENDING_APPROVAL', async () => {
    const customer = await createCustomer();
    const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.PROCESSING });

    // Request delivery
    await request(app)
      .post(`/api/delivery/orders/${order.id}/request`)
      .set('Authorization', `Bearer ${customer.token}`);

    // Try to proceed before moderator approval
    const proceedResponse = await request(app)
      .post(`/api/delivery/orders/${order.id}/proceed`)
      .set('Authorization', `Bearer ${customer.token}`);

    expectApiError(proceedResponse, 400, /Delivery request must be approved/i);
  });

  // ================================================================
  // TEST 4: Moderator sees delivery request in reports with customer and address
  // ================================================================
  it('TEST 4: Moderator sees pending delivery request in sales report', async () => {
    const moderator = await createModerator();
    const customer = await createCustomer();
    const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.PROCESSING });

    await request(app)
      .post(`/api/delivery/orders/${order.id}/request`)
      .set('Authorization', `Bearer ${customer.token}`);

    const reportResponse = await request(app)
      .get('/api/reports/sales')
      .set('Authorization', `Bearer ${moderator.token}`);

    expectApiSuccess(reportResponse, 200);
    const row = reportResponse.body.data.orders.find((o: { id: string }) => o.id === order.id);
    expect(row).toBeDefined();
    expect(row.deliveryApprovalStatus).toBe(DeliveryApprovalStatus.PENDING_APPROVAL);
    expect(row.customerName).toBe(`${customer.user.firstName} ${customer.user.lastName}`);
    expect(row.orderNumber).toBe(order.orderNumber);
    expect(row.shippingAddress).toBe(order.shippingAddress);
    expect(row.deliveryRequestedAt).toBeTruthy();
  });

  // ================================================================
  // TEST 5: Moderator accepts -> Status becomes APPROVED, no booking created
  // ================================================================
  it('TEST 5: Moderator accepts delivery request, stores approval metadata without auto-booking', async () => {
    const moderator = await createModerator();
    const customer = await createCustomer();
    const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.PROCESSING });

    await request(app)
      .post(`/api/delivery/orders/${order.id}/request`)
      .set('Authorization', `Bearer ${customer.token}`);

    const approveResponse = await request(app)
      .patch(`/api/delivery/orders/${order.id}/approve`)
      .set('Authorization', `Bearer ${moderator.token}`);

    expectApiSuccess(approveResponse, 200, 'Delivery request approved successfully.');
    expect(approveResponse.body.data.delivery.approvalStatus).toBe(DeliveryApprovalStatus.APPROVED);
    expect(approveResponse.body.data.delivery.approvedAt).toBeTruthy();
    expect(approveResponse.body.data.delivery.approvedById).toBe(moderator.user.id);

    // Verify in database: NO automatic Lalamove booking
    const dbDelivery = await prisma.delivery.findUnique({ where: { orderId: order.id } });
    expect(dbDelivery?.approvalStatus).toBe(DeliveryApprovalStatus.APPROVED);
    expect(dbDelivery?.approvedById).toBe(moderator.user.id);
    expect(dbDelivery?.deliveryStatus).toBe('NOT_SCHEDULED');
    expect(dbDelivery?.trackingNumber).toBeNull();
  });

  // ================================================================
  // TEST 6: Customer refreshes order -> Approved state persists
  // ================================================================
  it('TEST 6: Customer refreshes order and sees persistent APPROVED delivery status', async () => {
    const moderator = await createModerator();
    const customer = await createCustomer();
    const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.PROCESSING });

    await request(app)
      .post(`/api/delivery/orders/${order.id}/request`)
      .set('Authorization', `Bearer ${customer.token}`);

    await request(app)
      .patch(`/api/delivery/orders/${order.id}/approve`)
      .set('Authorization', `Bearer ${moderator.token}`);

    const fetchResponse = await request(app)
      .get(`/api/orders/${order.id}`)
      .set('Authorization', `Bearer ${customer.token}`);

    expectApiSuccess(fetchResponse, 200);
    expect(fetchResponse.body.data.order.delivery.approvalStatus).toBe(DeliveryApprovalStatus.APPROVED);
  });

  // ================================================================
  // TEST 7: Customer proceeds after approval -> Proceed endpoint succeeds
  // ================================================================
  it('TEST 7: Customer can successfully proceed with delivery once approved', async () => {
    const moderator = await createModerator();
    const customer = await createCustomer();
    const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.PROCESSING });

    await request(app)
      .post(`/api/delivery/orders/${order.id}/request`)
      .set('Authorization', `Bearer ${customer.token}`);

    await request(app)
      .patch(`/api/delivery/orders/${order.id}/approve`)
      .set('Authorization', `Bearer ${moderator.token}`);

    const proceedResponse = await request(app)
      .post(`/api/delivery/orders/${order.id}/proceed`)
      .set('Authorization', `Bearer ${customer.token}`);

    expectApiSuccess(proceedResponse, 200);
    expect(proceedResponse.body.data.success).toBe(true);
    expect(proceedResponse.body.data.delivery.approvalStatus).toBe(DeliveryApprovalStatus.APPROVED);
  });

  // ================================================================
  // TEST 8: Moderator declines with reason -> Customer blocked, can re-request
  // ================================================================
  it('TEST 8: Moderator declines request with reason; customer cannot proceed but can re-request', async () => {
    const moderator = await createModerator();
    const customer = await createCustomer();
    const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.PROCESSING });

    await request(app)
      .post(`/api/delivery/orders/${order.id}/request`)
      .set('Authorization', `Bearer ${customer.token}`);

    const declineReason = 'Please update street number and landmark in your shipping address.';
    const declineResponse = await request(app)
      .patch(`/api/delivery/orders/${order.id}/decline`)
      .set('Authorization', `Bearer ${moderator.token}`)
      .send({ reason: declineReason });

    expectApiSuccess(declineResponse, 200, 'Delivery request declined successfully.');
    expect(declineResponse.body.data.delivery.approvalStatus).toBe(DeliveryApprovalStatus.DECLINED);
    expect(declineResponse.body.data.delivery.declineReason).toBe(declineReason);
    expect(declineResponse.body.data.delivery.declinedAt).toBeTruthy();

    // Customer cannot proceed
    const proceedBlocked = await request(app)
      .post(`/api/delivery/orders/${order.id}/proceed`)
      .set('Authorization', `Bearer ${customer.token}`);
    expectApiError(proceedBlocked, 400, /Delivery request must be approved/i);

    // Customer re-requests delivery
    const reRequestResponse = await request(app)
      .post(`/api/delivery/orders/${order.id}/request`)
      .set('Authorization', `Bearer ${customer.token}`);

    expectApiSuccess(reRequestResponse, 200, 'Delivery request submitted successfully.');
    expect(reRequestResponse.body.data.delivery.approvalStatus).toBe(DeliveryApprovalStatus.PENDING_APPROVAL);
    expect(reRequestResponse.body.data.delivery.declineReason).toBeNull();
  });

  // ================================================================
  // TEST 9: Cross-customer isolation (Customer B cannot touch Customer A's order)
  // ================================================================
  it('TEST 9: Customer B cannot request or proceed with delivery for Customer A order', async () => {
    const customerA = await createCustomer();
    const customerB = await createCustomer();
    const orderA = await createTestOrder({ customerId: customerA.user.id, status: OrderStatus.PROCESSING });

    // Customer B attempts to request delivery on Customer A's order
    const crossRequest = await request(app)
      .post(`/api/delivery/orders/${orderA.id}/request`)
      .set('Authorization', `Bearer ${customerB.token}`);
    expectApiError(crossRequest, 403);

    // Customer B attempts to proceed with delivery on Customer A's order
    const crossProceed = await request(app)
      .post(`/api/delivery/orders/${orderA.id}/proceed`)
      .set('Authorization', `Bearer ${customerB.token}`);
    expectApiError(crossProceed, 403);
  });

  // ================================================================
  // TEST 10: Non-moderator cannot approve or decline requests
  // ================================================================
  it('TEST 10: Customers cannot approve or decline delivery requests', async () => {
    const customer = await createCustomer();
    const order = await createTestOrder({ customerId: customer.user.id, status: OrderStatus.PROCESSING });

    await request(app)
      .post(`/api/delivery/orders/${order.id}/request`)
      .set('Authorization', `Bearer ${customer.token}`);

    // Customer tries to approve own delivery request
    const customerApprove = await request(app)
      .patch(`/api/delivery/orders/${order.id}/approve`)
      .set('Authorization', `Bearer ${customer.token}`);
    expectApiError(customerApprove, 403);

    // Customer tries to decline own delivery request
    const customerDecline = await request(app)
      .patch(`/api/delivery/orders/${order.id}/decline`)
      .set('Authorization', `Bearer ${customer.token}`);
    expectApiError(customerDecline, 403);
  });

  // ================================================================
  // TEST 11: Delivery arrange action blocked without delivery approval
  // ================================================================
  it('TEST 11: arrangeDeliveryForOrder endpoint requires delivery approval', async () => {
    const moderator = await createModerator();
    const customer = await createCustomer();
    const order = await createTestOrder({
      customerId: customer.user.id,
      status: OrderStatus.PROCESSING,
      moderatorApproved: true,
    });

    // Create payment in PAID state
    await prisma.payment.create({
      data: {
        orderId: order.id,
        amount: order.totalAmount,
        method: 'GCASH',
        status: PaymentStatus.PAID,
        paidAt: new Date(),
      },
    });

    // Create delivery in PENDING_APPROVAL
    await prisma.delivery.create({
      data: {
        orderId: order.id,
        address: order.shippingAddress,
        approvalStatus: DeliveryApprovalStatus.PENDING_APPROVAL,
      },
    });

    // Attempt to arrange delivery while pending
    const arrangeBlocked = await request(app)
      .post(`/api/delivery/orders/${order.id}/arrange`)
      .set('Authorization', `Bearer ${moderator.token}`);
    expectApiError(arrangeBlocked, 400, /Delivery request must be approved/i);

    // Approve delivery
    await prisma.delivery.update({
      where: { orderId: order.id },
      data: { approvalStatus: DeliveryApprovalStatus.APPROVED },
    });

    // Now arrange delivery succeeds
    const arrangeSuccess = await request(app)
      .post(`/api/delivery/orders/${order.id}/arrange`)
      .set('Authorization', `Bearer ${moderator.token}`);
    expectApiSuccess(arrangeSuccess, 200, 'Delivery arranged successfully.');
  });

  // ================================================================
  // TEST 12: Existing Payment approval flow continues to work
  // ================================================================
  it('TEST 12: Payment approval flow works as expected and is not broken by delivery changes', async () => {
    const moderator = await createModerator();
    const customer = await createCustomer();
    const order = await createTestOrder({
      customerId: customer.user.id,
      status: OrderStatus.PENDING,
      moderatorApproved: false,
    });

    // Moderator approves order for payment
    const approveResponse = await request(app)
      .patch(`/api/orders/${order.id}/approve`)
      .set('Authorization', `Bearer ${moderator.token}`);

    expectApiSuccess(approveResponse, 200, 'Order approved successfully.');
    expect(approveResponse.body.data.order.moderatorApproved).toBe(true);

    // Verify in database
    const dbOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(dbOrder?.moderatorApproved).toBe(true);
  });
});
