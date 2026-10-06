import { OrderStatus } from '@prisma/client';
import ExcelJS from 'exceljs';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { prisma } from '../../src/config/database';
import { cycleEndExclusive, cycleLastSecond, cycleTitle, manilaMidnight } from '../../src/modules/archive/archive.cycle';
import { archiveService } from '../../src/modules/archive/archive.service';
import { authHeader, createCustomer, createModerator, createOwner, createTestCategory, createTestOrder, createTestProduct } from '../helpers/factories';
import app from '../helpers/testApp';

const DAY = 24 * 60 * 60 * 1000;
// Philippine midnight, Sep 19 2026 (= Sep 18 16:00 UTC): the day of the first order, so the first cycle's start.
const CYCLE_START = new Date('2026-09-18T16:00:00.000Z');
// Philippine midnight, Oct 1 2026: the second cycle's start.
const OCTOBER_START = new Date('2026-09-30T16:00:00.000Z');

/** An order placed `daysIn` days (plus 10 hours) into the first cycle. */
const placeOrder = async (customerId: string, productId: string, daysIn: number, quantity: number, unitPrice: number, status: OrderStatus = OrderStatus.PENDING) => {
  const order = await createTestOrder({ customerId, status, items: [{ productId, quantity, unitPrice, productName: 'Oak Panel' }] });
  return prisma.order.update({ where: { id: order.id }, data: { createdAt: new Date(CYCLE_START.getTime() + daysIn * DAY + 10 * 60 * 60 * 1000) } });
};

const seedFirstCycle = async () => {
  const { user } = await createCustomer();
  const category = await createTestCategory();
  const created = await createTestProduct({ categoryId: category.id, name: 'Oak Panel' });
  const product = await prisma.product.update({ where: { id: created.id }, data: { sku: 'WP-OAK-01' } });
  await placeOrder(user.id, product.id, 0, 2, 500, OrderStatus.DELIVERED); // Sep 19: ₱1,000
  await placeOrder(user.id, product.id, 5, 1, 500); // Sep 24: ₱500
  await placeOrder(user.id, product.id, 5, 3, 500, OrderStatus.CANCELLED); // Sep 24: cancelled, not revenue
  return { customerId: user.id, productId: product.id };
};

describe('monthly dashboard cycles and archives', () => {
  it('cycle helpers work in calendar months, in Philippine time', () => {
    // 23:30 UTC on Aug 31 is already Sep 1 07:30 in Manila.
    expect(manilaMidnight(new Date('2026-08-31T23:30:00Z')).toISOString()).toBe('2026-08-31T16:00:00.000Z');
    // The first cycle runs from the first order's day to the end of that month.
    expect(cycleTitle(1, CYCLE_START)).toBe('Cycle #1: Sep 19, 2026 00:00 – Sep 30, 2026 23:59');
    expect(cycleEndExclusive(CYCLE_START)).toEqual(OCTOBER_START);
    expect(cycleTitle(2, OCTOBER_START)).toBe('Cycle #2: Oct 01, 2026 00:00 – Oct 31, 2026 23:59');
    // December rolls over into the next year; February follows leap years.
    expect(cycleEndExclusive(new Date('2026-11-30T16:00:00Z')).toISOString()).toBe('2026-12-31T16:00:00.000Z');
    expect(cycleLastSecond(new Date('2028-01-31T16:00:00Z')).toISOString()).toBe('2028-02-29T15:59:59.000Z');
  });

  it('archives a finished cycle once, with its totals, and never touches the orders', async () => {
    await seedFirstCycle();
    const ordersBefore = await prisma.order.findMany({ orderBy: { id: 'asc' } });

    const now = new Date(OCTOBER_START.getTime() + 5 * DAY);
    const current = await archiveService.ensureArchivesUpToDate(now);
    await archiveService.ensureArchivesUpToDate(now); // a second call archives nothing new

    expect(current).toEqual({ cycleNumber: 2, start: OCTOBER_START });
    const archives = await prisma.dashboardArchive.findMany();
    expect(archives).toHaveLength(1);
    const archive = archives[0]!;
    expect(archive.cycleNumber).toBe(1);
    expect(archive.cycleTitle).toBe('Cycle #1: Sep 19, 2026 00:00 – Sep 30, 2026 23:59');
    expect(archive.startTimestamp.toISOString()).toBe('2026-09-18T16:00:00.000Z');
    expect(archive.endTimestamp.toISOString()).toBe('2026-09-30T15:59:59.000Z');
    expect(Number(archive.totalGrossRevenue)).toBe(1500);
    expect(archive.totalOrdersCount).toBe(3);
    expect(archive.metricTypesIncluded).toEqual(['REVENUE_OVER_TIME', 'PRODUCT_DEMAND', 'ORDERS_BY_STATUS']);

    const days = archive.revenueOverTimeData as Array<{ date: string; grossRevenue: number; completedOrdersCount: number }>;
    expect(days).toHaveLength(12);
    expect(days[0]).toMatchObject({ date: '2026-09-19', grossRevenue: 1000, completedOrdersCount: 1 });
    expect(days[5]).toMatchObject({ date: '2026-09-24', grossRevenue: 500 });
    expect(days[11]).toMatchObject({ date: '2026-09-30', grossRevenue: 0 });
    expect(archive.productDemandData).toEqual([expect.objectContaining({ productName: 'Oak Panel', sku: 'WP-OAK-01', unitsSold: 3, totalRevenue: 1500 })]);
    expect(archive.ordersByStatusData).toEqual(expect.arrayContaining([
      { status: 'PENDING', count: 1, percentage: 33.3 },
      { status: 'DELIVERED', count: 1, percentage: 33.3 },
      { status: 'CANCELLED', count: 1, percentage: 33.3 },
    ]));

    expect(await prisma.order.findMany({ orderBy: { id: 'asc' } })).toEqual(ordersBefore);
  });

  it('after archiving, the live cycle starts again from zero and only counts new orders', async () => {
    const { customerId, productId } = await seedFirstCycle();
    await placeOrder(customerId, productId, 14, 1, 700); // Oct 3, in cycle 2

    // Early on Oct 4: today counts as a day of the cycle.
    const cycle = await archiveService.getCurrentCycle('OWNER', new Date(OCTOBER_START.getTime() + 3 * DAY + 2 * 60 * 60 * 1000));

    expect(cycle.cycleNumber).toBe(2);
    expect(cycle.startTimestamp).toBe('2026-09-30T16:00:00.000Z');
    expect(cycle.endTimestamp).toBe('2026-10-31T15:59:59.000Z');
    expect(cycle.totalOrdersCount).toBe(1);
    expect(cycle.totalGrossRevenue).toBe(700);
    expect(cycle.revenueOverTime.map((day) => day.date)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
  });

  it('archives every cycle that ended while nobody looked', async () => {
    await seedFirstCycle();
    // Dec 23: September (from the 19th), October and November have ended.
    const current = await archiveService.ensureArchivesUpToDate(new Date(CYCLE_START.getTime() + 95 * DAY));
    expect(current).toEqual({ cycleNumber: 4, start: new Date('2026-11-30T16:00:00.000Z') });
    const archives = await prisma.dashboardArchive.findMany({ orderBy: { cycleNumber: 'asc' } });
    expect(archives.map((a) => a.totalOrdersCount)).toEqual([3, 0, 0]);
    expect(archives.map((a) => a.cycleTitle)).toEqual([
      'Cycle #1: Sep 19, 2026 00:00 – Sep 30, 2026 23:59',
      'Cycle #2: Oct 01, 2026 00:00 – Oct 31, 2026 23:59',
      'Cycle #3: Nov 01, 2026 00:00 – Nov 30, 2026 23:59',
    ]);
  });

  it('the dashboard cycle: owner sees revenue, moderator does not; only the owner can list archives', async () => {
    const { customerId, productId } = await seedFirstCycle();
    // Today, so the real current cycle has a sale in it.
    await createTestOrder({ customerId, items: [{ productId, quantity: 1, unitPrice: 300 }] });
    const owner = await createOwner();
    const moderator = await createModerator();

    const ownerCycle = await request(app).get('/api/admin/archives/current-cycle').set(authHeader(owner.token));
    expect(ownerCycle.status).toBe(200);
    expect(ownerCycle.body.data.cycle).toHaveProperty('totalGrossRevenue');

    const moderatorCycle = await request(app).get('/api/admin/archives/current-cycle').set(authHeader(moderator.token));
    expect(moderatorCycle.status).toBe(200);
    expect(moderatorCycle.body.data.cycle).not.toHaveProperty('totalGrossRevenue');
    expect(moderatorCycle.body.data.cycle.productDemand.length).toBeGreaterThan(0);
    for (const row of moderatorCycle.body.data.cycle.productDemand) expect(row).not.toHaveProperty('totalRevenue');
    for (const day of moderatorCycle.body.data.cycle.revenueOverTime) expect(day).not.toHaveProperty('grossRevenue');

    expect((await request(app).get('/api/admin/archives').set(authHeader(owner.token))).status).toBe(200);
    expect((await request(app).get('/api/admin/archives').set(authHeader(moderator.token))).status).toBe(403);
  });

  it('downloads an archive as one Excel workbook: an overview sheet and one sheet per widget', async () => {
    await seedFirstCycle();
    await archiveService.ensureArchivesUpToDate(new Date(OCTOBER_START.getTime() + 5 * DAY));
    const archive = await prisma.dashboardArchive.findFirstOrThrow();
    const owner = await createOwner();

    const response = await request(app)
      .get(`/api/admin/archives/${archive.id}/download`)
      .set(authHeader(owner.token))
      .buffer(true)
      .parse((res, done) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => done(null, Buffer.concat(chunks)));
      });

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(response.headers['content-disposition']).toBe('attachment; filename="PanelScan_Archive_Sep19_to_Sep30_2026.xlsx"');

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(response.body as unknown as ExcelJS.Buffer);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Archive Overview', 'Revenue Over Time', 'Product Demand', 'Orders By Status']);
    const values = (sheetName: string, row: number) => (workbook.getWorksheet(sheetName)!.getRow(row).values as unknown[]).slice(1);

    // Overview: a label in column A, its value in column B.
    const overview = new Map<unknown, unknown>();
    workbook.getWorksheet('Archive Overview')!.eachRow((row) => overview.set(row.getCell(1).value, row.getCell(2).value));
    expect(values('Archive Overview', 1)).toEqual(['Cycle #1 Archived Record']);
    expect(overview.get('Date Range (Philippine Time)')).toBe('Sep 19, 2026 00:00 – Sep 30, 2026 23:59');
    expect(overview.get('Start Timestamp')).toBe('2026-09-19T00:00:00+08:00');
    expect(overview.get('End Timestamp')).toBe('2026-09-30T23:59:59+08:00');
    expect(overview.get('Covered Metrics Included')).toBe('Revenue Over Time, Product Demand, Orders by Status');
    expect(overview.get('Cycle Total Revenue (PHP)')).toBe(1500);
    expect(overview.get('Cycle Total Orders')).toBe(3);
    expect(overview.get('Cycle Total Completed Orders')).toBe(1);
    expect(overview.get('Archive ID')).toBe(archive.id);

    expect(values('Revenue Over Time', 1)).toEqual(['Date', 'Daily Gross Revenue (PHP)', 'Completed Orders Count']);
    expect(values('Revenue Over Time', 2)).toEqual([new Date('2026-09-19T00:00:00Z'), 1000, 1]);
    expect(values('Revenue Over Time', 14)).toEqual(['Total', 1500, 1]); // 12 days, then the total

    expect(values('Product Demand', 1)).toEqual(['Product Name', 'SKU', 'Units Sold', 'Total Revenue Generated (PHP)']);
    expect(values('Product Demand', 2)).toEqual(['Oak Panel', 'WP-OAK-01', 3, 1500]);

    expect(values('Orders By Status', 1)).toEqual(['Order Status', 'Total Count', 'Percentage Share (%)']);
    expect(workbook.getWorksheet('Orders By Status')!.getColumn(1).values.slice(2, 7)).toEqual(['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled']);
    expect(values('Orders By Status', 2)).toEqual(['Pending', 1, 0.333]);
    expect(values('Orders By Status', 7)).toEqual(['Total', 3, 1]);

    // The same frozen data, read back to show the cycle on the dashboard.
    const detail = await request(app).get(`/api/admin/archives/${archive.id}`).set(authHeader(owner.token));
    expect(detail.status).toBe(200);
    expect(detail.body.data.archive).toMatchObject({ id: archive.id, cycleNumber: 1, totalGrossRevenue: 1500, totalOrdersCount: 3 });
    expect(detail.body.data.archive.revenueOverTime).toHaveLength(12);
    expect(detail.body.data.archive.productDemand).toEqual([expect.objectContaining({ productName: 'Oak Panel', unitsSold: 3 })]);
    expect(detail.body.data.archive.ordersByStatus).toHaveLength(5);

    const moderator = await createModerator();
    expect((await request(app).get(`/api/admin/archives/${archive.id}`).set(authHeader(moderator.token))).status).toBe(403);
    expect((await request(app).get('/api/admin/archives/00000000-0000-4000-8000-000000000000').set(authHeader(owner.token))).status).toBe(404);
    expect((await request(app).get(`/api/admin/archives/${archive.id}/download`).set(authHeader(moderator.token))).status).toBe(403);
    expect((await request(app).get('/api/admin/archives/00000000-0000-4000-8000-000000000000/download').set(authHeader(owner.token))).status).toBe(404);
  });
});
