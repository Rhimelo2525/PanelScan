import { z } from 'zod';

import { PHILIPPINE_PHONE_MESSAGE, parsePhilippinePhone } from '../modules/delivery/utils/phone-normalizer';

/**
 * The one contact-number rule for every API field: +63 followed by exactly 10
 * digits (see parsePhilippinePhone). Valid input is stored as "+639XXXXXXXXX".
 */
export const philippinePhoneSchema = z
  .string({ required_error: PHILIPPINE_PHONE_MESSAGE, invalid_type_error: PHILIPPINE_PHONE_MESSAGE })
  .trim()
  .refine((value) => parsePhilippinePhone(value) !== null, PHILIPPINE_PHONE_MESSAGE)
  .transform((value) => parsePhilippinePhone(value) as string);

/** Optional variant: a missing or blank value means "not provided". */
export const optionalPhilippinePhoneSchema = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  philippinePhoneSchema.optional(),
);
