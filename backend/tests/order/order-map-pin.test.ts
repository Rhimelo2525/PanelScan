import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { prisma } from '../../src/config/database';
import { createCustomer, createTestCart, createTestProduct, addCartItem } from '../helpers/factories';
import app from '../helpers/testApp';

/**
 * Covers the customer's confirmed map-pin path added on top of the
 * existing forward-geocoding flow (see order-geocoding.test.ts for that
 * half, which this file leaves untouched and unaffected). MAPBOX_ACCESS_TOKEN
 * and BACKUP_DATABASE_URL are both deliberately unset in .env.test (see
 * tests/setupEnv.ts / order-geocoding.test.ts's own comment) - exactly the
 * conditions needed here: a confirmed pin must never call the geocoder at
 * all, and an unconfigured backup database is this suite's natural,
 * zero-mocking way to exercise the "backup sync failed" path.
 */

const DELIVERY_LOCATION_BASE = {
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
};

const CONFIRMED_PIN = { latitude: 14.8123, longitude: 121.0456 };

const checkoutWithDeliveryLocation = async (customerId: string, token: string, deliveryLocation: Record<string, unknown>) => {
  const product = await createTestProduct({ withInventory: true, quantity: 10, price: 500 });
  const cart = await createTestCart(customerId);
  await addCartItem(cart.id, product.id, 1);

  return request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ deliveryLocation, selectedProductIds: [product.id] });
};

describe('Checkout - customer map-pin location', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("saves the customer's exact confirmed pin directly, without ever calling the geocoder", async () => {
    const { user, token } = await createCustomer();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const response = await checkoutWithDeliveryLocation(user.id, token, { ...DELIVERY_LOCATION_BASE, ...CONFIRMED_PIN });

    expect(response.status).toBe(201);
    const location = response.body.data.order.deliveryLocation;
    expect(location).toMatchObject({
      latitude: CONFIRMED_PIN.latitude,
      longitude: CONFIRMED_PIN.longitude,
      geocodingStatus: 'completed',
      geocodingProvider: 'customer-pin',
      geocodingPlaceId: null,
    });
    expect(fetchSpy).not.toHaveBeenCalled(); // no forward-geocoding call - the pin is trusted directly
  });

  it('rejects a pin outside the Philippines with 400, and creates no order', async () => {
    const { user, token } = await createCustomer();

    const response = await checkoutWithDeliveryLocation(user.id, token, { ...DELIVERY_LOCATION_BASE, latitude: 40.7128, longitude: -74.006 }); // New York

    expect(response.status).toBe(400);
    const order = await prisma.order.findFirst({ where: { customerId: user.id } });
    expect(order).toBeNull();
  });

  it('leaves the existing no-pin behavior completely unchanged (still pending, still no geocoder call without a token)', async () => {
    const { user, token } = await createCustomer();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const response = await checkoutWithDeliveryLocation(user.id, token, DELIVERY_LOCATION_BASE);

    expect(response.status).toBe(201);
    const location = response.body.data.order.deliveryLocation;
    expect(location.latitude).toBeNull();
    expect(location.longitude).toBeNull();
    expect(location.geocodingStatus).toBe('pending');
    expect(location.geocodingProvider).toBeNull();
  });

  describe('Backup database synchronization', () => {
    it('logs BACKUP_SYNC_FAILED (main order still created) when the backup database is not configured', async () => {
      const { user, token } = await createCustomer();

      const response = await checkoutWithDeliveryLocation(user.id, token, { ...DELIVERY_LOCATION_BASE, ...CONFIRMED_PIN });

      expect(response.status).toBe(201); // main database write is never rolled back for a backup failure
      const orderId = response.body.data.order.id as string;

      const logs = await prisma.activityLog.findMany({ where: { action: 'BACKUP_SYNC_FAILED' } });
      const matching = logs.filter((log) => (log.metadata as { id?: string } | null)?.id === orderId);
      expect(matching).toHaveLength(1);
      expect((matching[0]?.metadata as { model?: string })?.model).toBe('order');
    });

    it('does not attempt a backup sync (and logs no failure) for an order with no delivery location at all', async () => {
      const { user, token } = await createCustomer();
      const product = await createTestProduct({ withInventory: true, quantity: 10, price: 500 });
      const cart = await createTestCart(user.id);
      await addCartItem(cart.id, product.id, 1);

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ shippingAddress: '123 Legacy Free-Text Address, Some City, Philippines', selectedProductIds: [product.id] });

      expect(response.status).toBe(201);
      const orderId = response.body.data.order.id as string;

      const logs = await prisma.activityLog.findMany({ where: { action: 'BACKUP_SYNC_FAILED' } });
      const matching = logs.filter((log) => (log.metadata as { id?: string } | null)?.id === orderId);
      expect(matching).toHaveLength(0);
    });
  });
});
