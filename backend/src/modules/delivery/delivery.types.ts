import type { Prisma } from '@prisma/client';

export const deliveryInclude = {
  order: { select: { id: true, orderNumber: true, customerId: true, status: true } },
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
  sortBy?: 'scheduledDate' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedDeliveries {
  deliveries: DeliveryWithOrder[];
  pagination: PaginationMeta;
}
