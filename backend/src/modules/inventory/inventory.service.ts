import { Prisma, RequestStatus, RequestType } from '@prisma/client';

import { prisma } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { parseDescription } from '../request/request.types';

const inventoryInclude = {
  product: { select: { id: true, name: true, sku: true, slug: true } },
} satisfies Prisma.InventoryInclude;

export type InventoryWithProduct = Prisma.InventoryGetPayload<{ include: typeof inventoryInclude }>;

export interface InventoryListFilters {
  page?: number;
  limit?: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface PaginatedInventory {
  inventory: InventoryWithProduct[];
  pagination: PaginationMeta;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;

export class InventoryService {
  async getAllInventory(filters: InventoryListFilters): Promise<PaginatedInventory> {
    const page = filters.page ?? DEFAULT_PAGE;
    const limit = filters.limit ?? DEFAULT_LIMIT;

    const where: Prisma.InventoryWhereInput = {
      product: { deletedAt: null },
    };

    const [inventory, total] = await Promise.all([
      prisma.inventory.findMany({
        where,
        include: inventoryInclude,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.inventory.count({ where }),
    ]);

    return {
      inventory,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async getInventoryByProductId(productId: string): Promise<InventoryWithProduct> {
    const inventory = await prisma.inventory.findUnique({ where: { productId }, include: inventoryInclude });
    if (!inventory) {
      throw new AppError('Inventory record not found for this product.', 404);
    }
    return inventory;
  }

  /**
   * Products whose on-hand quantity has dropped to or below their reorder
   * level. Filtered in application code rather than a `where` clause because
   * Prisma cannot compare two columns of the same row (quantity <=
   * reorderLevel) without a raw query.
   */
  async getLowStockReport(): Promise<InventoryWithProduct[]> {
    const allInventory = await prisma.inventory.findMany({
      where: { product: { deletedAt: null } },
      include: inventoryInclude,
      orderBy: { quantity: 'asc' },
    });
    return allInventory.filter((item) => item.quantity <= item.reorderLevel);
  }

  /**
   * Catalog products that are approved, currently have no live inventory record,
   * and do not have an initial physical stock request currently pending review.
   */
  async getAvailableProductsForInitialStock() {
    const products = await prisma.product.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        inventory: null,
      },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        images: { orderBy: { sortOrder: 'asc' }, take: 1 },
      },
      orderBy: { name: 'asc' },
    });

    const pendingRequests = await prisma.request.findMany({
      where: {
        status: RequestStatus.PENDING,
        type: RequestType.INVENTORY_RESTOCK,
      },
      select: { description: true },
    });

    const pendingProductIds = new Set<string>();
    for (const req of pendingRequests) {
      const { payload } = parseDescription(req.description);
      if (payload?.action === 'ADD_INVENTORY') {
        const pid = payload.productId || payload.productData?.productId;
        if (pid) pendingProductIds.add(pid);
      }
    }

    return products.filter((p) => !pendingProductIds.has(p.id));
  }

  async createInventory(
    productId: string,
    quantity: number,
    reorderLevel = 10,
    warehouseLocation = 'Main Warehouse',
  ): Promise<InventoryWithProduct> {
    const product = await prisma.product.findFirst({ where: { id: productId, deletedAt: null } });
    if (!product) {
      throw new AppError('Product not found.', 404);
    }

    const existingInventory = await prisma.inventory.findUnique({ where: { productId } });
    if (existingInventory) {
      throw new AppError('An inventory record already exists for this product. Use Adjust to modify stock.', 400);
    }

    return prisma.inventory.create({
      data: {
        productId,
        quantity,
        reservedQty: 0,
        reorderLevel,
        warehouseLocation,
        lastRestockedAt: new Date(),
      },
      include: inventoryInclude,
    });
  }

  async adjustStock(productId: string, targetQuantity: number): Promise<InventoryWithProduct> {
    return prisma.$transaction(async (tx) => {
      const inventory = await tx.inventory.findUnique({ where: { productId } });
      if (!inventory) {
        throw new AppError('Inventory record not found for this product.', 404);
      }
      if (targetQuantity < inventory.reservedQty) {
        throw new AppError(`Cannot reduce stock below reserved quantity (${inventory.reservedQty}).`, 400);
      }

      return tx.inventory.update({
        where: { productId },
        data: {
          quantity: targetQuantity,
          lastRestockedAt: targetQuantity > inventory.quantity ? new Date() : undefined,
        },
        include: inventoryInclude,
      });
    });
  }

  async deleteInventory(productId: string): Promise<void> {
    const inventory = await prisma.inventory.findUnique({ where: { productId } });
    if (!inventory) {
      throw new AppError('Inventory record not found for this product.', 404);
    }
    await prisma.inventory.delete({ where: { productId } });
  }

  async addStock(productId: string, quantity: number): Promise<InventoryWithProduct> {
    return prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({ where: { id: productId, deletedAt: null } });
      if (!product) {
        throw new AppError('Product not found.', 404);
      }

      return tx.inventory.upsert({
        where: { productId },
        update: { quantity: { increment: quantity }, lastRestockedAt: new Date() },
        create: {
          productId,
          quantity,
          reservedQty: 0,
          reorderLevel: 10,
          warehouseLocation: 'Main Warehouse',
          lastRestockedAt: new Date(),
        },
        include: inventoryInclude,
      });
    });
  }

  async reduceStock(productId: string, quantity: number): Promise<InventoryWithProduct> {
    return prisma.$transaction(async (tx) => {
      const inventory = await tx.inventory.findUnique({ where: { productId } });
      if (!inventory) {
        throw new AppError('Inventory record not found for this product.', 404);
      }
      if (quantity > inventory.quantity) {
        throw new AppError(`Insufficient stock to reduce. Current quantity: ${inventory.quantity}.`, 400);
      }

      return tx.inventory.update({
        where: { productId },
        data: { quantity: { decrement: quantity } },
        include: inventoryInclude,
      });
    });
  }

  async reserveStock(productId: string, quantity: number): Promise<InventoryWithProduct> {
    return prisma.$transaction(async (tx) => {
      const inventory = await tx.inventory.findUnique({ where: { productId } });
      if (!inventory) {
        throw new AppError('Inventory record not found for this product.', 404);
      }

      const available = inventory.quantity - inventory.reservedQty;
      if (quantity > available) {
        throw new AppError(`Insufficient available stock to reserve. Available: ${available}.`, 400);
      }

      return tx.inventory.update({
        where: { productId },
        data: { reservedQty: { increment: quantity } },
        include: inventoryInclude,
      });
    });
  }

  async releaseReservedStock(productId: string, quantity: number): Promise<InventoryWithProduct> {
    return prisma.$transaction(async (tx) => {
      const inventory = await tx.inventory.findUnique({ where: { productId } });
      if (!inventory) {
        throw new AppError('Inventory record not found for this product.', 404);
      }
      if (quantity > inventory.reservedQty) {
        throw new AppError(`Cannot release more than the currently reserved quantity (${inventory.reservedQty}).`, 400);
      }

      return tx.inventory.update({
        where: { productId },
        data: { reservedQty: { decrement: quantity } },
        include: inventoryInclude,
      });
    });
  }
}

export const inventoryService = new InventoryService();
