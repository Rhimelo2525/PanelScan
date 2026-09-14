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

export type PublicProduct = Omit<ProductWithRelations, 'price'> & {
  price: Prisma.Decimal | null;
};

export const sanitizeProduct = (product: ProductWithRelations, isAuthenticated: boolean): PublicProduct => {
  if (!isAuthenticated) {
    return {
      ...product,
      price: null,
    };
  }
  return product;
};

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
  products: PublicProduct[];
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
  async getProducts(filters: ProductFilters, isAuthenticated = false, isStaff = false): Promise<PaginatedProducts> {
    const page = filters.page ?? DEFAULT_PAGE;
    const limit = filters.limit ?? DEFAULT_LIMIT;

    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(isStaff ? {} : { isActive: true }),
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
      products: products.map((p) => sanitizeProduct(p, isAuthenticated)),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async getFeaturedProducts(limit?: number, isAuthenticated = false): Promise<PaginatedProducts> {
    return this.getProducts({ isFeatured: true, limit: limit ?? DEFAULT_FEATURED_LIMIT }, isAuthenticated);
  }

  async getProductsByCategory(categoryId: string, filters: ProductFilters, isAuthenticated = false): Promise<PaginatedProducts> {
    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) {
      throw new AppError('Category not found.', 404);
    }
    return this.getProducts({ ...filters, categoryId }, isAuthenticated);
  }

  async getProductById(id: string, isAuthenticated = false, isStaff = false): Promise<PublicProduct> {
    const product = await prisma.product.findFirst({
      where: {
        id,
        deletedAt: null,
        ...(isStaff ? {} : { isActive: true }),
      },
      include: productInclude,
    });
    if (!product) {
      throw new AppError('Product not found.', 404);
    }
    return sanitizeProduct(product, isAuthenticated);
  }

  async createProduct(input: CreateProductInput): Promise<ProductWithRelations> {
    const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
    if (!category) {
      throw new AppError('Category not found.', 404);
    }

    const trimmedSku = input.sku.trim();

    // Verify SKU uniqueness against active products
    const skuConflict = await prisma.product.findFirst({
      where: {
        sku: { equals: trimmedSku, mode: 'insensitive' },
        deletedAt: null,
      },
    });
    if (skuConflict) {
      throw new AppError('A product with this slug or SKU already exists.', 409);
    }

    // Resolve and verify slug
    let slug: string;
    if (input.slug) {
      const trimmedSlug = input.slug.trim().toLowerCase();
      const slugConflict = await prisma.product.findFirst({
        where: {
          slug: { equals: trimmedSlug, mode: 'insensitive' },
          deletedAt: null,
        },
      });
      if (slugConflict) {
        throw new AppError('A product with this slug or SKU already exists.', 409);
      }
      slug = trimmedSlug;
    } else {
      // Auto-generate slug from name. If taken in database, disambiguate so creation never fails on slug
      const baseSlug = slugify(input.name);
      slug = baseSlug;
      let counter = 1;
      while (true) {
        const existingSlug = await prisma.product.findUnique({
          where: { slug },
          select: { id: true },
        });
        if (!existingSlug) {
          break;
        }
        if (counter === 1) {
          const skuSlug = slugify(trimmedSku);
          slug = skuSlug ? `${baseSlug}-${skuSlug}` : `${baseSlug}-${counter + 1}`;
        } else {
          slug = `${baseSlug}-${counter}`;
        }
        counter++;
      }
    }

    return prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          categoryId: input.categoryId,
          name: input.name,
          slug,
          description: input.description,
          sku: trimmedSku,
          price: input.price,
          width: input.width,
          height: input.height,
          thickness: input.thickness,
          unit: input.unit ?? 'panel',
          material: input.material,
          isFeatured: input.isFeatured ?? false,
          images: input.images ? { create: input.images } : undefined,
        },
      });

      await tx.inventory.create({
        data: {
          productId: product.id,
          quantity: input.stock ?? 0,
          reservedQty: 0,
          reorderLevel: input.reorderLevel ?? 10,
          warehouseLocation: 'Main Warehouse',
        },
      });

      return tx.product.findUniqueOrThrow({
        where: { id: product.id },
        include: productInclude,
      });
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

    const trimmedSku = input.sku?.trim();
    const trimmedSlug = input.slug?.trim().toLowerCase();

    if (trimmedSlug || trimmedSku) {
      const conflict = await prisma.product.findFirst({
        where: {
          id: { not: id },
          deletedAt: null,
          OR: [
            ...(trimmedSlug ? [{ slug: { equals: trimmedSlug, mode: 'insensitive' as const } }] : []),
            ...(trimmedSku ? [{ sku: { equals: trimmedSku, mode: 'insensitive' as const } }] : []),
          ],
        },
      });
      if (conflict) {
        throw new AppError('A product with this slug or SKU already exists.', 409);
      }
    }

    const { images, stock, reorderLevel, ...scalarFields } = input;
    if (trimmedSku) {
      scalarFields.sku = trimmedSku;
    }
    if (trimmedSlug) {
      scalarFields.slug = trimmedSlug;
    }

    return prisma.$transaction(async (tx) => {
      if (images) {
        await tx.productImage.deleteMany({ where: { productId: id } });
      }

      if (stock !== undefined || reorderLevel !== undefined) {
        await tx.inventory.upsert({
          where: { productId: id },
          update: {
            ...(stock !== undefined ? { quantity: stock } : {}),
            ...(reorderLevel !== undefined ? { reorderLevel } : {}),
          },
          create: {
            productId: id,
            quantity: stock ?? 0,
            reservedQty: 0,
            reorderLevel: reorderLevel ?? 10,
            warehouseLocation: 'Main Warehouse',
          },
        });
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

    const shortId = id.slice(0, 8);
    const timestamp = Date.now();
    return prisma.product.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isActive: false,
        sku: `${existing.sku}__archived_${shortId}_${timestamp}`,
        slug: `${existing.slug}--archived-${shortId}-${timestamp}`,
      },
      include: productInclude,
    });
  }
}

export const productService = new ProductService();
