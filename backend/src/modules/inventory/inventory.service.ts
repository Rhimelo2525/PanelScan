import { Prisma } from '@prisma/client';

import { prisma } from '../../config/database';
import { AppError } from '../../utils/AppError';

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

    const [inventory, total] = await Promise.all([
      prisma.inventory.findMany({
        include: inventoryInclude,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.inventory.count(),
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
      include: inventoryInclude,
      orderBy: { quantity: 'asc' },
    });
    return allInventory.filter((item) => item.quantity <= item.reorderLevel);
  }

  async addStock(productId: string, quantity: number): Promise<InventoryWithProduct> {
    return prisma.$transaction(async (tx) => {
      const inventory = await tx.inventory.findUnique({ where: { productId } });
      if (!inventory) {
        throw new AppError('Inventory record not found for this product.', 404);
      }

      return tx.inventory.update({
        where: { productId },
        data: { quantity: { increment: quantity }, lastRestockedAt: new Date() },
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
