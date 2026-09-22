import type { Prisma } from '@prisma/client';
export { DeliveryApprovalStatus } from '@prisma/client';

export const deliveryInclude = {
  // deliveryLocation carries the geocoding outcome (coordinates/status) the
  // admin deliveries UI needs to show staff whether a manual coordinate fix
  // is required - see setDeliveryCoordinates in delivery.service.ts.
  order: { select: { id: true, orderNumber: true, customerId: true, status: true, deliveryLocation: true } },
} satisfies Prisma.DeliveryInclude;

export type DeliveryWithOrder = Prisma.DeliveryGetPayload<{ include: typeof deliveryInclude }>;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface DeliveryFilters {
  page?: number;
  limit?: number;
  customerId?: string;
  search?: string;
  status?: 'scheduled' | 'delivered';
  // Admin dashboard grouping, based on the live Lalamove deliveryStatus
  // rather than deliveredAt (see utils/lalamove-status.ts) - independent of
  // `status` above so existing scheduled/delivered filtering is unaffected.
  deliveryState?: 'active' | 'completed' | 'cancelled';
  sortBy?: 'scheduledDate' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedDeliveries {
  deliveries: DeliveryWithOrder[];
  pagination: PaginationMeta;
}
