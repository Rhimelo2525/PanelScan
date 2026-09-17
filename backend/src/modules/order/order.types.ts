import type { OrderStatus, Prisma } from '@prisma/client';

/**
 * Shared shape returned by every order read (list, details, create, cancel,
 * status update): order line items plus a lean customer summary, so a
 * MODERATOR/OWNER viewing an order can see who placed it without a second
 * request, and a CUSTOMER viewing their own order gets the same shape.
 */
export const orderInclude = {
  items: { orderBy: { createdAt: 'asc' } },
  customer: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
} satisfies Prisma.OrderInclude;

export type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export interface OrderFilters {
  page?: number;
  limit?: number;
  status?: OrderStatus;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedOrders {
  orders: OrderWithItems[];
  pagination: PaginationMeta;
}
