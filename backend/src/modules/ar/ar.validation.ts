import { z } from 'zod';

const NUMERIC_STRING = /^\d+$/;
const DATE_STRING = /^\d{4}-\d{2}-\d{2}$/;

const positiveDimension = (fieldName: string) =>
  z
    .number({ invalid_type_error: `${fieldName} must be a number.` })
    .positive(`${fieldName} must be greater than 0.`)
    .max(1000, `${fieldName} is unrealistically large.`);

export const createMeasurementSchema = z.object({
  body: z.object({
    label: z.string().trim().max(150, 'Label is too long.').optional(),
    width: positiveDimension('width'),
    height: positiveDimension('height'),
    depth: positiveDimension('depth').optional(),
    unit: z.string().trim().max(20, 'Unit is too long.').optional(),
    imageUrl: z.string().trim().url('Please provide a valid image URL.').optional(),
    arDataUrl: z.string().trim().url('Please provide a valid AR data URL.').optional(),
  }),
});

export const updateMeasurementSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid measurement id.') }),
  body: z
    .object({
      label: z.string().trim().max(150, 'Label is too long.').optional(),
      width: positiveDimension('width').optional(),
      height: positiveDimension('height').optional(),
      depth: positiveDimension('depth').optional(),
      unit: z.string().trim().max(20, 'Unit is too long.').optional(),
      imageUrl: z.string().trim().url('Please provide a valid image URL.').optional(),
      arDataUrl: z.string().trim().url('Please provide a valid AR data URL.').optional(),
    })
    .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided.' }),
});

export const idParamsSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid measurement id.') }),
});

export const listMeasurementsSchema = z.object({
  query: z.object({
    page: z.string().regex(NUMERIC_STRING, 'page must be a positive integer.').optional(),
    limit: z.string().regex(NUMERIC_STRING, 'limit must be a positive integer.').optional(),
    customerId: z.string().uuid('Invalid customer id.').optional(),
    dateFrom: z.string().regex(DATE_STRING, 'dateFrom must be in YYYY-MM-DD format.').optional(),
    dateTo: z.string().regex(DATE_STRING, 'dateTo must be in YYYY-MM-DD format.').optional(),
    search: z.string().trim().min(1, 'Search query cannot be empty.').max(150, 'Search query is too long.').optional(),
  }),
});

export const estimatePanelsSchema = z.object({
  body: z
    .object({
      productId: z.string().uuid('Invalid product id.'),
      measurementId: z.string().uuid('Invalid measurement id.').optional(),
      width: positiveDimension('width').optional(),
      height: positiveDimension('height').optional(),
    })
    .refine((data) => Boolean(data.measurementId) || (data.width !== undefined && data.height !== undefined), {
      message: 'Provide either measurementId, or both width and height.',
    }),
});

export type CreateMeasurementInput = z.infer<typeof createMeasurementSchema>['body'];
export type UpdateMeasurementInput = z.infer<typeof updateMeasurementSchema>['body'];
export type EstimatePanelsInput = z.infer<typeof estimatePanelsSchema>['body'];
