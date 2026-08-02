import { BookingStatus, OrderStatus, PaymentStatus, Prisma, ProjectStatus, UserRole } from '@prisma/client';

import { prisma } from '../../config/database';
import type {
  BookingReportRow,
  BookingsReport,
  DateRangeFilters,
  InventoryReport,
  InventoryReportRow,
  OrderReportRow,
  OrderStatusFilter,
  OrdersReport,
  PaginatedListFilters,
  ProjectReportRow,
  ProjectsReport,
  SalesReport,
  StatusBreakdown,
} from './reports.types';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

const toStatusBreakdown = <TStatus extends string>(
  rows: Array<{ status: TStatus; _count: { _all: number } }>,
): StatusBreakdown[] => rows.map((row) => ({ status: row.status, count: row._count._all }));

/** Every date-filterable model in this module uses `createdAt`, except Inventory (see getInventoryReport). */
const buildCreatedAtWhere = (filters: DateRangeFilters): { createdAt?: { gte?: Date; lte?: Date } } => {
  if (!filters.dateFrom && !filters.dateTo) return {};
  return {
    createdAt: {
      ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
      ...(filters.dateTo ? { lte: filters.dateTo } : {}),
    },
  };
};

const paginationMeta = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: Math.max(1, Math.ceil(total / limit)),
});

type OrderWithRelations = Prisma.OrderGetPayload<{
  include: { customer: { select: { firstName: true; lastName: true } }; items: { select: { id: true } } };
}>;

export class ReportsService {
  /**
   * Financial ("Sales") view: OWNER-only `summary.totalRevenue`/
   * `averageOrderValue` come from PAID payments (`paidAt` filtered) - the
   * same "revenue = money actually collected" definition used by the
   * Analytics module, kept consistent across the API rather than inventing
   * a second meaning of "revenue" here. Per-row `totalAmount` (also
   * OWNER-only) is the order's own value regardless of payment status.
   */
  async getSalesReport(role: UserRole, filters: DateRangeFilters & PaginatedListFilters): Promise<SalesReport> {
    const page = filters.page ?? DEFAULT_PAGE;
    const limit = filters.limit ?? DEFAULT_LIMIT;
    const where: Prisma.OrderWhereInput = buildCreatedAtWhere(filters);

    const [totalOrders, ordersByStatusRaw, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.groupBy({ by: ['status'], where, _count: { _all: true } }),
      prisma.order.findMany({
        where,
        include: { customer: { select: { firstName: true, lastName: true } }, items: { select: { id: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const summary: SalesReport['summary'] = { totalOrders, ordersByStatus: toStatusBreakdown(ordersByStatusRaw) };

    if (role === UserRole.OWNER) {
      const paymentWhere: Prisma.PaymentWhereInput = {
        status: PaymentStatus.PAID,
        ...(filters.dateFrom || filters.dateTo
          ? { paidAt: { ...(filters.dateFrom ? { gte: filters.dateFrom } : {}), ...(filters.dateTo ? { lte: filters.dateTo } : {}) } }
          : {}),
      };
      const [revenueAgg, paidCount] = await Promise.all([
        prisma.payment.aggregate({ where: paymentWhere, _sum: { amount: true } }),
        prisma.payment.count({ where: paymentWhere }),
      ]);
      const totalRevenue = Number(revenueAgg._sum.amount ?? 0);
      summary.totalRevenue = totalRevenue;
      summary.averageOrderValue = paidCount > 0 ? totalRevenue / paidCount : 0;
    }

    return {
      summary,
      orders: orders.map((order) => this.toOrderRow(order, role)),
      pagination: paginationMeta(page, limit, totalOrders),
    };
  }

  /**
   * Operational ("fulfillment pipeline") view: counts by status only, no
   * revenue figure in the summary at all (unlike /sales) - distinguishing
   * "how much did we sell" (sales report) from "what state is every order
   * in" (this report). Per-row `totalAmount` still follows the same
   * OWNER-only field-hiding rule as everywhere else in this module.
   */
  async getOrdersReport(role: UserRole, filters: OrderStatusFilter): Promise<OrdersReport> {
    const page = filters.page ?? DEFAULT_PAGE;
    const limit = filters.limit ?? DEFAULT_LIMIT;
    const where: Prisma.OrderWhereInput = {
      ...buildCreatedAtWhere(filters),
      ...(filters.status ? { status: filters.status as OrderStatus } : {}),
    };

    const [totalOrders, ordersByStatusRaw, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.groupBy({ by: ['status'], where, _count: { _all: true } }),
      prisma.order.findMany({
        where,
        include: { customer: { select: { firstName: true, lastName: true } }, items: { select: { id: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      summary: { totalOrders, ordersByStatus: toStatusBreakdown(ordersByStatusRaw) },
      orders: orders.map((order) => this.toOrderRow(order, role)),
      pagination: paginationMeta(page, limit, totalOrders),
    };
  }

  private toOrderRow(order: OrderWithRelations, role: UserRole): OrderReportRow {
    const row: OrderReportRow = {
      id: order.id,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      customerName: `${order.customer.firstName} ${order.customer.lastName}`,
      status: order.status,
      itemCount: order.items.length,
      createdAt: order.createdAt,
    };
    if (role === UserRole.OWNER) {
      row.totalAmount = Number(order.totalAmount);
    }
    return row;
  }

  /**
   * Date range filters `lastRestockedAt` (not `createdAt` - inventory rows
   * are created once alongside their product and rarely again, so
   * "restocked in this range" is the operationally meaningful filter here).
   * Low-stock detection can't be a Prisma `where` clause (Prisma can't
   * compare two columns of the same row without a raw query - the same
   * limitation documented on inventory.service.ts's getLowStockReport()
   * and reused again in the Analytics module), so this fetches every
   * matching row and paginates in application code.
   */
  async getInventoryReport(role: UserRole, filters: DateRangeFilters & PaginatedListFilters): Promise<InventoryReport> {
    const page = filters.page ?? DEFAULT_PAGE;
    const limit = filters.limit ?? DEFAULT_LIMIT;

    const where: Prisma.InventoryWhereInput =
      filters.dateFrom || filters.dateTo
        ? {
            lastRestockedAt: {
              ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
              ...(filters.dateTo ? { lte: filters.dateTo } : {}),
            },
          }
        : {};

    const allInventory = await prisma.inventory.findMany({
      where,
      include: { product: { select: { id: true, name: true, sku: true, price: true } } },
      orderBy: { quantity: 'asc' },
    });

    const total = allInventory.length;
    const lowStockCount = allInventory.filter((item) => item.quantity <= item.reorderLevel).length;
    const pageSlice = allInventory.slice((page - 1) * limit, (page - 1) * limit + limit);

    const inventory: InventoryReportRow[] = pageSlice.map((item) => {
      const row: InventoryReportRow = {
        productId: item.productId,
        productName: item.product.name,
        sku: item.product.sku,
        quantity: item.quantity,
        reservedQty: item.reservedQty,
        available: item.quantity - item.reservedQty,
        reorderLevel: item.reorderLevel,
        isLowStock: item.quantity <= item.reorderLevel,
        lastRestockedAt: item.lastRestockedAt,
      };
      if (role === UserRole.OWNER) {
        row.unitPrice = Number(item.product.price);
      }
      return row;
    });

    const summary: InventoryReport['summary'] = { totalItems: total, lowStockCount };
    if (role === UserRole.OWNER) {
      summary.totalInventoryValue = allInventory.reduce((sum, item) => sum + item.quantity * Number(item.product.price), 0);
    }

    return { summary, inventory, pagination: paginationMeta(page, limit, total) };
  }

  /** Booking has no financial columns at all, so this report is identical for OWNER and MODERATOR - no role parameter needed. */
  async getBookingsReport(filters: DateRangeFilters & PaginatedListFilters & { status?: string }): Promise<BookingsReport> {
    const page = filters.page ?? DEFAULT_PAGE;
    const limit = filters.limit ?? DEFAULT_LIMIT;
    const where: Prisma.BookingWhereInput = {
      ...buildCreatedAtWhere(filters),
      ...(filters.status ? { status: filters.status as BookingStatus } : {}),
    };

    const [totalBookings, bookingsByStatusRaw, bookings] = await Promise.all([
      prisma.booking.count({ where }),
      prisma.booking.groupBy({ by: ['status'], where, _count: { _all: true } }),
      prisma.booking.findMany({
        where,
        include: {
          customer: { select: { firstName: true, lastName: true } },
          installer: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const bookingRows: BookingReportRow[] = bookings.map((booking) => ({
      id: booking.id,
      customerId: booking.customerId,
      customerName: `${booking.customer.firstName} ${booking.customer.lastName}`,
      installerId: booking.installerId,
      installerName: booking.installer ? `${booking.installer.firstName} ${booking.installer.lastName}` : null,
      status: booking.status,
      scheduledDate: booking.scheduledDate,
      address: booking.address,
      createdAt: booking.createdAt,
    }));

    return {
      summary: { totalBookings, bookingsByStatus: toStatusBreakdown(bookingsByStatusRaw) },
      bookings: bookingRows,
      pagination: paginationMeta(page, limit, totalBookings),
    };
  }

  /** `budget`/`totalBudget`/`averageBudget` are OWNER-only, same field-hiding rule as every other financial figure in this module. */
  async getProjectsReport(role: UserRole, filters: DateRangeFilters & PaginatedListFilters & { status?: string }): Promise<ProjectsReport> {
    const page = filters.page ?? DEFAULT_PAGE;
    const limit = filters.limit ?? DEFAULT_LIMIT;
    const where: Prisma.ProjectWhereInput = {
      ...buildCreatedAtWhere(filters),
      ...(filters.status ? { status: filters.status as ProjectStatus } : {}),
    };

    const [totalProjects, projectsByStatusRaw, projects] = await Promise.all([
      prisma.project.count({ where }),
      prisma.project.groupBy({ by: ['status'], where, _count: { _all: true } }),
      prisma.project.findMany({
        where,
        include: {
          customer: { select: { firstName: true, lastName: true } },
          moderator: { select: { firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const projectRows: ProjectReportRow[] = projects.map((project) => {
      const row: ProjectReportRow = {
        id: project.id,
        name: project.name,
        customerId: project.customerId,
        customerName: `${project.customer.firstName} ${project.customer.lastName}`,
        moderatorId: project.moderatorId,
        moderatorName: project.moderator ? `${project.moderator.firstName} ${project.moderator.lastName}` : null,
        status: project.status,
        startDate: project.startDate,
        endDate: project.endDate,
        createdAt: project.createdAt,
      };
      if (role === UserRole.OWNER) {
        row.budget = project.budget !== null ? Number(project.budget) : undefined;
      }
      return row;
    });

    const summary: ProjectsReport['summary'] = { totalProjects, projectsByStatus: toStatusBreakdown(projectsByStatusRaw) };
    if (role === UserRole.OWNER) {
      const budgetAgg = await prisma.project.aggregate({
        where: { ...where, budget: { not: null } },
        _sum: { budget: true },
        _avg: { budget: true },
      });
      summary.totalBudget = Number(budgetAgg._sum.budget ?? 0);
      summary.averageBudget = Number(budgetAgg._avg.budget ?? 0);
    }

    return { summary, projects: projectRows, pagination: paginationMeta(page, limit, totalProjects) };
  }
}

export const reportsService = new ReportsService();
