import { OrderStatus, RequestType } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import {
  authHeader,
  createCustomer,
  createModerator,
  createOwner,
  createTestBooking,
  createTestFeedback,
  createTestInstaller,
  createTestOrder,
  createTestRequest,
} from '../helpers/factories';
import app from '../helpers/testApp';

const ids = (rows: Array<{ id: string }>) => rows.map((row) => row.id).sort();

describe('Search on the admin list pages', () => {
  it('installers: by name (every word must match), phone typed with a leading 0, or specialty', async () => {
    const { token } = await createModerator();
    const clarisse = await createTestInstaller({ firstName: 'Clarisse', lastName: 'Labampa', phone: '+639451112233', specialty: 'Ceiling panels' });
    const mario = await createTestInstaller({ firstName: 'Mario', lastName: 'Reyes', phone: '+639187776655', specialty: 'Wall panels' });

    const search = async (term: string) => {
      const response = await request(app).get('/api/installers').set(authHeader(token)).query({ search: term });
      expect(response.status).toBe(200);
      return ids(response.body.data.installers);
    };

    expect(await search('clarisse labampa')).toEqual([clarisse.id]);
    expect(await search('clarisse reyes')).toEqual([]);
    expect(await search('09187')).toEqual([mario.id]);
    expect(await search('ceiling')).toEqual([clarisse.id]);
  });

  it('installation requests: by customer name or address', async () => {
    const { token } = await createModerator();
    const juan = await createCustomer({ firstName: 'Juan', lastName: 'Bautista' });
    const ana = await createCustomer({ firstName: 'Ana', lastName: 'Santos' });
    const juanBooking = await createTestBooking({ customerId: juan.user.id, address: '12 Rizal St, Makati City' });
    const anaBooking = await createTestBooking({ customerId: ana.user.id, address: '5 Mabini Ave, Quezon City' });

    const search = async (term: string) => {
      const response = await request(app).get('/api/bookings/all').set(authHeader(token)).query({ search: term });
      expect(response.status).toBe(200);
      return ids(response.body.data.bookings);
    };

    expect(await search('juan bautista')).toEqual([juanBooking.id]);
    expect(await search('quezon')).toEqual([anaBooking.id]);
  });

  it('feedback: by comment or customer name', async () => {
    const { token } = await createOwner();
    const juan = await createCustomer({ firstName: 'Juan', lastName: 'Bautista' });
    const ana = await createCustomer({ firstName: 'Ana', lastName: 'Santos' });
    const fromJuan = await createTestFeedback({ customerId: juan.user.id, comment: 'Beautiful wood finish' });
    const fromAna = await createTestFeedback({ customerId: ana.user.id, comment: 'Fast installation' });

    const search = async (term: string) => {
      const response = await request(app).get('/api/feedback').set(authHeader(token)).query({ search: term });
      expect(response.status).toBe(200);
      return ids(response.body.data.feedbacks);
    };

    expect(await search('wood')).toEqual([fromJuan.id]);
    expect(await search('ana santos')).toEqual([fromAna.id]);
  });

  it('sales: search by customer or order number, and the status filter now applies; the summary still covers every order', async () => {
    const { token } = await createOwner();
    const juan = await createCustomer({ firstName: 'Juan', lastName: 'Bautista' });
    const ana = await createCustomer({ firstName: 'Ana', lastName: 'Santos' });
    const juanOrder = await createTestOrder({ customerId: juan.user.id });
    const anaOrder = await createTestOrder({ customerId: ana.user.id, status: OrderStatus.CANCELLED });

    const report = async (query: Record<string, string>) => {
      const response = await request(app).get('/api/reports/sales').set(authHeader(token)).query(query);
      expect(response.status).toBe(200);
      return response.body.data;
    };

    const byName = await report({ search: 'juan bautista' });
    expect(ids(byName.orders)).toEqual([juanOrder.id]);
    expect(byName.pagination.total).toBe(1);
    expect(byName.summary.totalOrders).toBe(2);

    expect(ids((await report({ search: anaOrder.orderNumber })).orders)).toEqual([anaOrder.id]);
    expect(ids((await report({ status: OrderStatus.CANCELLED })).orders)).toEqual([anaOrder.id]);
  });

  it('change requests: by product (title) or the moderator who submitted it, combined with the type filter', async () => {
    const { token } = await createOwner();
    const kevin = await createModerator({ firstName: 'Kevin', lastName: 'Santos' });
    const disenyo = await createModerator({ firstName: 'Disenyo', lastName: 'Moderator' });
    const kevinStock = await createTestRequest({ requestedById: kevin.user.id, type: RequestType.INVENTORY_RESTOCK, title: 'Add stock: Live oak' });
    const disenyoProduct = await createTestRequest({ requestedById: disenyo.user.id, type: RequestType.OTHER, title: 'Add product: Live oak' });

    const search = async (query: Record<string, string>) => {
      const response = await request(app).get('/api/requests').set(authHeader(token)).query(query);
      expect(response.status).toBe(200);
      return ids(response.body.data.requests);
    };

    expect(await search({ search: 'live oak' })).toEqual([kevinStock.id, disenyoProduct.id].sort());
    expect(await search({ search: 'kevin santos' })).toEqual([kevinStock.id]);
    expect(await search({ search: 'oak', kind: 'ADD_PRODUCT' })).toEqual([disenyoProduct.id]);
  });
});
