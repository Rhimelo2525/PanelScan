import { z } from 'zod';

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const createCategorySchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(100, 'Name is too long.'),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(SLUG_REGEX, 'Slug may only contain lowercase letters, numbers, and hyphens.')
      .optional(),
    description: z.string().trim().max(1000, 'Description is too long.').optional(),
    imageUrl: z.string().trim().url('Please provide a valid image URL.').optional(),
  }),
});

export const updateCategorySchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid category id.') }),
  body: z
    .object({
      name: z.string().trim().min(2, 'Name must be at least 2 characters.').max(100, 'Name is too long.').optional(),
      slug: z
        .string()
        .trim()
        .toLowerCase()
        .regex(SLUG_REGEX, 'Slug may only contain lowercase letters, numbers, and hyphens.')
        .optional(),
      description: z.string().trim().max(1000, 'Description is too long.').optional(),
      imageUrl: z.string().trim().url('Please provide a valid image URL.').optional(),
      isActive: z.boolean().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, { message: 'At least one field must be provided.' }),
});

export const idParamsSchema = z.object({
  params: z.object({ id: z.string().uuid('Invalid category id.') }),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>['body'];
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>['body'];
