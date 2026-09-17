import type { Category } from '@prisma/client';

import { prisma } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { slugify } from '../../utils/slugify';
import type { CreateCategoryInput, UpdateCategoryInput } from './category.validation';

export class CategoryService {
  async createCategory(input: CreateCategoryInput): Promise<Category> {
    const slug = input.slug ?? slugify(input.name);

    const conflict = await prisma.category.findFirst({ where: { OR: [{ name: input.name }, { slug }] } });
    if (conflict) {
      throw new AppError('A category with this name or slug already exists.', 409);
    }

    return prisma.category.create({
      data: {
        name: input.name,
        slug,
        description: input.description,
        imageUrl: input.imageUrl,
      },
    });
  }

  async getAllCategories(): Promise<Category[]> {
    return prisma.category.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }

  async getCategoryById(id: string): Promise<Category> {
    const category = await prisma.category.findFirst({ where: { id, isActive: true } });
    if (!category) {
      throw new AppError('Category not found.', 404);
    }
    return category;
  }

  async updateCategory(id: string, input: UpdateCategoryInput): Promise<Category> {
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Category not found.', 404);
    }

    if (input.name || input.slug) {
      const conflict = await prisma.category.findFirst({
        where: {
          id: { not: id },
          OR: [...(input.name ? [{ name: input.name }] : []), ...(input.slug ? [{ slug: input.slug }] : [])],
        },
      });
      if (conflict) {
        throw new AppError('A category with this name or slug already exists.', 409);
      }
    }

    return prisma.category.update({ where: { id }, data: input });
  }

  async softDeleteCategory(id: string): Promise<Category> {
    const existing = await prisma.category.findUnique({ where: { id } });
    if (!existing) {
      throw new AppError('Category not found.', 404);
    }

    return prisma.category.update({ where: { id }, data: { isActive: false } });
  }
}

export const categoryService = new CategoryService();
