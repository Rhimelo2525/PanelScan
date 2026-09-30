import { z } from 'zod';

import { personNameSchema } from '../../utils/nameSchema';
import { optionalPhilippinePhoneSchema, philippinePhoneSchema } from '../../utils/phoneSchema';

const NUMERIC_STRING = /^\d+$/;

export const createInstallerSchema = z.object({
  body: z.object({
    firstName: personNameSchema('First name'),
    lastName: personNameSchema('Last name'),
    email: z.string().trim().toLowerCase().email('Please provide a valid email address.').optional(),
    phone: philippinePhoneSchema,
    specialty: z.string().trim().max(100, 'Specialty is too long.').optional(),
  }),
});

export const updateInstallerSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid installer id.') }),
  body: z
    .object({
      firstName: personNameSchema('First name').optional(),
      lastName: personNameSchema('Last name').optional(),
      phone: optionalPhilippinePhoneSchema,
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
