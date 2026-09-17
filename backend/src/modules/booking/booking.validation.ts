import { BookingStatus } from '@prisma/client';
import { z } from 'zod';

const NUMERIC_STRING = /^\d+$/;

export const createBookingSchema = z.object({
  body: z.object({
    scheduledDate: z.coerce
      .date({ errorMap: () => ({ message: 'A valid scheduledDate is required.' }) })
      .refine((date) => date.getTime() > Date.now(), { message: 'scheduledDate must be in the future.' }),
    address: z.string().trim().min(10, 'Address must be at least 10 characters.').max(500, 'Address is too long.'),
    notes: z.string().trim().max(1000, 'Notes are too long.').optional(),
  }),
});

export const idParamsSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid booking id.') }),
});

export const updateBookingStatusSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid booking id.') }),
  body: z.object({
    status: z.nativeEnum(BookingStatus, { errorMap: () => ({ message: 'Invalid booking status.' }) }),
  }),
});

export const assignInstallerSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid booking id.') }),
  body: z.object({
    installerId: z.string().uuid('Invalid installer id.'),
  }),
});

export const listBookingsSchema = z.object({
  query: z.object({
    page: z.string().regex(NUMERIC_STRING, 'page must be a positive integer.').optional(),
    limit: z.string().regex(NUMERIC_STRING, 'limit must be a positive integer.').optional(),
    status: z.nativeEnum(BookingStatus).optional(),
  }),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>['body'];
