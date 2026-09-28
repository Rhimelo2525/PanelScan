import { createHmac } from 'node:crypto';

import { DeliveryApprovalStatus, OrderStatus, PaymentStatus } from '@prisma/client';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '../../src/config/database';
import { lalamoveProvider } from '../../src/modules/delivery/providers/lalamove.provider';
import { syncRecordToBackup } from '../../src/utils/backupSync';
import { addCartItem, authHeader, createCustomer, createModerator, createOwner, createTestCart, createTestProduct } from '../helpers/factories';
import app from '../helpers/testApp';

/**
 * The order-driven delivery workflow, end to end, through the real routes:
 *   checkout (delivery record created with the order) -> moderator approves
 *   -> moderator quotes shipping (the fee joins the order total) -> customer
 *   pays products + shipping in ONE PayMongo GCash payment -> PayMongo
 *   webhook confirms -> moderator books Lalamove -> customer tracks.
 * Lalamove and PayMongo's HTTP API are mocked, and so is the backup
 * database write (to capture what is synchronized); routes, role checks,
 * the main database and notifications are real.
 */

vi.mock('../../src/modules/delivery/providers/lalamove.provider', () => ({
  lalamoveProvider: {
    getAvailableServices: vi.fn(),
    getQuotation: vi.fn(),
    placeDeliveryOrder: vi.fn(),
    getOrder: vi.fn(),
    getDriverDetails: vi.fn(),
    cancelOrder: vi.fn(),
  },
}));

vi.mock('../../src/utils/backupSync', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/utils/backupSync')>()),
  syncRecordToBackup: vi.fn(),
}));

const mockProvider = lalamoveProvider as unknown as Record<'getAvailableServices' | 'getQuotation' | 'placeDeliveryOrder' | 'getOrder' | 'getDriverDetails' | 'cancelOrder', ReturnType<typeof vi.fn>>;
const mockBackupSync = syncRecordToBackup as unknown as ReturnType<typeof vi.fn>;

const WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET ?? 'whsec_fake_test_secret_for_testing_only';

const DELIVERY_LOCATION = {
  addressLine1: '1 M. Villarica Rd',
  regionCode: '030000000',
  regionName: 'Region III',
  provinceCode: '031400000',
  provinceName: 'Bulacan',
  cityMunicipalityCode: '031420000',
  cityMunicipalityName: 'City of San Jose del Monte',
  barangayCode: '031420042',
  barangayName: 'Tungkong Mangga',
  postalCode: '3023',
  recipientName: 'Maria Santos',
  recipientPhone: '09171112222',
  latitude: 14.8123,
  longitude: 121.0456,
};

const SEDAN = { key: 'SEDAN', description: 'Sedan', maxWeightKg: 200, dimensionsMeters: null };
const VAN = { key: 'VAN', description: 'L300 / Cargo Van', maxWeightKg: 1000, dimensionsMeters: null };

const quotation = (amount: number, serviceType = 'SEDAN') => ({
  quotationId: `quo_${serviceType}_${amount}`,
  quotedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  amount,
  currency: 'PHP',
  serviceType,
  distanceMeters: 5000,
  stops: [
    { stopId: 'stop_pickup', coordinates: { lat: '14.8136', lng: '121.0450' }, address: 'Warehouse' },
    { stopId: 'stop_dropoff', coordinates: { lat: '14.8123', lng: '121.0456' }, address: 'Customer' },
  ],
});

const expectOk = (response: request.Response, status = 200): void => {
  expect(response.status, JSON.stringify(response.body)).toBe(status);
  expect(response.body.success).toBe(true);
};

const expectError = (response: request.Response, status: number, message?: RegExp): void => {
  expect(response.status, JSON.stringify(response.body)).toBe(status);
  expect(response.body.success).toBe(false);
  if (message) expect(response.body.message).toMatch(message);
};

const titlesFor = async (userId: string): Promise<string[]> => (await prisma.notification.findMany({ where: { userId } })).map((notification) => notification.title);

/** PayMongo's checkout-session API, answering every call with a fresh session and recording the request bodies. */
function mockPaymongoCheckout() {
  const fetchSpy = vi.fn(async (_url: string, init?: { body?: string }) => ({
    ok: true,
    json: async () => ({ data: { id: `cs_test_${fetchSpy.mock.calls.length}`, type: 'checkout_session', attributes: { checkout_url: 'https://checkout.paymongo.com/cs_test', status: 'active', reference_number: init?.body } } }),
  }));
  vi.stubGlobal('fetch', fetchSpy);
  return fetchSpy;
}

const paymongoRequests = (fetchSpy: ReturnType<typeof vi.fn>) =>
  fetchSpy.mock.calls.map(([url, init]) => ({ url: url as string, body: JSON.parse((init as { body: string }).body) as { data: { attributes: { line_items: { amount: number; name: string }[]; payment_method_types: string[]; reference_number: string } } } }));

function paidWebhook(orderId: string, amountCentavos: number, paymentId = `pay_${Date.now()}`) {
  const rawBody = JSON.stringify({
    data: { id: `evt_${Date.now()}`, type: 'event', attributes: { type: 'payment.paid', livemode: false, data: { id: paymentId, type: 'payment', attributes: { reference_number: orderId, amount: amountCentavos } } } },
  });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac('sha256', WEBHOOK_SECRET).update(`${timestamp}.${rawBody}`).digest('hex');
  return request(app).post('/api/payments/webhook').set('Content-Type', 'application/json').set('Paymongo-Signature', `t=${timestamp},li=${signature},te=${signature}`).send(rawBody);
}

interface Actors {
  customer: Awaited<ReturnType<typeof createCustomer>>;
  moderator: Awaited<ReturnType<typeof createModerator>>;
  owner: Awaited<ReturnType<typeof createOwner>>;
}

async function actors(): Promise<Actors> {
  return { customer: await createCustomer(), moderator: await createModerator(), owner: await createOwner() };
}

/** TEST 1: the customer checks out one ₱1,500.00 product from their cart. */
async function placeOrder({ customer }: Actors, quantity = 1) {
  const product = await createTestProduct({ withInventory: true, quantity: 10, price: 1500 });
  const cart = await createTestCart(customer.user.id);
  await addCartItem(cart.id, product.id, quantity);
  const response = await request(app).post('/api/orders').set(authHeader(customer.token)).send({ deliveryLocation: DELIVERY_LOCATION, selectedProductIds: [product.id] });
  expectOk(response, 201);
  return { orderId: response.body.data.order.id as string, productId: product.id, response };
}

async function approve(a: Actors, orderId: string) {
  expectOk(await request(app).patch(`/api/orders/${orderId}/approve`).set(authHeader(a.moderator.token)));
}

async function quote(a: Actors, orderId: string, fee = 194, vehicle = SEDAN) {
  mockProvider.getAvailableServices.mockResolvedValue([SEDAN, VAN]);
  mockProvider.getQuotation.mockResolvedValue(quotation(fee, vehicle.key));
  const response = await request(app).post(`/api/delivery/orders/${orderId}/vehicle`).set(authHeader(a.moderator.token)).send({ serviceType: vehicle.key });
  expectOk(response);
  return response;
}

async function pay(a: Actors, orderId: string, amountCentavos = 169400) {
  mockPaymongoCheckout();
  expectOk(await request(app).post('/api/payments/create').set(authHeader(a.customer.token)).send({ orderId }), 201);
  vi.unstubAllGlobals();
  expectOk(await paidWebhook(orderId, amountCentavos));
}

async function book(a: Actors, orderId: string, finalFee = 194) {
  mockProvider.placeDeliveryOrder.mockResolvedValue({ orderId: `llm_${Date.now()}`, status: 'ASSIGNING_DRIVER', shareLink: 'https://share.lalamove.com/?PH_track', priceBreakdown: { total: finalFee, currency: 'PHP' }, driverId: null });
  const response = await request(app).post(`/api/delivery/orders/${orderId}/book`).set(authHeader(a.moderator.token));
  expectOk(response);
  return response;
}

beforeEach(() => {
  for (const fn of Object.values(mockProvider)) fn.mockReset();
  mockBackupSync.mockReset();
  mockBackupSync.mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Order-driven delivery workflow', () => {
  describe('TEST 1 - the delivery request is created with the order', () => {
    it('checkout creates a delivery record waiting for order approval, with no separate customer request', async () => {
      const a = await actors();
      const { orderId, response } = await placeOrder(a);

      const order = response.body.data.order;
      expect(order.status).toBe(OrderStatus.PENDING);
      expect(order.moderatorApproved).toBe(false);
      expect(order.delivery).toMatchObject({ approvalStatus: DeliveryApprovalStatus.PENDING_APPROVAL, deliveryStatus: 'AWAITING_ORDER_APPROVAL', quotedAt: null, lalamoveOrderId: null });
      expect(order.subtotal).toBe('1500');

      // The old customer "request delivery" endpoint is gone.
      expectError(await request(app).post(`/api/delivery/orders/${orderId}/request`).set(authHeader(a.customer.token)), 404);
      // Nothing to pay yet.
      expectError(await request(app).post('/api/payments/create').set(authHeader(a.customer.token)).send({ orderId }), 400, /awaiting moderator approval/i);

      expect(await titlesFor(a.customer.user.id)).toContain('Order submitted');
      expect(await titlesFor(a.moderator.user.id)).toContain('New order received');
      expect(await titlesFor(a.owner.user.id)).toContain('New order placed');
    });

    it('keeps cart, stock and order creation working - stock is deducted and the item leaves the cart', async () => {
      const a = await actors();
      const { orderId, productId } = await placeOrder(a, 2);

      expect((await prisma.inventory.findUniqueOrThrow({ where: { productId } })).quantity).toBe(8);
      expect(await prisma.cartItem.count({ where: { productId, cart: { customerId: a.customer.user.id } } })).toBe(0);
      expect(Number((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).subtotal)).toBe(3000);
    });

    it('cancelling the order cancels its unbooked delivery', async () => {
      const a = await actors();
      const { orderId } = await placeOrder(a);

      expectOk(await request(app).patch(`/api/orders/${orderId}/cancel`).set(authHeader(a.customer.token)));

      expect((await prisma.delivery.findUniqueOrThrow({ where: { orderId } })).deliveryStatus).toBe('CANCELED');
    });
  });

  describe('TEST 2 - moderator approval moves the delivery to the shipping-quote stage', () => {
    it('approving the order marks the delivery approved and awaiting a shipping quote; payment stays closed', async () => {
      const a = await actors();
      const { orderId } = await placeOrder(a);

      await approve(a, orderId);

      const delivery = await prisma.delivery.findUniqueOrThrow({ where: { orderId } });
      expect(delivery).toMatchObject({ approvalStatus: DeliveryApprovalStatus.APPROVED, approvedById: a.moderator.user.id, deliveryStatus: 'AWAITING_QUOTE', quotedAt: null });
      expectError(
        await request(app).post('/api/payments/create').set(authHeader(a.customer.token)).send({ orderId }),
        400,
        /We are calculating your delivery fee\. Payment will be available once the estimated shipping fee is ready\./,
      );
      expectError(await request(app).post(`/api/delivery/orders/${orderId}/book`).set(authHeader(a.moderator.token)), 400, /not paid/i);

      const approvedNotice = await prisma.notification.findFirstOrThrow({ where: { userId: a.customer.user.id, title: 'Order approved' } });
      expect(approvedNotice.message).toMatch(/calculating your delivery fee/);
    });

    it('only the moderator can approve; the old delivery approve/decline endpoints are gone', async () => {
      const a = await actors();
      const { orderId } = await placeOrder(a);

      expectError(await request(app).patch(`/api/orders/${orderId}/approve`).set(authHeader(a.owner.token)), 403);
      expectError(await request(app).patch(`/api/orders/${orderId}/approve`).set(authHeader(a.customer.token)), 403);
      expectError(await request(app).patch(`/api/delivery/orders/${orderId}/approve`).set(authHeader(a.moderator.token)), 404);
      expectError(await request(app).patch(`/api/delivery/orders/${orderId}/decline`).set(authHeader(a.moderator.token)), 404);
      expectError(await request(app).post(`/api/delivery/orders/${orderId}/vehicle`).set(authHeader(a.moderator.token)).send({ serviceType: 'SEDAN' }), 400, /approve the order/i);
    });
  });

  describe('TEST 3 - the shipping quote joins the order total', () => {
    it('a ₱194 quote makes the order ₱1,500 + ₱194 = ₱1,694, and tells the customer payment is ready', async () => {
      const a = await actors();
      const { orderId } = await placeOrder(a);
      await approve(a, orderId);

      const response = await quote(a, orderId, 194);

      expect(response.body.data.quotation.amount).toBe(194);
      expect(response.body.data.delivery).toMatchObject({ deliveryStatus: 'AWAITING_PAYMENT', vehicleType: 'SEDAN' });
      expect(response.body.data.delivery.quotedAt).not.toBeNull();

      const seenByCustomer = (await request(app).get(`/api/orders/${orderId}`).set(authHeader(a.customer.token))).body.data.order;
      expect(seenByCustomer).toMatchObject({ subtotal: '1500', shippingFee: '194', totalAmount: '1694' });
      expect(seenByCustomer.delivery.deliveryStatus).toBe('AWAITING_PAYMENT');

      const notice = await prisma.notification.findFirstOrThrow({ where: { userId: a.customer.user.id, title: 'Shipping fee ready - payment required' } });
      expect(notice.message).toContain('₱194.00');
      expect(notice.message).toContain('₱1,694.00');
      expect(await titlesFor(a.owner.user.id)).toContain('Shipping quote ready');
    });

    it('the moderator can re-quote before payment; the total follows the latest quote', async () => {
      const a = await actors();
      const { orderId } = await placeOrder(a);
      await approve(a, orderId);
      await quote(a, orderId, 194);

      await quote(a, orderId, 350, VAN);

      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
      expect(Number(order.shippingFee)).toBe(350);
      expect(Number(order.totalAmount)).toBe(1850);
      expect(await titlesFor(a.customer.user.id)).toContain('Shipping fee updated - payment required');
    });

    it('only the moderator can quote - the customer and owner cannot set the shipping fee', async () => {
      const a = await actors();
      const { orderId } = await placeOrder(a);
      await approve(a, orderId);

      for (const token of [a.customer.token, a.owner.token]) {
        expectError(await request(app).post(`/api/delivery/orders/${orderId}/vehicle`).set(authHeader(token)).send({ serviceType: 'SEDAN' }), 403);
        expectError(await request(app).get('/api/delivery/vehicle-types').set(authHeader(token)), 403);
      }
      expect(mockProvider.getQuotation).not.toHaveBeenCalled();
    });
  });

  describe('TEST 4 - one PayMongo GCash payment for products + shipping', () => {
    it('opens ONE checkout for ₱1,694.00 (₱1,500 products + ₱194 shipping), GCash only, ignoring any amount the browser sends', async () => {
      const a = await actors();
      const { orderId } = await placeOrder(a);
      await approve(a, orderId);
      await quote(a, orderId, 194);
      const fetchSpy = mockPaymongoCheckout();

      const response = await request(app).post('/api/payments/create').set(authHeader(a.customer.token)).send({ orderId, amount: 1, shippingFee: 0 });

      expectOk(response, 201);
      const calls = paymongoRequests(fetchSpy);
      expect(calls).toHaveLength(1);
      expect(calls[0]!.url).toMatch(/\/checkout_sessions$/);
      const attributes = calls[0]!.body.data.attributes;
      expect(attributes.line_items.map((item) => item.amount)).toEqual([150000, 19400]);
      expect(attributes.line_items.reduce((sum, item) => sum + item.amount, 0)).toBe(169400);
      expect(attributes.payment_method_types).toEqual(['gcash']);
      expect(attributes.reference_number).toBe(orderId);

      const payments = await prisma.payment.findMany({ where: { orderId } });
      expect(payments).toHaveLength(1);
      expect(Number(payments[0]!.amount)).toBe(1694);
      expect(payments[0]!.status).toBe(PaymentStatus.PENDING); // opening PayMongo is not paying
      expect(await prisma.deliveryPayment.count({ where: { delivery: { orderId } } })).toBe(0); // no separate shipping charge
    });
  });

  describe('TEST 5 - PayMongo confirmation marks the order paid and ready to book', () => {
    it('the webhook marks the payment PAID, the order PROCESSING and the delivery READY_TO_BOOK, and notifies everyone', async () => {
      const a = await actors();
      const { orderId } = await placeOrder(a);
      await approve(a, orderId);
      await quote(a, orderId, 194);

      await pay(a, orderId, 169400);

      const payment = await prisma.payment.findUniqueOrThrow({ where: { orderId } });
      expect(payment.status).toBe(PaymentStatus.PAID);
      expect(Number(payment.amount)).toBe(1694);
      expect(payment.paidAt).not.toBeNull();
      expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).status).toBe(OrderStatus.PROCESSING);
      expect((await prisma.delivery.findUniqueOrThrow({ where: { orderId } })).deliveryStatus).toBe('READY_TO_BOOK');

      const paidNotice = await prisma.notification.findFirstOrThrow({ where: { userId: a.customer.user.id, title: 'Payment successful' } });
      expect(paidNotice.message).toContain('Your delivery is being prepared.');
      const moderatorNotice = await prisma.notification.findFirstOrThrow({ where: { userId: a.moderator.user.id, title: 'Paid - ready to book' } });
      expect(moderatorNotice.message).toContain('₱1,694.00 incl. ₱194.00 shipping');
      expect(await titlesFor(a.owner.user.id)).toContain('Payment received');

      const list = await request(app).get('/api/delivery?deliveryState=to_book').set(authHeader(a.moderator.token));
      expect(list.body.data.deliveries.map((delivery: { orderId: string }) => delivery.orderId)).toContain(orderId);
    });

    it('a stale checkout paid for a different amount is recorded as paid and flagged to staff', async () => {
      const a = await actors();
      const { orderId } = await placeOrder(a);
      await approve(a, orderId);
      await quote(a, orderId, 194);

      await pay(a, orderId, 150000);

      expect(Number((await prisma.payment.findUniqueOrThrow({ where: { orderId } })).amount)).toBe(1500);
      expect(await titlesFor(a.moderator.user.id)).toContain('Payment amount differs from order total');
    });
  });

  describe('TEST 6 - the moderator selects the vehicle and books Lalamove', () => {
    it('saves the booking id, vehicle, final fee and tracking; the customer paid amount never changes', async () => {
      const a = await actors();
      const { orderId } = await placeOrder(a);
      await approve(a, orderId);
      await quote(a, orderId, 194);
      await pay(a, orderId);

      // After payment, selecting the vehicle only refreshes the quote - the order total stays what was paid.
      await quote(a, orderId, 194);
      expect(Number((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).totalAmount)).toBe(1694);

      const response = await book(a, orderId, 194);

      const delivery = response.body.data.delivery;
      expect(delivery.lalamoveOrderId).toMatch(/^llm_/);
      expect(delivery).toMatchObject({ vehicleType: 'SEDAN', shippingFee: '194', trackingUrl: 'https://share.lalamove.com/?PH_track', deliveryStatus: 'ASSIGNING_DRIVER', deliveryPayment: null });
      expect(await titlesFor(a.customer.user.id)).toContain('Delivery booked');
      expect(await titlesFor(a.moderator.user.id)).not.toContain('Final shipping fee differs from estimate');
    });

    it('a final Lalamove fee different from the paid estimate is saved separately and flagged - the customer is not charged again', async () => {
      const a = await actors();
      const { orderId } = await placeOrder(a);
      await approve(a, orderId);
      await quote(a, orderId, 194);
      await pay(a, orderId);

      await book(a, orderId, 210);

      const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, include: { delivery: true, payment: true } });
      expect(Number(order.shippingFee)).toBe(194); // estimate the customer paid
      expect(Number(order.delivery!.shippingFee)).toBe(210); // final Lalamove fee
      expect(Number(order.payment!.amount)).toBe(1694);
      expect(await prisma.payment.count({ where: { orderId } })).toBe(1);
      const flag = await prisma.notification.findFirstOrThrow({ where: { userId: a.owner.user.id, title: 'Final shipping fee differs from estimate' } });
      expect(flag.message).toContain('not charged again');
    });

    it('refuses to book an unpaid order, and never lets the customer or owner book', async () => {
      const a = await actors();
      const { orderId } = await placeOrder(a);
      await approve(a, orderId);
      await quote(a, orderId, 194);

      expectError(await request(app).post(`/api/delivery/orders/${orderId}/book`).set(authHeader(a.moderator.token)), 400, /not paid/i);
      for (const token of [a.customer.token, a.owner.token]) {
        expectError(await request(app).post(`/api/delivery/orders/${orderId}/book`).set(authHeader(token)), 403);
      }
      expect(mockProvider.placeDeliveryOrder).not.toHaveBeenCalled();
    });
  });

  describe('TEST 7 - the customer sees the whole order', () => {
    it('order details carry subtotal, shipping fee, total paid, payment and delivery status, vehicle, booking id and tracking', async () => {
      const a = await actors();
      const { orderId } = await placeOrder(a);
      await approve(a, orderId);
      await quote(a, orderId, 194);
      await pay(a, orderId);
      await book(a, orderId);

      const order = (await request(app).get(`/api/orders/${orderId}`).set(authHeader(a.customer.token))).body.data.order;
      expect(order).toMatchObject({ subtotal: '1500', shippingFee: '194', totalAmount: '1694' });
      expect(order.delivery).toMatchObject({ vehicleType: 'SEDAN', deliveryStatus: 'ASSIGNING_DRIVER', trackingUrl: 'https://share.lalamove.com/?PH_track' });
      expect(order.delivery.lalamoveOrderId).toMatch(/^llm_/);

      const payments = (await request(app).get('/api/payments').set(authHeader(a.customer.token))).body.data.payments;
      expect(payments.find((payment: { orderId: string }) => payment.orderId === orderId)).toMatchObject({ status: PaymentStatus.PAID, amount: '1694' });
    });
  });

  describe('TEST 8 - the owner views everything and changes nothing', () => {
    it('sees order, customer, items, fees, payment, delivery, vehicle and booking; every change is refused', async () => {
      const a = await actors();
      const { orderId } = await placeOrder(a);
      await approve(a, orderId);
      await quote(a, orderId, 194);
      await pay(a, orderId);
      const booked = (await book(a, orderId)).body.data.delivery;

      const delivery = (await request(app).get(`/api/delivery/${booked.id}`).set(authHeader(a.owner.token))).body.data.delivery;
      expect(delivery.order).toMatchObject({ subtotal: '1500', shippingFee: '194', totalAmount: '1694', payment: { status: PaymentStatus.PAID } });
      expect(delivery.order.items[0]).toMatchObject({ quantity: 1 });
      expect(delivery.order.customer.id).toBe(a.customer.user.id);
      expect(delivery).toMatchObject({ vehicleType: 'SEDAN', shippingFee: '194' });

      const sales = (await request(app).get('/api/reports/sales').set(authHeader(a.owner.token))).body.data.orders;
      expect(sales.find((row: { id: string }) => row.id === orderId)).toMatchObject({ subtotal: 1500, shippingFee: 194, totalAmount: 1694, finalShippingFee: 194, paymentStatus: 'PAID', deliveryVehicleType: 'SEDAN', lalamoveBookingId: booked.lalamoveOrderId });

      const owner = authHeader(a.owner.token);
      expectError(await request(app).patch(`/api/orders/${orderId}/approve`).set(owner), 403);
      expectError(await request(app).patch(`/api/orders/${orderId}/status`).set(owner).send({ status: OrderStatus.SHIPPED }), 403);
      expectError(await request(app).post(`/api/delivery/orders/${orderId}/vehicle`).set(owner).send({ serviceType: 'SEDAN' }), 403);
      expectError(await request(app).post(`/api/delivery/orders/${orderId}/book`).set(owner), 403);
      expectError(await request(app).post(`/api/delivery/${booked.id}/cancel-booking`).set(owner), 403);
      expectError(await request(app).patch(`/api/delivery/${booked.id}`).set(owner).send({ courierName: 'X' }), 403);
      expectError(await request(app).post('/api/payments/create').set(owner).send({ orderId }), 403);
    });
  });

  describe('TEST 9 - the backup database follows every step', () => {
    const synced = (model: string, orderId: string) =>
      mockBackupSync.mock.calls.filter(([name, row]) => name === model && ((row as { orderId?: string; id?: string }).orderId === orderId || (row as { id?: string }).id === orderId)).map(([, row]) => row as Record<string, unknown>);

    it('mirrors order, payment and delivery after creation, approval, quote, payment and booking', async () => {
      const a = await actors();
      const { orderId } = await placeOrder(a);
      expect(synced('delivery', orderId).at(-1)).toMatchObject({ deliveryStatus: 'AWAITING_ORDER_APPROVAL' });
      expect(mockBackupSync.mock.calls.map(([name]) => name)).toEqual(expect.arrayContaining(['user', 'order', 'delivery']));

      await approve(a, orderId);
      expect(synced('delivery', orderId).at(-1)).toMatchObject({ deliveryStatus: 'AWAITING_QUOTE', approvalStatus: DeliveryApprovalStatus.APPROVED });

      await quote(a, orderId, 194);
      const quotedOrder = synced('order', orderId).at(-1)!;
      expect(Number(quotedOrder.shippingFee)).toBe(194);
      expect(Number(quotedOrder.totalAmount)).toBe(1694);
      expect(Number(quotedOrder.subtotal)).toBe(1500);
      expect(synced('delivery', orderId).at(-1)).toMatchObject({ deliveryStatus: 'AWAITING_PAYMENT', vehicleType: 'SEDAN' });

      await pay(a, orderId);
      const payment = synced('payment', orderId).at(-1)!;
      expect(payment).toMatchObject({ status: PaymentStatus.PAID });
      expect(payment.paidAt).toBeInstanceOf(Date);
      expect(payment.transactionRef).toMatch(/^pay_/);
      expect(Number(payment.amount)).toBe(1694);
      expect(synced('delivery', orderId).at(-1)).toMatchObject({ deliveryStatus: 'READY_TO_BOOK' });

      await book(a, orderId);
      const delivery = synced('delivery', orderId).at(-1)!;
      expect(delivery).toMatchObject({ deliveryStatus: 'ASSIGNING_DRIVER', vehicleType: 'SEDAN', trackingUrl: 'https://share.lalamove.com/?PH_track' });
      expect(Number(delivery.shippingFee)).toBe(194);
      expect(delivery.lalamoveOrderId).toMatch(/^llm_/);
      expect(delivery.quotedAt).toBeInstanceOf(Date);
      expect(delivery.createdAt).toBeInstanceOf(Date);
      expect(delivery.updatedAt).toBeInstanceOf(Date);
    });

    it('never fails a workflow step when the backup write fails - it logs BACKUP_SYNC_FAILED instead', async () => {
      const a = await actors();
      const { orderId } = await placeOrder(a);
      mockBackupSync.mockResolvedValue(false);

      await approve(a, orderId);

      expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).moderatorApproved).toBe(true);
      const logs = await prisma.activityLog.findMany({ where: { action: 'BACKUP_SYNC_FAILED' } });
      const matching = logs.filter((log) => (log.metadata as { id?: string } | null)?.id === orderId);
      expect(matching.length).toBeGreaterThan(0);
      expect((matching[0]!.metadata as { reason?: string }).reason).toBe('order approval');
    });
  });
});
