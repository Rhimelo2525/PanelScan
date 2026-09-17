import type { Prisma } from '@prisma/client';

export const feedbackInclude = {
  customer: { select: { id: true, firstName: true, lastName: true, email: true } },
  order: { select: { id: true, orderNumber: true, status: true } },
} satisfies Prisma.FeedbackInclude;

export type FeedbackWithRelations = Prisma.FeedbackGetPayload<{ include: typeof feedbackInclude }>;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface FeedbackFilters {
  page?: number;
  limit?: number;
  rating?: number;
  customerId?: string;
  orderId?: string;
  productId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  sort?: 'asc' | 'desc';
  search?: string;
}

export interface PaginatedFeedback {
  feedbacks: FeedbackWithRelations[];
  pagination: PaginationMeta;
}
