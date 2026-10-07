import type { OrderStatus, Prisma } from '@prisma/client';

/**
 * Shared shape returned by every order read (list, details, create, cancel,
 * status update): order line items plus a lean customer summary, so a
 * MODERATOR/OWNER viewing an order can see who placed it without a second
 * request, and a CUSTOMER viewing their own order gets the same shape.
 */
export const orderInclude = {
  // Each line's product thumbnail (primary image first) and category, for order lists.
  items: {
    orderBy: { createdAt: 'asc' },
    include: {
      product: {
        select: {
          images: { orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }], take: 1, select: { url: true, altText: true } },
          category: { select: { slug: true } },
        },
      },
    },
  },
  customer: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
  // The order's delivery record (created with the order): workflow stage, quote, vehicle, booking and tracking. deliveryPayment is a legacy separate shipping-fee charge.
  delivery: { include: { deliveryPayment: true } },
  booking: {
    include: {
      installer: { select: { id: true, firstName: true, lastName: true, phone: true, specialty: true } },
    },
  },
  feedback: true,
} satisfies Prisma.OrderInclude;

export type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export interface OrderFilters {
  page?: number;
  limit?: number;
  status?: OrderStatus;
  /** Matches the order number or any line's product name (case-insensitive). */
  search?: string;
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
