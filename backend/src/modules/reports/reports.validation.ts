import { BookingStatus, OrderStatus, ProjectStatus } from '@prisma/client';
import { z } from 'zod';

const NUMERIC_STRING = /^\d+$/;
const DATE_STRING = /^\d{4}-\d{2}-\d{2}$/;

const dateRangeQuery = {
  dateFrom: z.string().regex(DATE_STRING, 'dateFrom must be in YYYY-MM-DD format.').optional(),
  dateTo: z.string().regex(DATE_STRING, 'dateTo must be in YYYY-MM-DD format.').optional(),
};

const paginationQuery = {
  page: z.string().regex(NUMERIC_STRING, 'page must be a positive integer.').optional(),
  limit: z.string().regex(NUMERIC_STRING, 'limit must be a positive integer.').optional(),
};

export const salesReportSchema = z.object({
  query: z.object({ ...dateRangeQuery, ...paginationQuery }),
});

export const inventoryReportSchema = z.object({
  query: z.object({ ...dateRangeQuery, ...paginationQuery }),
});

export const ordersReportSchema = z.object({
  query: z.object({
    ...dateRangeQuery,
    ...paginationQuery,
    status: z.nativeEnum(OrderStatus, { errorMap: () => ({ message: 'Invalid order status.' }) }).optional(),
  }),
});

export const bookingsReportSchema = z.object({
  query: z.object({
    ...dateRangeQuery,
    ...paginationQuery,
    status: z.nativeEnum(BookingStatus, { errorMap: () => ({ message: 'Invalid booking status.' }) }).optional(),
  }),
});

export const projectsReportSchema = z.object({
  query: z.object({
    ...dateRangeQuery,
    ...paginationQuery,
    status: z.nativeEnum(ProjectStatus, { errorMap: () => ({ message: 'Invalid project status.' }) }).optional(),
  }),
});
