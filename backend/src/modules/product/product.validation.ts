import { z } from 'zod';

import { STOCK_QUANTITY_MAX, STOCK_QUANTITY_MESSAGE } from '../inventory/inventory.validation';

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const NUMERIC_STRING = /^\d+$/;
const DECIMAL_STRING = /^\d+(\.\d+)?$/;

/**
 * Panel dimensions are limited by how many digits they have, not by size: the
 * decimal point doesn't count, so width 2.9 and 99 are both 2 digits. Checked
 * on the number the API receives, written out in plain decimal form (an
 * exponent form such as 1e+21 is rejected rather than read as 3 digits).
 */
export const DIMENSION_DIGIT_LIMITS = { width: 2, height: 3, thickness: 2 } as const;
export type DimensionField = keyof typeof DIMENSION_DIGIT_LIMITS;

const DIMENSION_LABELS: Record<DimensionField, string> = { width: 'Width', height: 'Height', thickness: 'Thickness' };

export const dimensionDigitMessage = (field: DimensionField): string =>
  `${DIMENSION_LABELS[field]} can have at most ${DIMENSION_DIGIT_LIMITS[field]} digits.`;

export const hasAllowedDimensionDigits = (field: DimensionField, value: number): boolean => {
  const written = String(value);
  return /^\d+(\.\d+)?$/.test(written) && written.replace('.', '').length <= DIMENSION_DIGIT_LIMITS[field];
};

const dimensionSchema = (field: DimensionField) =>
  z
    .number()
    .positive(`${DIMENSION_LABELS[field]} must be greater than 0.`)
    .refine((value) => hasAllowedDimensionDigits(field, value), dimensionDigitMessage(field));

/**
 * Prices are limited to 5 digits of whole pesos plus up to 2 centavo digits
 * (at most 99,999.99). Checked on the number written out in plain decimal
 * form, so an exponent form such as 1e+21 is rejected.
 */
export const PRICE_MESSAGE = 'Price can have at most 5 digits (up to 99,999.99), with no more than 2 decimal places.';

export const hasAllowedPriceDigits = (value: number): boolean => /^[0-9]{1,5}([.][0-9]{1,2})?$/.test(String(value));

const priceSchema = z.number().positive('Price must be greater than 0.').refine(hasAllowedPriceDigits, PRICE_MESSAGE);

const productImageSchema = z.object({
  url: z.string().trim().url('Please provide a valid image URL.'),
  altText: z.string().trim().max(200, 'Alt text is too long.').optional(),
  isPrimary: z.boolean().optional(),
  sortOrder: z.number().int('Sort order must be a whole number.').min(0).optional(),
});

export const createProductSchema = z.object({
  body: z.object({
    categoryId: z.string().uuid('Invalid category id.'),
    name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(150, 'Name is too long.'),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(SLUG_REGEX, 'Slug may only contain lowercase letters, numbers, and hyphens.')
      .optional(),
    description: z.string().trim().max(2000, 'Description is too long.').optional(),
    sku: z.string().trim().min(2, 'SKU must be at least 2 characters.').max(50, 'SKU is too long.'),
    price: priceSchema,
    width: dimensionSchema('width').optional(),
    height: dimensionSchema('height').optional(),
    thickness: dimensionSchema('thickness').optional(),
    unit: z.string().trim().max(20, 'Unit is too long.').optional(),
    material: z.string().trim().max(100, 'Material is too long.').optional(),
    isActive: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
    stock: z.number().int('Stock must be an integer.').min(0, 'Stock cannot be negative.').max(STOCK_QUANTITY_MAX, STOCK_QUANTITY_MESSAGE).optional(),
    reorderLevel: z.number().int('Reorder level must be an integer.').min(0, 'Reorder level cannot be negative.').max(STOCK_QUANTITY_MAX, STOCK_QUANTITY_MESSAGE).optional(),
    images: z.array(productImageSchema).max(10, 'A product can have at most 10 images.').optional(),
  }),
});

export const updateProductSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid product id.') }),
  body: z
    .object({
      categoryId: z.string().uuid('Invalid category id.').optional(),
      name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(150, 'Name is too long.').optional(),
      slug: z
        .string()
        .trim()
        .toLowerCase()
        .regex(SLUG_REGEX, 'Slug may only contain lowercase letters, numbers, and hyphens.')
        .optional(),
      description: z.string().trim().max(2000, 'Description is too long.').optional(),
      sku: z.string().trim().min(2, 'SKU must be at least 2 characters.').max(50, 'SKU is too long.').optional(),
      price: priceSchema.optional(),
      width: dimensionSchema('width').optional(),
      height: dimensionSchema('height').optional(),
      thickness: dimensionSchema('thickness').optional(),
      unit: z.string().trim().max(20, 'Unit is too long.').optional(),
      material: z.string().trim().max(100, 'Material is too long.').optional(),
      isFeatured: z.boolean().optional(),
      isActive: z.boolean().optional(),
      stock: z.number().int('Stock must be an integer.').min(0, 'Stock cannot be negative.').max(STOCK_QUANTITY_MAX, STOCK_QUANTITY_MESSAGE).optional(),
      reorderLevel: z.number().int('Reorder level must be an integer.').min(0, 'Reorder level cannot be negative.').max(STOCK_QUANTITY_MAX, STOCK_QUANTITY_MESSAGE).optional(),
      images: z.array(productImageSchema).max(10, 'A product can have at most 10 images.').optional(),
    })
    .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided.' }),
});

export const idParamsSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid product id.') }),
});

export const categoryParamsSchema = z.object({
  params: z.object({ categoryId: z.string().uuid('Invalid category id.') }),
});

const listQueryObject = z.object({
  page: z.string().regex(NUMERIC_STRING, 'page must be a positive integer.').optional(),
  limit: z.string().regex(NUMERIC_STRING, 'limit must be a positive integer.').optional(),
  search: z.string().trim().min(1).max(150).optional(),
  categoryId: z.string().uuid('Invalid category id.').optional(),
  isFeatured: z.enum(['true', 'false']).optional(),
  minPrice: z.string().regex(DECIMAL_STRING, 'minPrice must be a positive number.').optional(),
  maxPrice: z.string().regex(DECIMAL_STRING, 'maxPrice must be a positive number.').optional(),
  sortBy: z.enum(['price', 'name', 'createdAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export const listProductsSchema = z.object({ query: listQueryObject });

export const featuredProductsSchema = z.object({
  query: listQueryObject.pick({ limit: true }),
});

export const searchProductsSchema = z.object({
  query: listQueryObject.extend({ search: z.string().trim().min(1, 'A search query is required.').max(150) }),
});

export const categoryProductsSchema = z.object({
  params: z.object({ categoryId: z.string().uuid('Invalid category id.') }),
  query: listQueryObject.omit({ categoryId: true }),
});

export type CreateProductInput = z.infer<typeof createProductSchema>['body'];
export type UpdateProductInput = z.infer<typeof updateProductSchema>['body'];
