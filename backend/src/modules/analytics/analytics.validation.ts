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

export const salesAnalyticsSchema = z.object({
  query: z.object({ ...dateRangeQuery }),
});

export const productAnalyticsSchema = z.object({
  query: z.object({ ...dateRangeQuery, ...paginationQuery }),
});

export const customerAnalyticsSchema = z.object({
  query: z.object({ ...dateRangeQuery, ...paginationQuery }),
});

export const projectAnalyticsSchema = z.object({
  query: z.object({ ...dateRangeQuery, ...paginationQuery }),
});
