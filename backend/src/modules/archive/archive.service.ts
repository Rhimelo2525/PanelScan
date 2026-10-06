import { OrderStatus, Prisma, UserRole } from '@prisma/client';
import type { DashboardArchive } from '@prisma/client';

import { prisma } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { cycleEndExclusive, cycleLastSecond, cycleTitle, manilaDateKey, manilaDaysBetween, manilaMidnight } from './archive.cycle';
import { ARCHIVED_METRIC_TYPES } from './archive.types';
import type { ArchiveDetail, ArchiveSummary, ArchivedMetricType, CurrentCycle, CycleMetrics, OrderStatusShare, ProductDemandRow, RevenueDay } from './archive.types';

const roundMoney = (value: number): number => Math.round(value * 100) / 100;
const STATUS_ORDER: OrderStatus[] = [OrderStatus.PENDING, OrderStatus.PROCESSING, OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.CANCELLED];

/**
 * Monthly dashboard cycles and their archives. Archiving only ever reads
 * orders - nothing in orders, payments, products or inventory is changed.
 * The live dashboard's "Revenue over time", "Product demand" and "Orders by
 * status" count orders placed since the current cycle started; once a cycle
 * is over it is frozen into a DashboardArchive and the next one starts at 0.
 *
 * Archiving runs lazily (`ensureArchivesUpToDate`, on every dashboard or
 * Archives request) rather than on a timer, so it needs no scheduler and
 * catches up on every cycle that ended while nobody was looking.
 */
export class ArchiveService {
  /**
   * The three widgets' figures for orders placed in [start, endExclusive).
   * Days run up to `daysUntil` (today, for the cycle in progress). Revenue is
   * the value of non-cancelled orders; product demand counts non-cancelled
   * orders too, while orders by status covers every order.
   */
  async computeCycleMetrics(start: Date, endExclusive: Date, daysUntil: Date = endExclusive): Promise<CycleMetrics> {
    const placedInCycle = { createdAt: { gte: start, lt: endExclusive } };
    const [orders, demand] = await Promise.all([
      prisma.order.findMany({ where: placedInCycle, select: { createdAt: true, status: true, totalAmount: true } }),
      prisma.orderItem.groupBy({
        by: ['productId'],
        where: { order: { ...placedInCycle, status: { not: OrderStatus.CANCELLED } } },
        _sum: { quantity: true, lineTotal: true },
        orderBy: { _sum: { quantity: 'desc' } },
      }),
    ]);

    const days = new Map<string, RevenueDay>(
      manilaDaysBetween(start, daysUntil < endExclusive ? daysUntil : endExclusive).map((date) => [date, { date, grossRevenue: 0, ordersCount: 0, completedOrdersCount: 0 }]),
    );
    const statusCounts = new Map<OrderStatus, number>(STATUS_ORDER.map((status) => [status, 0]));
    let totalGrossRevenue = 0;
    for (const order of orders) {
      statusCounts.set(order.status, (statusCounts.get(order.status) ?? 0) + 1);
      const day = days.get(manilaDateKey(order.createdAt));
      if (order.status === OrderStatus.CANCELLED) continue;
      const amount = Number(order.totalAmount);
      totalGrossRevenue += amount;
      if (!day) continue;
      day.grossRevenue = roundMoney((day.grossRevenue ?? 0) + amount);
      day.ordersCount += 1;
      if (order.status === OrderStatus.DELIVERED) day.completedOrdersCount += 1;
    }

    const products = await prisma.product.findMany({ where: { id: { in: demand.map((row) => row.productId) } }, select: { id: true, name: true, sku: true } });
    const productById = new Map(products.map((product) => [product.id, product]));
    const productDemand: ProductDemandRow[] = demand.map((row) => ({
      productId: row.productId,
      productName: productById.get(row.productId)?.name ?? 'Unknown product',
      // A removed product's code carries an __ARCHIVED_<time> suffix (request.service.ts); report the code it was sold under.
      sku: (productById.get(row.productId)?.sku ?? '').replace(/__ARCHIVED_\d+$/, ''),
      unitsSold: row._sum.quantity ?? 0,
      totalRevenue: roundMoney(Number(row._sum.lineTotal ?? 0)),
    }));

    const totalOrdersCount = orders.length;
    const ordersByStatus: OrderStatusShare[] = STATUS_ORDER.map((status) => {
      const count = statusCounts.get(status) ?? 0;
      return { status, count, percentage: totalOrdersCount === 0 ? 0 : Math.round((count / totalOrdersCount) * 1000) / 10 };
    });

    return { revenueOverTime: [...days.values()], productDemand, ordersByStatus, totalGrossRevenue: roundMoney(totalGrossRevenue), totalOrdersCount };
  }

  /**
   * Archives every cycle that has ended and returns the one in progress.
   * The first cycle starts at Philippine midnight of the first order ever
   * placed and runs to the end of that month; each later one is a whole
   * calendar month, starting where the previous ended.
   */
  async ensureArchivesUpToDate(now: Date = new Date()): Promise<{ cycleNumber: number; start: Date }> {
    const latest = await prisma.dashboardArchive.findFirst({ orderBy: { startTimestamp: 'desc' }, select: { cycleNumber: true, startTimestamp: true } });
    let cycleNumber = latest ? latest.cycleNumber + 1 : 1;
    let start = latest ? cycleEndExclusive(latest.startTimestamp) : await this.firstCycleStart(now);

    while (cycleEndExclusive(start).getTime() <= now.getTime()) {
      await this.archiveCycle(cycleNumber, start);
      cycleNumber += 1;
      start = cycleEndExclusive(start);
    }
    return { cycleNumber, start };
  }

  /** The live cycle with its figures so far. Revenue is left out for a MODERATOR. */
  async getCurrentCycle(role: UserRole, now: Date = new Date()): Promise<CurrentCycle> {
    const { cycleNumber, start } = await this.ensureArchivesUpToDate(now);
    const metrics = await this.computeCycleMetrics(start, cycleEndExclusive(start), now);
    const cycle: CurrentCycle = {
      cycleNumber,
      startTimestamp: start.toISOString(),
      endTimestamp: cycleLastSecond(start).toISOString(),
      ...metrics,
    };
    return role === UserRole.OWNER ? cycle : withoutRevenue(cycle);
  }

  /** Every archived cycle, newest first. */
  async listArchives(): Promise<ArchiveSummary[]> {
    await this.ensureArchivesUpToDate();
    const archives = await prisma.dashboardArchive.findMany({ orderBy: { startTimestamp: 'desc' } });
    return archives.map(toSummary);
  }

  /** One archived cycle with its frozen data (read-only). */
  async getArchiveDetail(id: string): Promise<ArchiveDetail> {
    const archive = await this.getArchive(id);
    return {
      ...toSummary(archive),
      revenueOverTime: archive.revenueOverTimeData as unknown as RevenueDay[],
      productDemand: archive.productDemandData as unknown as ProductDemandRow[],
      ordersByStatus: archive.ordersByStatusData as unknown as OrderStatusShare[],
    };
  }

  async getArchive(id: string): Promise<DashboardArchive> {
    const archive = await prisma.dashboardArchive.findUnique({ where: { id } });
    if (!archive) {
      throw new AppError('Archive not found.', 404);
    }
    return archive;
  }

  private async firstCycleStart(now: Date): Promise<Date> {
    const firstOrder = await prisma.order.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } });
    return manilaMidnight(firstOrder?.createdAt ?? now);
  }

  private async archiveCycle(cycleNumber: number, start: Date): Promise<void> {
    const metrics = await this.computeCycleMetrics(start, cycleEndExclusive(start));
    try {
      await prisma.dashboardArchive.create({
        data: {
          cycleNumber,
          cycleTitle: cycleTitle(cycleNumber, start),
          metricTypesIncluded: [...ARCHIVED_METRIC_TYPES],
          startTimestamp: start,
          endTimestamp: cycleLastSecond(start),
          totalGrossRevenue: metrics.totalGrossRevenue ?? 0,
          totalOrdersCount: metrics.totalOrdersCount,
          revenueOverTimeData: metrics.revenueOverTime as unknown as Prisma.InputJsonValue,
          productDemandData: metrics.productDemand as unknown as Prisma.InputJsonValue,
          ordersByStatusData: metrics.ordersByStatus as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      // Two requests archiving the same cycle at once: the other one won.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') return;
      throw error;
    }
  }
}

const withoutRevenue = (cycle: CurrentCycle): CurrentCycle => {
  const { totalGrossRevenue: _hidden, ...rest } = cycle;
  return {
    ...rest,
    revenueOverTime: cycle.revenueOverTime.map(({ grossRevenue: _revenue, ...day }) => day),
    productDemand: cycle.productDemand.map(({ totalRevenue: _revenue, ...row }) => row),
  };
};

const toSummary = (archive: DashboardArchive): ArchiveSummary => ({
  id: archive.id,
  cycleNumber: archive.cycleNumber,
  cycleTitle: archive.cycleTitle,
  metricTypesIncluded: archive.metricTypesIncluded as ArchivedMetricType[],
  startTimestamp: archive.startTimestamp.toISOString(),
  endTimestamp: archive.endTimestamp.toISOString(),
  archivedAt: archive.archivedAt.toISOString(),
  totalGrossRevenue: Number(archive.totalGrossRevenue),
  totalOrdersCount: archive.totalOrdersCount,
});

export const archiveService = new ArchiveService();
