import { z } from 'zod';

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const NUMERIC_STRING = /^\d+$/;
const DECIMAL_STRING = /^\d+(\.\d+)?$/;

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
    price: z.number().positive('Price must be greater than 0.'),
    width: z.number().positive('Width must be greater than 0.').optional(),
    height: z.number().positive('Height must be greater than 0.').optional(),
    thickness: z.number().positive('Thickness must be greater than 0.').optional(),
    unit: z.string().trim().max(20, 'Unit is too long.').optional(),
    material: z.string().trim().max(100, 'Material is too long.').optional(),
    isFeatured: z.boolean().optional(),
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
      price: z.number().positive('Price must be greater than 0.').optional(),
      width: z.number().positive('Width must be greater than 0.').optional(),
      height: z.number().positive('Height must be greater than 0.').optional(),
      thickness: z.number().positive('Thickness must be greater than 0.').optional(),
      unit: z.string().trim().max(20, 'Unit is too long.').optional(),
      material: z.string().trim().max(100, 'Material is too long.').optional(),
      isFeatured: z.boolean().optional(),
      isActive: z.boolean().optional(),
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
