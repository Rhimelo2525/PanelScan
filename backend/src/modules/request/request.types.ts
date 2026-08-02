import type { Prisma, RequestStatus, RequestType } from '@prisma/client';

export const requestInclude = {
  requestedBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
  reviewedBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
} satisfies Prisma.RequestInclude;

export type RequestWithRelations = Prisma.RequestGetPayload<{ include: typeof requestInclude }>;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface RequestFilters {
  page?: number;
  limit?: number;
  status?: RequestStatus;
  type?: RequestType;
  requestedById?: string;
  reviewedById?: string;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
  sortBy?: 'title' | 'createdAt' | 'reviewedAt';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedRequests {
  requests: RequestWithRelations[];
  pagination: PaginationMeta;
}
