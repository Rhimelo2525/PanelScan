import { z } from 'zod';

import { isValidPhilippinePhone } from '../delivery/utils/phone-normalizer';

// Loose Philippines bounding box - the same sanity check order.validation.ts
// and delivery.validation.ts apply to a map pin (catches swapped lat/lng or
// a pin left at an obviously wrong spot), not a precise border.
const latitudeSchema = z.coerce
  .number({ invalid_type_error: 'Pin your location on the map.', required_error: 'Pin your location on the map.' })
  .min(4.5, 'The pinned location is outside the Philippines.')
  .max(21.5, 'The pinned location is outside the Philippines.');
const longitudeSchema = z.coerce
  .number({ invalid_type_error: 'Pin your location on the map.', required_error: 'Pin your location on the map.' })
  .min(116, 'The pinned location is outside the Philippines.')
  .max(127, 'The pinned location is outside the Philippines.');

const addressBodySchema = z.object({
  label: z.string().trim().max(30, 'Label must be 30 characters or fewer.').nullable().optional(),
  recipientName: z.string().trim().min(2, "Enter the recipient's full name.").max(100, 'Recipient name must be 100 characters or fewer.'),
  recipientPhone: z
    .string()
    .trim()
    .refine((value) => isValidPhilippinePhone(value), 'Enter a valid Philippine mobile number (e.g. 0917 123 4567).'),
  addressLine1: z.string().trim().min(2, 'Enter the house/unit number, building, or street.').max(200, 'Street address must be 200 characters or fewer.'),
  regionCode: z.string().min(1, 'Select a region.'),
  regionName: z.string().min(1, 'Select a region.'),
  provinceCode: z.string().nullable().optional(),
  provinceName: z.string().nullable().optional(),
  cityMunicipalityCode: z.string().min(1, 'Select a city or municipality.'),
  cityMunicipalityName: z.string().min(1, 'Select a city or municipality.'),
  barangayCode: z.string().min(1, 'Select a barangay.'),
  barangayName: z.string().min(1, 'Select a barangay.'),
  postalCode: z.string().trim().min(3, 'Enter a valid postal code.').max(10, 'Enter a valid postal code.'),
  // Required: a saved address cannot exist without the customer's own confirmed map pin.
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  isDefault: z.boolean().optional(),
});

const idParams = z.object({ id: z.string().uuid('Invalid address id.') });

export const createAddressSchema = z.object({ body: addressBodySchema });

export const updateAddressSchema = z.object({ params: idParams, body: addressBodySchema });

export const addressIdParamsSchema = z.object({ params: idParams });

export const reverseGeocodeSchema = z.object({
  query: z.object({ latitude: latitudeSchema, longitude: longitudeSchema }),
});

export type AddressInput = z.infer<typeof addressBodySchema>;
