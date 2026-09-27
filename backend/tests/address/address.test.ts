import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import { addCartItem, createCustomer, createModerator, createTestCart, createTestProduct } from '../helpers/factories';
import app from '../helpers/testApp';

// Real PSGC codes (City of Malolos, Bulacan) - saved addresses are validated
// against the same official hierarchy and delivery coverage as checkout.
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
const OFFICE = { ...HOME, label: 'Office', addressLine1: 'McArthur Highway', barangayCode: '0301410002', barangayName: 'Atlag', latitude: 14.8527, longitude: 120.8160 };

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const saveAddress = async (token: string, body: Record<string, unknown>) => {
  const response = await request(app).post('/api/addresses').set(auth(token)).send(body);
  expect(response.status).toBe(201);
  return response.body.data.address as { id: string; isDefault: boolean; latitude: number; longitude: number; formattedAddress: string };
};

describe('Saved shipping addresses', () => {
  it('saves an address with its pinned coordinates and a normalized phone (acceptance test 1)', async () => {
    const { token, user } = await createCustomer();
    const address = await saveAddress(token, HOME);

    const row = await prisma.customerAddress.findUniqueOrThrow({ where: { id: address.id } });
    expect(row.customerId).toBe(user.id);
    expect(row.latitude).toBe(HOME.latitude);
    expect(row.longitude).toBe(HOME.longitude);
    expect(row.recipientPhone).toBe('+639171234567');
    expect(row.formattedAddress).toBe('219 Talisay Street, Santo Niño, City of Malolos, Bulacan 3000, Philippines');
    expect(row.isDefault).toBe(true); // the first address is always the default
  });

  it('refuses to save an address without a map pin', async () => {
    const { token } = await createCustomer();
    const { latitude: _lat, longitude: _lng, ...withoutPin } = HOME;
    const response = await request(app).post('/api/addresses').set(auth(token)).send(withoutPin);
    expect(response.status).toBe(400);
    expect(await prisma.customerAddress.count()).toBe(0);
  });

  it('rejects a barangay that does not belong to the selected city', async () => {
    const { token } = await createCustomer();
    const response = await request(app).post('/api/addresses').set(auth(token)).send({ ...HOME, barangayCode: '0301420060', barangayName: 'Muzon East' });
    expect(response.status).toBe(400);
  });

  it('keeps several addresses with exactly one default (acceptance tests 2-3)', async () => {
    const { token } = await createCustomer();
    const home = await saveAddress(token, HOME);
    const office = await saveAddress(token, OFFICE);
    expect(office.isDefault).toBe(false);

    const list = await request(app).get('/api/addresses').set(auth(token));
    expect(list.body.data.addresses.map((a: { label: string }) => a.label)).toEqual(['Home', 'Office']);

    const setDefault = await request(app).patch(`/api/addresses/${office.id}/default`).set(auth(token));
    expect(setDefault.status).toBe(200);
    const defaults = await prisma.customerAddress.findMany({ where: { isDefault: true } });
    expect(defaults.map((a) => a.id)).toEqual([office.id]);

    // Deleting the default promotes the remaining address.
    await request(app).delete(`/api/addresses/${office.id}`).set(auth(token)).expect(200);
    expect((await prisma.customerAddress.findUniqueOrThrow({ where: { id: home.id } })).isDefault).toBe(true);
  });

  it("never exposes or changes another customer's address", async () => {
    const owner = await createCustomer();
    const other = await createCustomer();
    const address = await saveAddress(owner.token, HOME);

    expect((await request(app).get('/api/addresses').set(auth(other.token))).body.data.addresses).toHaveLength(0);
    expect((await request(app).put(`/api/addresses/${address.id}`).set(auth(other.token)).send(OFFICE)).status).toBe(404);
    expect((await request(app).delete(`/api/addresses/${address.id}`).set(auth(other.token))).status).toBe(404);
  });

  it('is customer-only', async () => {
    const moderator = await createModerator();
    expect((await request(app).get('/api/addresses').set(auth(moderator.token))).status).toBe(403);
  });

  it('keeps the pin even when no geocoder is configured', async () => {
    const { token } = await createCustomer();
    const response = await request(app).get('/api/addresses/reverse-geocode').query({ latitude: 14.8433, longitude: 120.8114 }).set(auth(token));
    expect(response.status).toBe(200);
    expect(response.body.data.suggestion).toMatchObject({ latitude: 14.8433, longitude: 120.8114, status: 'unavailable' });
  });

  it('snapshots the chosen address into the order, unaffected by later edits and deletes (acceptance tests 5, 7, 8, 9, 11)', async () => {
    const customer = await createCustomer();
    const moderator = await createModerator();
    const home = await saveAddress(customer.token, HOME);
    const product = await createTestProduct({ withInventory: true, quantity: 20 });
    const cart = await createTestCart(customer.user.id);
    await addCartItem(cart.id, product.id, 1);

    const placed = await request(app).post('/api/orders').set(auth(customer.token)).send({ addressId: home.id });
    expect(placed.status).toBe(201);
    const orderId = placed.body.data.order.id as string;

    const order = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    const snapshot = order.deliveryLocation as Record<string, unknown>;
    expect(order.shippingAddress).toBe(home.formattedAddress);
    expect(snapshot).toMatchObject({
      latitude: HOME.latitude,
      longitude: HOME.longitude,
      recipientName: 'Maria Santos',
      recipientPhone: '+639171234567',
      barangayCode: HOME.barangayCode,
      geocodingStatus: 'completed',
      geocodingProvider: 'customer-pin',
      savedAddressId: home.id,
    });

    // Edit the saved address (new pin), then delete it - the order keeps what it was placed with.
    const edited = await request(app).put(`/api/addresses/${home.id}`).set(auth(customer.token)).send(OFFICE);
    expect(edited.status).toBe(200);
    expect(edited.body.data.address.latitude).toBe(OFFICE.latitude);
    await request(app).delete(`/api/addresses/${home.id}`).set(auth(customer.token)).expect(200);

    const after = await prisma.order.findUniqueOrThrow({ where: { id: orderId } });
    expect(after.shippingAddress).toBe(order.shippingAddress);
    expect(after.deliveryLocation).toEqual(order.deliveryLocation);

    // The moderator's order view carries the order's own coordinates.
    const report = await request(app).get('/api/reports/orders').set(auth(moderator.token));
    const row = (report.body.data.orders as Array<Record<string, unknown>>).find((o) => o.id === orderId);
    expect(row).toMatchObject({ deliveryLatitude: HOME.latitude, deliveryLongitude: HOME.longitude, recipientName: 'Maria Santos' });
  });

  it("refuses an order for someone else's saved address", async () => {
    const owner = await createCustomer();
    const thief = await createCustomer();
    const address = await saveAddress(owner.token, HOME);
    const product = await createTestProduct({ withInventory: true });
    const cart = await createTestCart(thief.user.id);
    await addCartItem(cart.id, product.id, 1);

    const response = await request(app).post('/api/orders').set(auth(thief.token)).send({ addressId: address.id });
    expect(response.status).toBe(400);
    expect(await prisma.order.count()).toBe(0);
  });
});
