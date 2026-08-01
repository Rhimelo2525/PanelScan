import { Prisma } from '@prisma/client';

import { prisma } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { slugify } from '../../utils/slugify';
import type { CreateProductInput, UpdateProductInput } from './product.validation';

const productInclude = {
  category: { select: { id: true, name: true, slug: true } },
  images: { orderBy: { sortOrder: 'asc' } },
  inventory: { select: { quantity: true, reservedQty: true, reorderLevel: true } },
} satisfies Prisma.ProductInclude;

export type ProductWithRelations = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

export interface ProductFilters {
  page?: number;
  limit?: number;
  search?: string;
  categoryId?: string;
  isFeatured?: boolean;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: 'price' | 'name' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedProducts {
  products: ProductWithRelations[];
  pagination: PaginationMeta;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const DEFAULT_FEATURED_LIMIT = 8;

const buildOrderBy = (
  sortBy: ProductFilters['sortBy'],
  sortOrder: ProductFilters['sortOrder'],
): Prisma.ProductOrderByWithRelationInput => {
  const direction = sortOrder ?? 'desc';
  if (sortBy === 'price') return { price: direction };
  if (sortBy === 'name') return { name: direction };
  return { createdAt: direction };
};

export class ProductService {
  async getProducts(filters: ProductFilters): Promise<PaginatedProducts> {
    const page = filters.page ?? DEFAULT_PAGE;
    const limit = filters.limit ?? DEFAULT_LIMIT;

    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      isActive: true,
      ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
      ...(filters.isFeatured !== undefined ? { isFeatured: filters.isFeatured } : {}),
      ...(filters.search
        ? {
            OR: [
              { name: { contains: filters.search, mode: 'insensitive' } },
              { description: { contains: filters.search, mode: 'insensitive' } },
              { sku: { contains: filters.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(filters.minPrice !== undefined || filters.maxPrice !== undefined
        ? {
            price: {
              ...(filters.minPrice !== undefined ? { gte: filters.minPrice } : {}),
              ...(filters.maxPrice !== undefined ? { lte: filters.maxPrice } : {}),
            },
          }
        : {}),
    };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: buildOrderBy(filters.sortBy, filters.sortOrder),
        skip: (page - 1) * limit,
        take: limit,
        include: productInclude,
      }),
      prisma.product.count({ where }),
    ]);

    return {
      products,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async getFeaturedProducts(limit?: number): Promise<PaginatedProducts> {
    return this.getProducts({ isFeatured: true, limit: limit ?? DEFAULT_FEATURED_LIMIT });
  }

  async getProductsByCategory(categoryId: string, filters: ProductFilters): Promise<PaginatedProducts> {
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) {
      throw new AppError('Category not found.', 404);
    }
    return this.getProducts({ ...filters, categoryId });
  }

  async getProductById(id: string): Promise<ProductWithRelations> {
    const product = await prisma.product.findFirst({
      where: { id, deletedAt: null, isActive: true },
      include: productInclude,
    });
    if (!product) {
      throw new AppError('Product not found.', 404);
    }
    return product;
  }

  async createProduct(input: CreateProductInput): Promise<ProductWithRelations> {
    const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
    if (!category) {
      throw new AppError('Category not found.', 404);
    }

    const slug = input.slug ?? slugify(input.name);
    const conflict = await prisma.product.findFirst({ where: { OR: [{ slug }, { sku: input.sku }] } });
    if (conflict) {
      throw new AppError('A product with this slug or SKU already exists.', 409);
    }

    return prisma.product.create({
      data: {
        categoryId: input.categoryId,
        name: input.name,
        slug,
        description: input.description,
        sku: input.sku,
        price: input.price,
        width: input.width,
        height: input.height,
        thickness: input.thickness,
        unit: input.unit,
        material: input.material,
        isFeatured: input.isFeatured ?? false,
        images: input.images ? { create: input.images } : undefined,
      },
      include: productInclude,
    });
  }

  async updateProduct(id: string, input: UpdateProductInput): Promise<ProductWithRelations> {
    const existing = await prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      throw new AppError('Product not found.', 404);
    }

    if (input.categoryId) {
      const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
      if (!category) {
        throw new AppError('Category not found.', 404);
      }
    }

    if (input.slug || input.sku) {
      const conflict = await prisma.product.findFirst({
        where: {
          id: { not: id },
          OR: [...(input.slug ? [{ slug: input.slug }] : []), ...(input.sku ? [{ sku: input.sku }] : [])],
        },
      });
      if (conflict) {
        throw new AppError('A product with this slug or SKU already exists.', 409);
      }
    }

    const { images, ...scalarFields } = input;

    return prisma.$transaction(async (tx) => {
      if (images) {
        await tx.productImage.deleteMany({ where: { productId: id } });
      }

      return tx.product.update({
        where: { id },
        data: {
          ...scalarFields,
          images: images ? { create: images } : undefined,
        },
        include: productInclude,
      });
    });
  }

  async softDeleteProduct(id: string): Promise<ProductWithRelations> {
    const existing = await prisma.product.findFirst({ where: { id, deletedAt: null } });
    if (!existing) {
      throw new AppError('Product not found.', 404);
    }

    return prisma.product.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
      include: productInclude,
    });
  }
}

export const productService = new ProductService();
