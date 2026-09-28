import type { Prisma } from '@prisma/client';
export { DeliveryApprovalStatus } from '@prisma/client';

export const deliveryInclude = {
  // Everything the moderator needs to act on a delivery from the Deliveries
  // page alone: customer contact, items, subtotal + estimated shipping fee +
  // total, the order's PayMongo payment, and deliveryLocation (address
  // snapshot + map-pin coordinates).
  order: {
    select: {
      id: true,
      orderNumber: true,
      customerId: true,
      status: true,
      deliveryLocation: true,
      shippingAddress: true,
      subtotal: true,
      shippingFee: true,
      totalAmount: true,
      moderatorApproved: true,
      createdAt: true,
      customer: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
      items: { select: { id: true, productName: true, quantity: true, unitPrice: true, lineTotal: true }, orderBy: { createdAt: 'asc' } },
      payment: { select: { status: true, method: true, amount: true, paidAt: true, transactionRef: true } },
    },
  },
  // A separate shipping-fee charge from before the fee became part of the
  // order payment - historical records only (see delivery.service.ts).
  deliveryPayment: true,
} satisfies Prisma.DeliveryInclude;

export type DeliveryWithOrder = Prisma.DeliveryGetPayload<{ include: typeof deliveryInclude }>;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export const DELIVERY_STATE_FILTERS = ['awaiting_approval', 'awaiting_quote', 'awaiting_payment', 'to_book', 'active', 'completed', 'cancelled'] as const;
export type DeliveryStateFilter = (typeof DELIVERY_STATE_FILTERS)[number];

export interface DeliveryFilters {
  page?: number;
  limit?: number;
  customerId?: string;
  search?: string;
  status?: 'scheduled' | 'delivered';
  // Admin dashboard grouping (see utils/lalamove-status.ts) - independent of
  // `status` above so existing scheduled/delivered filtering is unaffected.
  // The awaiting_* states and "to_book" are the moderator's work queues,
  // one per workflow stage; "to_book" = paid and not booked with Lalamove yet.
  deliveryState?: DeliveryStateFilter;
  sortBy?: 'scheduledDate' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedDeliveries {
  deliveries: DeliveryWithOrder[];
  pagination: PaginationMeta;
}
