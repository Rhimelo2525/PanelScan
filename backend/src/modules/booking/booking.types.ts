import type { BookingStatus, Prisma } from '@prisma/client';

export const bookingInclude = {
  customer: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
  installer: { select: { id: true, firstName: true, lastName: true, email: true, phone: true, specialty: true, isActive: true } },
  order: {
    select: {
      id: true,
      orderNumber: true,
      status: true,
      totalAmount: true,
      createdAt: true,
      items: {
        select: {
          id: true,
          productId: true,
          productName: true,
          quantity: true,
          unitPrice: true,
          lineTotal: true,
        },
      },
    },
  },
} satisfies Prisma.BookingInclude;

export type BookingWithRelations = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

export interface BookingFilters {
  page?: number;
  limit?: number;
  status?: BookingStatus;
  onlyOrders?: boolean;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedBookings {
  bookings: BookingWithRelations[];
  pagination: PaginationMeta;
}
