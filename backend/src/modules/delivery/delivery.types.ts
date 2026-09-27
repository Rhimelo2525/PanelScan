import type { Prisma } from '@prisma/client';
export { DeliveryApprovalStatus } from '@prisma/client';

export const deliveryInclude = {
  // Everything the moderator needs to act on a delivery request from the
  // Deliveries page alone: customer contact, items, the product payment's
  // status, and deliveryLocation (address snapshot + map-pin coordinates).
  order: {
    select: {
      id: true,
      orderNumber: true,
      customerId: true,
      status: true,
      deliveryLocation: true,
      shippingAddress: true,
      subtotal: true,
      totalAmount: true,
      moderatorApproved: true,
      createdAt: true,
      customer: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      items: { select: { id: true, productName: true, quantity: true, unitPrice: true, lineTotal: true }, orderBy: { createdAt: 'asc' } },
      payment: { select: { status: true, method: true, amount: true, paidAt: true } },
    },
  },
  // The delivery-fee charge (separate from the product Payment) - carried on
  // every Delivery read so the frontend can gate its own "Book vehicle"
  // button on deliveryPayment.status without a second round trip. See
  // delivery.service.ts's DELIVERY-FEE PAYMENT section.
  deliveryPayment: true,
} satisfies Prisma.DeliveryInclude;

export type DeliveryWithOrder = Prisma.DeliveryGetPayload<{ include: typeof deliveryInclude }>;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const DELIVERY_STATE_FILTERS = ['requested', 'to_book', 'active', 'completed', 'cancelled'] as const;
export type DeliveryStateFilter = (typeof DELIVERY_STATE_FILTERS)[number];

export interface DeliveryFilters {
  page?: number;
  limit?: number;
  customerId?: string;
  search?: string;
  status?: 'scheduled' | 'delivered';
  // Admin dashboard grouping (see utils/lalamove-status.ts) - independent of
  // `status` above so existing scheduled/delivered filtering is unaffected.
  // "requested" and "to_book" are the moderator's own work queues: requests
  // awaiting approval, and approved requests not yet booked with Lalamove.
  deliveryState?: DeliveryStateFilter;
  sortBy?: 'scheduledDate' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedDeliveries {
  deliveries: DeliveryWithOrder[];
  pagination: PaginationMeta;
}
