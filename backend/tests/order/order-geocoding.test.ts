import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { env } from '../../src/config/env';
import { createCustomer, createTestCart, createTestProduct, addCartItem } from '../helpers/factories';
import app from '../helpers/testApp';

// MAPBOX_ACCESS_TOKEN is deliberately unset in .env.test (see the comment
// there) so the rest of the suite - including delivery-address.test.ts's own
// "Geocoding Safety" test - keeps seeing the real "not configured" pending
// behavior. `env` is a plain mutable object (not frozen), so this file sets
// the token only for its own tests and restores it afterward, rather than
// changing the shared test environment for every other file in the run.
const originalAccessToken = env.MAPBOX_ACCESS_TOKEN;
beforeEach(() => { env.MAPBOX_ACCESS_TOKEN = 'fake-test-token-for-testing-only'; });
afterEach(() => {
  env.MAPBOX_ACCESS_TOKEN = originalAccessToken;
  vi.unstubAllGlobals();
});

// A real, PSGC-valid Bulacan -> CSJDM -> Tungkong Mangga hierarchy (see
// tests/delivery/delivery-address.test.ts, which validates the same codes).
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
};

const mapboxResponse = (accuracy: string) => ({
  ok: true,
  json: async () => ({ features: [{ properties: { mapbox_id: 'place_abc', coordinates: { latitude: 14.812, longitude: 121.045, accuracy } } }] }),
});

const checkoutWithDeliveryLocation = async (customerId: string, token: string) => {
  const product = await createTestProduct({ withInventory: true, quantity: 10, price: 500 });
  const cart = await createTestCart(customerId);
  await addCartItem(cart.id, product.id, 1);

  return request(app)
    .post('/api/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({ deliveryLocation: DELIVERY_LOCATION, selectedProductIds: [product.id] });
};

describe('Checkout geocoding integration', () => {
  it('stores real geocoded coordinates on the order when Mapbox returns a precise match', async () => {
    const { user, token } = await createCustomer();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mapboxResponse('rooftop')));

    const response = await checkoutWithDeliveryLocation(user.id, token);

    expect(response.status).toBe(201);
    const location = response.body.data.order.deliveryLocation;
    expect(location).toMatchObject({ latitude: 14.812, longitude: 121.045, geocodingStatus: 'completed', geocodingProvider: 'mapbox', geocodingPlaceId: 'place_abc' });
  });

  it("refuses an imprecise (approximate) match - never substitutes a city/barangay centroid as the customer's actual delivery point", async () => {
    const { user, token } = await createCustomer();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mapboxResponse('approximate')));

    const response = await checkoutWithDeliveryLocation(user.id, token);

    expect(response.status).toBe(201);
    const location = response.body.data.order.deliveryLocation;
    expect(location.latitude).toBeNull();
    expect(location.longitude).toBeNull();
    expect(location.geocodingStatus).toBe('failed');
  });

  it('never blocks checkout when geocoding fails outright (network error) - the order is still created with coordinates left for manual entry', async () => {
    const { user, token } = await createCustomer();
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));

    const response = await checkoutWithDeliveryLocation(user.id, token);

    expect(response.status).toBe(201);
    const location = response.body.data.order.deliveryLocation;
    expect(location.latitude).toBeNull();
    expect(location.geocodingStatus).toBe('failed');
  });

  it('formats the address and normalizes the phone exactly as before, in addition to the new coordinates', async () => {
    const { user, token } = await createCustomer();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mapboxResponse('rooftop')));

    const response = await checkoutWithDeliveryLocation(user.id, token);

    const order = response.body.data.order;
    expect(order.shippingAddress).toBe('1 M. Villarica Rd, Tungkong Mangga, City of San Jose del Monte, Bulacan 3023, Philippines');
    expect(order.deliveryLocation.recipientPhone).toBe('+639171112222');
  });
});
