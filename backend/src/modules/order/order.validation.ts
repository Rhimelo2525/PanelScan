import { OrderStatus } from '@prisma/client';
import { z } from 'zod';

const NUMERIC_STRING = /^\d+$/;

export const deliveryLocationSchema = z.object({
  addressLine1: z.string().trim().min(2, 'Street, building, or unit must be at least 2 characters.').max(200),
  regionCode: z.string().min(1, 'Region is required.'),
  regionName: z.string().min(1, 'Region name is required.'),
  provinceCode: z.string().nullable().optional(),
  provinceName: z.string().nullable().optional(),
  cityMunicipalityCode: z.string().min(1, 'City/Municipality is required.'),
  cityMunicipalityName: z.string().min(1, 'City/Municipality name is required.'),
  barangayCode: z.string().min(1, 'Barangay is required.'),
  barangayName: z.string().min(1, 'Barangay name is required.'),
  postalCode: z.string().trim().min(3, 'Postal code must be at least 3 digits.').max(10),
  recipientName: z.string().trim().optional(),
  recipientPhone: z.string().trim().optional(),
  // Loose Philippines bounding box (same as delivery.validation.ts's
  // setDeliveryCoordinatesSchema) - not a precise border, just a sanity
  // check against an obviously wrong value from the customer's map pin
  // (e.g. lat/lng swapped, or the map somehow left at its default center).
  latitude: z.number().min(4.5, 'Latitude is outside the Philippines.').max(21.5, 'Latitude is outside the Philippines.').nullable().optional(),
  longitude: z.number().min(116, 'Longitude is outside the Philippines.').max(127, 'Longitude is outside the Philippines.').nullable().optional(),
  geocodingStatus: z.enum(['pending', 'completed', 'failed', 'not_required']).optional(),
});

export const orderInstallationSchema = z.object({
  scheduledDate: z.coerce
    .date({ errorMap: () => ({ message: 'A valid preferred installation date is required.' }) })
    .refine((date) => date.getTime() > Date.now(), { message: 'Preferred installation date must be in the future.' }),
  address: z
    .string()
    .trim()
    .min(10, 'Installation address must be at least 10 characters.')
    .max(500, 'Installation address is too long.'),
  notes: z.string().trim().max(1000, 'Installation notes are too long.').optional(),
});

export const directOrderItemSchema = z.object({
  productId: z.string().uuid('Invalid product id.'),
  quantity: z.number().int().positive('Quantity must be at least 1.'),
});

export const createOrderSchema = z.object({
  body: z
    .object({
      shippingAddress: z
        .string()
        .trim()
        .min(10, 'Shipping address must be at least 10 characters.')
        .max(500, 'Shipping address is too long.')
        .optional(),
      deliveryLocation: deliveryLocationSchema.optional(),
      notes: z.string().trim().max(1000, 'Notes are too long.').optional(),
      installation: orderInstallationSchema.optional(),
      selectedItemIds: z.array(z.string().uuid('Invalid item id.')).min(1).optional(),
      selectedProductIds: z.array(z.string().uuid('Invalid product id.')).min(1).optional(),
      directItem: directOrderItemSchema.optional(),
    })
    .refine((data) => Boolean(data.shippingAddress || data.deliveryLocation), {
      message: 'Either shippingAddress or deliveryLocation must be provided.',
      path: ['shippingAddress'],
    }),
});

export const idParamsSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid order id.') }),
});

export const listOrdersSchema = z.object({
  query: z.object({
    page: z.string().regex(NUMERIC_STRING, 'page must be a positive integer.').optional(),
    limit: z.string().regex(NUMERIC_STRING, 'limit must be a positive integer.').optional(),
    status: z.nativeEnum(OrderStatus).optional(),
  }),
});

export const updateOrderStatusSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid order id.') }),
  body: z.object({
    status: z.nativeEnum(OrderStatus, { errorMap: () => ({ message: 'Invalid order status.' }) }),
  }),
});

export type DeliveryLocationInput = z.infer<typeof deliveryLocationSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>['body'];
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>['body'];
