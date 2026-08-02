import { PaymentStatus, Prisma, ProjectStatus, RequestStatus, UserRole } from '@prisma/client';

import { prisma } from '../../config/database';
import type {
  CustomerStats,
  DashboardStats,
  DateRangeFilters,
  ModeratorWorkload,
  PaginatedListFilters,
  ProductStats,
  ProjectStats,
  SalesStats,
  StatusBreakdown,
  TopCustomer,
  TopProduct,
} from './analytics.types';

const DEFAULT_PAGE = 1;
const DEFAULT_PRODUCT_LIMIT = 10;
const DEFAULT_CUSTOMER_LIMIT = 10;
const DEFAULT_MODERATOR_LIMIT = 20;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const toStatusBreakdown = <TStatus extends string>(
  rows: Array<{ status: TStatus; _count: { _all: number } }>,
): StatusBreakdown[] => rows.map((row) => ({ status: row.status, count: row._count._all }));

/** Every date-filterable model in this module uses `createdAt`, so one helper covers Order/User/Project. */
const buildCreatedAtWhere = (filters: DateRangeFilters): { createdAt?: { gte?: Date; lte?: Date } } => {
  if (!filters.dateFrom && !filters.dateTo) return {};
  return {
    createdAt: {
      ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
      ...(filters.dateTo ? { lte: filters.dateTo } : {}),
    },
  };
};

export class AnalyticsService {
  /** Live snapshot - deliberately not date-filterable, unlike the other four endpoints. */
  async getDashboard(role: UserRole): Promise<DashboardStats> {
    const [
      totalCustomers,
      totalActiveProducts,
      lowStockCount,
      totalOrders,
      ordersByStatusRaw,
      totalBookings,
      bookingsByStatusRaw,
      totalProjects,
      projectsByStatusRaw,
      pendingRequests,
      feedbackAverage,
    ] = await Promise.all([
      prisma.user.count({ where: { role: UserRole.CUSTOMER } }),
      prisma.product.count({ where: { isActive: true, deletedAt: null } }),
      this.countLowStock(),
      prisma.order.count(),
      prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.booking.count(),
      prisma.booking.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.project.count(),
      prisma.project.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.request.count({ where: { status: RequestStatus.PENDING } }),
      prisma.feedback.aggregate({ _avg: { rating: true } }),
    ]);

    const stats: DashboardStats = {
      totalCustomers,
      totalActiveProducts,
      lowStockCount,
      totalOrders,
      ordersByStatus: toStatusBreakdown(ordersByStatusRaw),
      totalBookings,
      bookingsByStatus: toStatusBreakdown(bookingsByStatusRaw),
      totalProjects,
      projectsByStatus: toStatusBreakdown(projectsByStatusRaw),
      pendingRequests,
      averageFeedbackRating: feedbackAverage._avg.rating,
    };

    if (role === UserRole.OWNER) {
      const [revenueAgg, paidCount] = await Promise.all([
        prisma.payment.aggregate({ where: { status: PaymentStatus.PAID }, _sum: { amount: true } }),
        prisma.payment.count({ where: { status: PaymentStatus.PAID } }),
      ]);
      const totalRevenue = Number(revenueAgg._sum.amount ?? 0);
      stats.totalRevenue = totalRevenue;
      stats.averageOrderValue = paidCount > 0 ? totalRevenue / paidCount : 0;
    }

    return stats;
  }

  /**
   * `totalRevenue`/`averageOrderValue` come from PAID payments (money
   * actually collected, filtered by `paidAt`). `revenueByStatus` comes from
   * Order.totalAmount grouped by status (filtered by `createdAt`) - the
   * order-value pipeline view, including orders that haven't been paid yet.
   * Both OWNER-only.
   */
  async getSalesAnalytics(role: UserRole, filters: DateRangeFilters): Promise<SalesStats> {
    const orderWhere: Prisma.OrderWhereInput = buildCreatedAtWhere(filters);

    const [totalOrders, ordersByStatusRaw] = await Promise.all([
      prisma.order.count({ where: orderWhere }),
      prisma.order.groupBy({ by: ['status'], where: orderWhere, _count: { _all: true } }),
    ]);

    const stats: SalesStats = { totalOrders, ordersByStatus: toStatusBreakdown(ordersByStatusRaw) };

    if (role === UserRole.OWNER) {
      const paymentWhere: Prisma.PaymentWhereInput = {
        status: PaymentStatus.PAID,
        ...(filters.dateFrom || filters.dateTo
          ? { paidAt: { ...(filters.dateFrom ? { gte: filters.dateFrom } : {}), ...(filters.dateTo ? { lte: filters.dateTo } : {}) } }
          : {}),
      };

      const [revenueAgg, paidCount, revenueByStatusRaw] = await Promise.all([
        prisma.payment.aggregate({ where: paymentWhere, _sum: { amount: true } }),
        prisma.payment.count({ where: paymentWhere }),
        prisma.order.groupBy({ by: ['status'], where: orderWhere, _count: { _all: true }, _sum: { totalAmount: true } }),
      ]);

      const totalRevenue = Number(revenueAgg._sum.amount ?? 0);
      stats.totalRevenue = totalRevenue;
      stats.averageOrderValue = paidCount > 0 ? totalRevenue / paidCount : 0;
      stats.revenueByStatus = revenueByStatusRaw.map((row) => ({
        status: row.status,
        count: row._count._all,
        revenue: Number(row._sum.totalAmount ?? 0),
      }));
    }

    return stats;
  }

  /**
   * Top-selling products by units moved (operational - both roles).
   * `revenue` per product and `totalInventoryValue` are OWNER-only.
   * OrderItem has no scalar date column of its own, so the date range
   * filters through the `order` relation.
   */
  async getProductAnalytics(role: UserRole, filters: DateRangeFilters & PaginatedListFilters): Promise<ProductStats> {
    const page = filters.page ?? DEFAULT_PAGE;
    const limit = filters.limit ?? DEFAULT_PRODUCT_LIMIT;

    const orderItemWhere: Prisma.OrderItemWhereInput =
      filters.dateFrom || filters.dateTo ? { order: buildCreatedAtWhere(filters) } : {};

    const [totalActiveProducts, lowStockCount, topSellingAll] = await Promise.all([
      prisma.product.count({ where: { isActive: true, deletedAt: null } }),
      this.countLowStock(),
      prisma.orderItem.groupBy({
        by: ['productId'],
        where: orderItemWhere,
        _sum: { quantity: true, lineTotal: true },
        orderBy: { _sum: { quantity: 'desc' } },
      }),
    ]);

    const total = topSellingAll.length;
    const pageSlice = topSellingAll.slice((page - 1) * limit, (page - 1) * limit + limit);

    const products = await prisma.product.findMany({
      where: { id: { in: pageSlice.map((row) => row.productId) } },
      select: { id: true, name: true, sku: true },
    });
    const productById = new Map(products.map((product) => [product.id, product]));

    const topProducts: TopProduct[] = pageSlice.map((row) => {
      const product = productById.get(row.productId);
      const entry: TopProduct = {
        productId: row.productId,
        name: product?.name ?? 'Unknown product',
        sku: product?.sku ?? '',
        quantitySold: row._sum.quantity ?? 0,
      };
      if (role === UserRole.OWNER) {
        entry.revenue = Number(row._sum.lineTotal ?? 0);
      }
      return entry;
    });

    const stats: ProductStats = {
      totalActiveProducts,
      lowStockCount,
      topProducts,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };

    if (role === UserRole.OWNER) {
      stats.totalInventoryValue = await this.sumInventoryValue();
    }

    return stats;
  }

  /**
   * `newCustomers` is date-filtered by signup (`createdAt`). `topCustomers`
   * (OWNER-only, paginated) is a lifetime ranking by total PAID spend, not
   * date-filtered - deliberately different scope, since "who are our best
   * customers overall" is more useful here than a date-scoped ranking.
   */
  async getCustomerAnalytics(role: UserRole, filters: DateRangeFilters & PaginatedListFilters): Promise<CustomerStats> {
    const [totalCustomers, activeCustomers, newCustomers, ordersByCustomer] = await Promise.all([
      prisma.user.count({ where: { role: UserRole.CUSTOMER } }),
      prisma.user.count({ where: { role: UserRole.CUSTOMER, isActive: true } }),
      prisma.user.count({ where: { role: UserRole.CUSTOMER, ...buildCreatedAtWhere(filters) } }),
      prisma.order.groupBy({ by: ['customerId'], _count: { _all: true } }),
    ]);

    const repeatCustomers = ordersByCustomer.filter((row) => row._count._all > 1).length;

    const stats: CustomerStats = { totalCustomers, activeCustomers, newCustomers, repeatCustomers };

    if (role === UserRole.OWNER) {
      const page = filters.page ?? DEFAULT_PAGE;
      const limit = filters.limit ?? DEFAULT_CUSTOMER_LIMIT;

      // Payment has no customerId column (it lives on Order), so per-customer
      // spend can't be grouped directly via Prisma - summed in app code from
      // every PAID payment instead, the same "join then aggregate in JS"
      // pattern used for inventory value below.
      const paidPayments = await prisma.payment.findMany({
        where: { status: PaymentStatus.PAID },
        select: { amount: true, order: { select: { customerId: true } } },
      });

      const spendByCustomer = new Map<string, number>();
      for (const payment of paidPayments) {
        const customerId = payment.order.customerId;
        spendByCustomer.set(customerId, (spendByCustomer.get(customerId) ?? 0) + Number(payment.amount));
      }

      const orderCountByCustomer = new Map(ordersByCustomer.map((row) => [row.customerId, row._count._all]));

      const ranked = Array.from(spendByCustomer.entries()).sort((a, b) => b[1] - a[1]);
      const total = ranked.length;
      const pageSlice = ranked.slice((page - 1) * limit, (page - 1) * limit + limit);

      const customers = await prisma.user.findMany({
        where: { id: { in: pageSlice.map(([customerId]) => customerId) } },
        select: { id: true, firstName: true, lastName: true },
      });
      const customerById = new Map(customers.map((customer) => [customer.id, customer]));

      const topCustomers: TopCustomer[] = pageSlice.map(([customerId, totalSpent]) => {
        const customer = customerById.get(customerId);
        return {
          customerId,
          name: customer ? `${customer.firstName} ${customer.lastName}` : 'Unknown customer',
          orderCount: orderCountByCustomer.get(customerId) ?? 0,
          totalSpent,
        };
      });

      stats.topCustomers = topCustomers;
      stats.pagination = { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
    }

    return stats;
  }

  /**
   * `totalProjects`/`projectsByStatus`/`unassignedProjects` respect the date
   * filter (by `createdAt`). `moderatorWorkload` (paginated) always reflects
   * *current* IN_PROGRESS assignments regardless of the date filter, since
   * workload is a present-state staffing question, not a historical one.
   * `totalBudget`/`averageBudget` are OWNER-only.
   */
  async getProjectAnalytics(role: UserRole, filters: DateRangeFilters & PaginatedListFilters): Promise<ProjectStats> {
    const where: Prisma.ProjectWhereInput = buildCreatedAtWhere(filters);

    const [totalProjects, projectsByStatusRaw, unassignedProjects, completedWithDates] = await Promise.all([
      prisma.project.count({ where }),
      prisma.project.groupBy({ by: ['status'], where, _count: { _all: true } }),
      prisma.project.count({ where: { ...where, moderatorId: null } }),
      prisma.project.findMany({
        where: { ...where, status: ProjectStatus.COMPLETED, startDate: { not: null }, endDate: { not: null } },
        select: { startDate: true, endDate: true },
      }),
    ]);

    const averageDurationDays =
      completedWithDates.length > 0
        ? completedWithDates.reduce((sum, project) => sum + (project.endDate!.getTime() - project.startDate!.getTime()) / MS_PER_DAY, 0) /
          completedWithDates.length
        : null;

    const page = filters.page ?? DEFAULT_PAGE;
    const limit = filters.limit ?? DEFAULT_MODERATOR_LIMIT;

    const activeByModeratorAll = await prisma.project.groupBy({
      by: ['moderatorId'],
      where: { moderatorId: { not: null }, status: ProjectStatus.IN_PROGRESS },
      _count: { _all: true },
    });

    const total = activeByModeratorAll.length;
    const pageSlice = activeByModeratorAll.slice((page - 1) * limit, (page - 1) * limit + limit);

    const moderators = await prisma.user.findMany({
      where: { id: { in: pageSlice.map((row) => row.moderatorId as string) } },
      select: { id: true, firstName: true, lastName: true },
    });
    const moderatorById = new Map(moderators.map((moderator) => [moderator.id, moderator]));

    const moderatorWorkload: ModeratorWorkload[] = pageSlice.map((row) => {
      const moderatorId = row.moderatorId as string;
      const moderator = moderatorById.get(moderatorId);
      return {
        moderatorId,
        name: moderator ? `${moderator.firstName} ${moderator.lastName}` : 'Unknown moderator',
        activeProjectCount: row._count._all,
      };
    });

    const stats: ProjectStats = {
      totalProjects,
      projectsByStatus: toStatusBreakdown(projectsByStatusRaw),
      unassignedProjects,
      averageDurationDays,
      moderatorWorkload,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };

    if (role === UserRole.OWNER) {
      const budgetAgg = await prisma.project.aggregate({
        where: { ...where, budget: { not: null } },
        _sum: { budget: true },
        _avg: { budget: true },
      });
      stats.totalBudget = Number(budgetAgg._sum.budget ?? 0);
      stats.averageBudget = Number(budgetAgg._avg.budget ?? 0);
    }

    return stats;
  }

  /**
   * Prisma can't compare two columns of the same row (quantity <=
   * reorderLevel) in a `where` clause without a raw query - same limitation
   * documented in inventory.service.ts's getLowStockReport(), filtered in
   * application code here for the same reason.
   */
  private async countLowStock(): Promise<number> {
    const allInventory = await prisma.inventory.findMany({ select: { quantity: true, reorderLevel: true } });
    return allInventory.filter((item) => item.quantity <= item.reorderLevel).length;
  }

  private async sumInventoryValue(): Promise<number> {
    const rows = await prisma.inventory.findMany({ select: { quantity: true, product: { select: { price: true } } } });
    return rows.reduce((sum, row) => sum + row.quantity * Number(row.product.price), 0);
  }
}

export const analyticsService = new AnalyticsService();
