import type { DeliveryApprovalStatus, PaymentStatus } from '@prisma/client';

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface DateRangeFilters {
  dateFrom?: Date;
  dateTo?: Date;
}

export interface PaginatedListFilters {
  page?: number;
  limit?: number;
}

export interface StatusBreakdown {
  status: string;
  count: number;
}

/**
 * One order line, sourced from the OrderItem snapshot (productName/unitPrice
 * taken at purchase time, so a later product rename/reprice never changes a
 * historical order's display) plus the PRODUCT's current primary image
 * (order items don't snapshot images - see reports.service.ts#toOrderRow).
 * unitPrice/lineTotal follow the same OWNER/MODERATOR field-hiding rule as
 * totalAmount below - omitted entirely wherever totalAmount is.
 */
export interface OrderReportItem {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  productImage: { url: string; altText: string | null } | null;
  unitPrice?: number;
  lineTotal?: number;
}

/** Row shape shared by /sales and /orders. */
export interface OrderReportRow {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  status: string;
  moderatorApproved: boolean;
  isPaid?: boolean;
  paymentStatus?: PaymentStatus;
  shippingAddress: string;
  deliveryStatus?: string | null;
  deliveryApprovalStatus?: DeliveryApprovalStatus;
  deliveryRequestedAt?: Date | null;
  deliveryApprovedAt?: Date | null;
  deliveryDeclinedAt?: Date | null;
  deliveryDeclineReason?: string | null;
  itemCount: number;
  items: OrderReportItem[];
  createdAt: Date;
  totalAmount?: number;
}

export interface SalesReportSummary {
  totalOrders: number;
  ordersByStatus: StatusBreakdown[];
  totalRevenue?: number;
  averageOrderValue?: number;
}

export interface SalesReport {
  summary: SalesReportSummary;
  orders: OrderReportRow[];
  pagination: PaginationMeta;
}

export interface OrderStatusFilter extends DateRangeFilters, PaginatedListFilters {
  status?: string;
}

export interface OrdersReportSummary {
  totalOrders: number;
  ordersByStatus: StatusBreakdown[];
}

export interface OrdersReport {
  summary: OrdersReportSummary;
  orders: OrderReportRow[];
  pagination: PaginationMeta;
}

/** `unitPrice` is omitted entirely for MODERATOR. */
export interface InventoryReportRow {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  reservedQty: number;
  available: number;
  reorderLevel: number;
  isLowStock: boolean;
  lastRestockedAt: Date | null;
  unitPrice?: number;
}

export interface InventoryReportSummary {
  totalItems: number;
  lowStockCount: number;
  totalInventoryValue?: number;
}

export interface InventoryReport {
  summary: InventoryReportSummary;
  inventory: InventoryReportRow[];
  pagination: PaginationMeta;
}

export interface BookingReportRow {
  id: string;
  customerId: string;
  customerName: string;
  installerId: string | null;
  installerName: string | null;
  status: string;
  scheduledDate: Date;
  address: string;
  createdAt: Date;
}

export interface BookingsReportSummary {
  totalBookings: number;
  bookingsByStatus: StatusBreakdown[];
}

/** No financial fields exist on Booking at all, so this report is identical for OWNER and MODERATOR. */
export interface BookingsReport {
  summary: BookingsReportSummary;
  bookings: BookingReportRow[];
  pagination: PaginationMeta;
}

/** `budget` is omitted entirely for MODERATOR. */
export interface ProjectReportRow {
  id: string;
  name: string;
  customerId: string;
  customerName: string;
  moderatorId: string | null;
  moderatorName: string | null;
  status: string;
  startDate: Date | null;
  endDate: Date | null;
  createdAt: Date;
  budget?: number;
}

export interface ProjectsReportSummary {
  totalProjects: number;
  projectsByStatus: StatusBreakdown[];
  totalBudget?: number;
  averageBudget?: number;
}

export interface ProjectsReport {
  summary: ProjectsReportSummary;
  projects: ProjectReportRow[];
  pagination: PaginationMeta;
}
