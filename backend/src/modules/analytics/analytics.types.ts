export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedListFilters {
  page?: number;
  limit?: number;
}

/** Shared by every endpoint that accepts a createdAt date range. */
export interface DateRangeFilters {
  dateFrom?: Date;
  dateTo?: Date;
}

export interface StatusBreakdown {
  status: string;
  count: number;
}

/**
 * OWNER sees every field. MODERATOR ("operational statistics only") never
 * sees totalRevenue/averageOrderValue/revenue - those fields are simply
 * omitted from the response rather than zeroed out, so a MODERATOR
 * response is never mistaken for "zero revenue."
 */
export interface DashboardStats {
  totalCustomers: number;
  totalActiveProducts: number;
  lowStockCount: number;
  totalOrders: number;
  ordersByStatus: StatusBreakdown[];
  totalBookings: number;
  bookingsByStatus: StatusBreakdown[];
  totalProjects: number;
  projectsByStatus: StatusBreakdown[];
  pendingRequests: number;
  averageFeedbackRating: number | null;
  totalRevenue?: number;
  averageOrderValue?: number;
}

export interface SalesStats {
  totalOrders: number;
  ordersByStatus: StatusBreakdown[];
  totalRevenue?: number;
  averageOrderValue?: number;
  revenueByStatus?: Array<{ status: string; count: number; revenue: number }>;
}

export interface TopProduct {
  productId: string;
  name: string;
  sku: string;
  quantitySold: number;
  revenue?: number;
}

export interface ProductStats {
  totalActiveProducts: number;
  lowStockCount: number;
  topProducts: TopProduct[];
  pagination: PaginationMeta;
  totalInventoryValue?: number;
}

export interface TopCustomer {
  customerId: string;
  name: string;
  orderCount: number;
  totalSpent: number;
}

export interface CustomerStats {
  totalCustomers: number;
  activeCustomers: number;
  newCustomers: number;
  repeatCustomers: number;
  topCustomers?: TopCustomer[];
  pagination?: PaginationMeta;
}

export interface ModeratorWorkload {
  moderatorId: string;
  name: string;
  activeProjectCount: number;
}

export interface ProjectStats {
  totalProjects: number;
  projectsByStatus: StatusBreakdown[];
  unassignedProjects: number;
  averageDurationDays: number | null;
  moderatorWorkload: ModeratorWorkload[];
  pagination: PaginationMeta;
  totalBudget?: number;
  averageBudget?: number;
}
