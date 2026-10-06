import type { OrderStatus } from '@prisma/client';

/** The three dashboard widgets a cycle archive freezes. */
export const ARCHIVED_METRIC_TYPES = ['REVENUE_OVER_TIME', 'PRODUCT_DEMAND', 'ORDERS_BY_STATUS'] as const;
export type ArchivedMetricType = (typeof ARCHIVED_METRIC_TYPES)[number];

/** One Philippine calendar day of the cycle. `grossRevenue` is OWNER-only. */
export interface RevenueDay {
  date: string;
  grossRevenue?: number;
  /** Non-cancelled orders placed that day (the ones counted in grossRevenue). */
  ordersCount: number;
  /** Orders placed that day that are now DELIVERED. */
  completedOrdersCount: number;
}

/** Units and value of one product across the cycle's non-cancelled orders. `totalRevenue` is OWNER-only. */
export interface ProductDemandRow {
  productId: string;
  productName: string;
  sku: string;
  unitsSold: number;
  totalRevenue?: number;
}

export interface OrderStatusShare {
  status: OrderStatus;
  count: number;
  /** Share of all orders placed in the cycle, one decimal (e.g. 58.3). */
  percentage: number;
}

export interface CycleMetrics {
  revenueOverTime: RevenueDay[];
  productDemand: ProductDemandRow[];
  ordersByStatus: OrderStatusShare[];
  /** OWNER-only. */
  totalGrossRevenue?: number;
  totalOrdersCount: number;
}

/** The live dashboard's cycle: it began at `startTimestamp` and is archived after `endTimestamp`. */
export interface CurrentCycle extends CycleMetrics {
  cycleNumber: number;
  startTimestamp: string;
  endTimestamp: string;
}

/** A row of the owner's Archives table (the per-day data is in the detail and the Excel record). */
export interface ArchiveSummary {
  id: string;
  cycleNumber: number;
  cycleTitle: string;
  metricTypesIncluded: ArchivedMetricType[];
  startTimestamp: string;
  endTimestamp: string;
  archivedAt: string;
  totalGrossRevenue: number;
  totalOrdersCount: number;
}

/** One archived cycle with its frozen widget data, for viewing it on the dashboard. */
export interface ArchiveDetail extends ArchiveSummary {
  revenueOverTime: RevenueDay[];
  productDemand: ProductDemandRow[];
  ordersByStatus: OrderStatusShare[];
}
