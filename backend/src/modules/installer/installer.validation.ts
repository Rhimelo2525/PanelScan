import { z } from 'zod';

const NUMERIC_STRING = /^\d+$/;
const PHONE_REGEX = /^\+?[0-9\s\-()]{7,20}$/;

export const createInstallerSchema = z.object({
  body: z.object({
    firstName: z.string().trim().min(2, 'First name must be at least 2 characters.').max(50, 'First name is too long.'),
    lastName: z.string().trim().min(2, 'Last name must be at least 2 characters.').max(50, 'Last name is too long.'),
    email: z.string().trim().toLowerCase().email('Please provide a valid email address.').optional(),
    phone: z.string().trim().regex(PHONE_REGEX, 'Please provide a valid phone number.'),
    specialty: z.string().trim().max(100, 'Specialty is too long.').optional(),
  }),
});

export const updateInstallerSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid installer id.') }),
  body: z
    .object({
      firstName: z.string().trim().min(2, 'First name must be at least 2 characters.').max(50).optional(),
      lastName: z.string().trim().min(2, 'Last name must be at least 2 characters.').max(50).optional(),
      phone: z.string().trim().regex(PHONE_REGEX, 'Please provide a valid phone number.').optional(),
      specialty: z.string().trim().max(100, 'Specialty is too long.').optional(),
      isActive: z.boolean().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided.' }),
});

export const idParamsSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid installer id.') }),
});

export const listInstallersSchema = z.object({
  query: z.object({
    page: z.string().regex(NUMERIC_STRING, 'page must be a positive integer.').optional(),
    limit: z.string().regex(NUMERIC_STRING, 'limit must be a positive integer.').optional(),
  }),
});

export type CreateInstallerInput = z.infer<typeof createInstallerSchema>['body'];
export type UpdateInstallerInput = z.infer<typeof updateInstallerSchema>['body'];
