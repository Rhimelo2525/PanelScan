import { OrderStatus } from '@prisma/client';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import { manilaDayRange, parseDateSearch } from '../../src/modules/delivery/utils/date-search';
import { authHeader, createCustomer, createModerator, createOwner, createTestOrder } from '../helpers/factories';
import app from '../helpers/testApp';

/** Manila wall-clock time (UTC+8) as a real instant. */
const manila = (iso: string): Date => new Date(`${iso}+08:00`);
const NOW = manila('2026-09-28T10:00:00');
const SEP_19 = manilaDayRange(2026, 9, 19);

describe('parseDateSearch', () => {
  it.each(['Sep 19, 2026', 'September 19, 2026', 'sept. 19 2026', '2026-09-19', '09/19/2026', '9/19/2026', '19 Sep 2026'])('reads "%s" as exactly Sep 19, 2026 (Manila)', (term) => {
    expect(parseDateSearch(term, NOW)).toEqual([SEP_19]);
  });

  it('a day is a Manila calendar day - 11:30 PM stays on the 19th, 12:10 AM is not the 18th', () => {
    expect(SEP_19.gte.toISOString()).toBe('2026-09-18T16:00:00.000Z');
    expect(SEP_19.lt.toISOString()).toBe('2026-09-19T16:00:00.000Z');
    const lateNight = manila('2026-09-19T23:30:00');
    expect(lateNight >= SEP_19.gte && lateNight < SEP_19.lt).toBe(true);
  });

  it.each(['Sep 19', 'September 19', '09/19'])('without a year, "%s" matches Sep 19 of each year around now, including this one', (term) => {
    const ranges = parseDateSearch(term, NOW);
    expect(ranges).toContainEqual(SEP_19);
    expect(ranges.every((range) => new Date(range.gte.getTime() + 8 * 3600_000).getUTCDate() === 19)).toBe(true);
  });

  it('a bare day number matches that day of every month', () => {
    const ranges = parseDateSearch('19', NOW);
    expect(ranges).toContainEqual(SEP_19);
    expect(ranges).toContainEqual(manilaDayRange(2026, 8, 19));
    expect(parseDateSearch('31', NOW)).not.toContainEqual(manilaDayRange(2026, 10, 1)); // "Sep 31" never rolls over into Oct 1
  });

  it.each(['Rhimelo', 'PS-20260919', '3593909892676805199', 'Van', 'Sep', '2026', '0', '32', '13/40/2026', 'Feb 30, 2026', 'Kaypian Road 19'])('does not treat "%s" as a date', (term) => {
    expect(parseDateSearch(term, NOW)).toEqual([]);
  });
});

describe('GET /api/delivery?search=<date>', () => {
  /** An order placed at `orderDate` (the date the Deliveries table shows) with its delivery record. */
  async function deliveryAt(customerId: string, orderDate: Date, extra: { deliveryStatus?: string; lalamoveOrderId?: string } = {}) {
    const order = await createTestOrder({ customerId, status: OrderStatus.PROCESSING });
    await prisma.order.update({ where: { id: order.id }, data: { createdAt: orderDate } });
    return prisma.delivery.create({
      data: {
        orderId: order.id,
        address: order.shippingAddress,
        deliveryStatus: extra.deliveryStatus ?? 'AWAITING_ORDER_APPROVAL',
        lalamoveOrderId: extra.lalamoveOrderId,
      },
      include: { order: true },
    });
  }

  const idsFor = async (token: string, query: string): Promise<string[]> => {
    const response = await request(app).get(`/api/delivery?${query}`).set(authHeader(token));
    expect(response.status).toBe(200);
    return response.body.data.deliveries.map((delivery: { id: string }) => delivery.id);
  };

  it('finds the displayed date in every supported format, and only that date', async () => {
    const moderator = await createModerator();
    const customer = await createCustomer({ firstName: 'Rhimelo' });
    const afternoon = await deliveryAt(customer.user.id, manila('2026-09-19T15:37:00'));
    const lateNight = await deliveryAt(customer.user.id, manila('2026-09-19T23:30:00'));
    const justAfterMidnight = await deliveryAt(customer.user.id, manila('2026-09-19T00:10:00'));
    const morning = await deliveryAt(customer.user.id, manila('2026-09-19T11:42:00'));
    const others = [
      await deliveryAt(customer.user.id, manila('2026-09-20T08:15:00')),
      await deliveryAt(customer.user.id, manila('2026-09-21T09:00:00')),
      await deliveryAt(customer.user.id, manila('2026-09-18T23:59:00')),
      await deliveryAt(customer.user.id, manila('2025-09-20T10:00:00')),
    ];
    const sep19 = [afternoon.id, lateNight.id, justAfterMidnight.id, morning.id];

    for (const term of ['Sep 19', 'Sep 19, 2026', 'September 19', 'September 19, 2026', '2026-09-19', '09/19/2026']) {
      const ids = await idsFor(moderator.token, `search=${encodeURIComponent(term)}`);
      expect(ids, term).toEqual(expect.arrayContaining(sep19));
      for (const other of others) expect(ids, term).not.toContain(other.id);
    }
  });

  it('keeps the existing customer, order-number and booking-id searches', async () => {
    const moderator = await createModerator();
    const customer = await createCustomer({ firstName: 'Rhimelo', lastName: 'Manongtong' });
    const booked = await deliveryAt(customer.user.id, manila('2026-09-19T15:37:00'), { deliveryStatus: 'ASSIGNING_DRIVER', lalamoveOrderId: '3593909892676805199' });
    const other = await deliveryAt((await createCustomer({ firstName: 'Someone' })).user.id, manila('2026-09-19T15:37:00'));

    expect(await idsFor(moderator.token, 'search=Rhimelo')).toEqual([booked.id]);
    expect(await idsFor(moderator.token, `search=${encodeURIComponent(booked.order.orderNumber)}`)).toEqual([booked.id]);
    expect(await idsFor(moderator.token, 'search=359390')).toEqual([booked.id]);
    expect(await idsFor(moderator.token, 'search=3593909892676805199')).toEqual([booked.id]);
    expect(await idsFor(moderator.token, 'search=Someone')).toEqual([other.id]);
  });

  it('combines the date search with the status filter, and clearing the search restores the filtered list', async () => {
    const owner = await createOwner();
    const customer = await createCustomer();
    const pendingSep19 = await deliveryAt(customer.user.id, manila('2026-09-19T15:37:00'));
    const approvedSep19 = await deliveryAt(customer.user.id, manila('2026-09-19T16:00:00'), { deliveryStatus: 'READY_TO_BOOK' });
    const approvedSep20 = await deliveryAt(customer.user.id, manila('2026-09-20T16:00:00'), { deliveryStatus: 'READY_TO_BOOK' });

    expect(await idsFor(owner.token, 'deliveryState=to_book&search=Sep%2019')).toEqual([approvedSep19.id]);
    expect(await idsFor(owner.token, 'deliveryState=awaiting_approval&search=Sep%2019')).toEqual([pendingSep19.id]);
    expect((await idsFor(owner.token, 'search=Sep%2019')).sort()).toEqual([pendingSep19.id, approvedSep19.id].sort());
    expect((await idsFor(owner.token, 'deliveryState=to_book')).sort()).toEqual([approvedSep19.id, approvedSep20.id].sort());
  });

  it('a customer searching by date still sees only their own deliveries', async () => {
    const customer = await createCustomer();
    const stranger = await createCustomer();
    const mine = await deliveryAt(customer.user.id, manila('2026-09-19T15:37:00'));
    await deliveryAt(stranger.user.id, manila('2026-09-19T15:37:00'));

    expect(await idsFor(customer.token, 'search=Sep%2019')).toEqual([mine.id]);
  });
});
