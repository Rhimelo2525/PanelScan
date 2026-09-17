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

/** Row shape shared by /sales and /orders - `totalAmount` is omitted entirely for MODERATOR, never zeroed. */
export interface OrderReportRow {
  id: string;
  orderNumber: string;
  customerId: string;
  customerName: string;
  status: string;
  itemCount: number;
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
