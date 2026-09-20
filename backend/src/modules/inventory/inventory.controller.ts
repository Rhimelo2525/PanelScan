import { RequestType } from '@prisma/client';
import type { Request, Response } from 'express';

import { prisma } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { catchAsync } from '../../utils/catchAsync';
import { sendSuccess } from '../../utils/response';
import { requestService } from '../request/request.service';
import { parseDescription, serializeDescription } from '../request/request.types';
import type { ChangeRequestPayload } from '../request/request.types';
import { InventoryService, inventoryService } from './inventory.service';

export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  getAll = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const page = typeof req.query.page === 'string' ? Number(req.query.page) : undefined;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const result = await this.inventoryService.getAllInventory({ page, limit });
    sendSuccess(res, 200, 'Inventory retrieved successfully.', result);
  });

  getLowStock = catchAsync(async (_req: Request, res: Response): Promise<void> => {
    const inventory = await this.inventoryService.getLowStockReport();
    sendSuccess(res, 200, 'Low stock report retrieved successfully.', { inventory });
  });

  getAvailableProducts = catchAsync(async (_req: Request, res: Response): Promise<void> => {
    const products = await this.inventoryService.getAvailableProductsForInitialStock();
    sendSuccess(res, 200, 'Available products for initial stock retrieved successfully.', { products });
  });

  getByProductId = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const inventory = await this.inventoryService.getInventoryByProductId(req.params.productId as string);
    sendSuccess(res, 200, 'Inventory retrieved successfully.', { inventory });
  });

  create = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (req.user?.role === 'OWNER') {
      throw new AppError('Owners cannot directly perform operational changes. Changes must be requested by a Moderator and approved by an Owner.', 403);
    }

    const { productId, quantity, reorderLevel, warehouseLocation } = req.body;
    const product = await prisma.product.findFirst({ where: { id: productId, deletedAt: null } });
    if (!product) {
      throw new AppError('Product not found.', 404);
    }

    // Duplicate Inventory Protection: verify no existing inventory record
    const existingInventory = await prisma.inventory.findUnique({ where: { productId } });
    if (existingInventory) {
      throw new AppError('Product already has an inventory record. Use Adjust to modify stock.', 400);
    }

    // Duplicate Inventory Protection: verify no pending initial stock request
    const pendingRequests = await prisma.request.findMany({
      where: {
        status: 'PENDING',
        type: RequestType.INVENTORY_RESTOCK,
      },
      select: { description: true },
    });
    const hasPendingInitialStock = pendingRequests.some((r) => {
      const { payload } = parseDescription(r.description);
      return payload?.action === 'ADD_INVENTORY' && (payload.productId === productId || payload.productData?.productId === productId);
    });
    if (hasPendingInitialStock) {
      throw new AppError('A pending initial stock request already exists for this product.', 409);
    }

    if (req.user?.role === 'MODERATOR') {
      const summary = `Request to record initial physical stock of ${quantity} units for product "${product.name}" (${product.sku}).`;
      const payload: ChangeRequestPayload = {
        action: 'ADD_INVENTORY',
        scope: 'INVENTORY',
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        currentValues: { Stock: 'No physical stock recorded' },
        proposedValues: {
          Product: product.name,
          SKU: product.sku,
          'Physical Stock': quantity,
          'Warehouse Location': warehouseLocation || 'Main Warehouse',
          'Reorder Level': reorderLevel ?? 10,
        },
        productData: { productId, quantity, reorderLevel: reorderLevel ?? 10, warehouseLocation: warehouseLocation || 'Main Warehouse' },
      };

      const request = await requestService.createRequest(req.user.id, {
        type: RequestType.INVENTORY_RESTOCK,
        title: `Add stock: ${product.name}`,
        description: serializeDescription(summary, payload),
      });

      sendSuccess(res, 201, 'Inventory change request submitted for owner approval.', { request, requiresApproval: true });
      return;
    }

    throw new AppError('Operational changes must be submitted by a Moderator.', 403);
  });

  delete = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (req.user?.role === 'OWNER') {
      throw new AppError('Owners cannot directly perform operational changes. Changes must be requested by a Moderator and approved by an Owner.', 403);
    }

    const inv = await prisma.inventory.findUnique({
      where: { productId: req.params.productId as string },
      include: { product: true },
    });
    if (!inv || inv.product.deletedAt) {
      throw new AppError('Inventory record not found.', 404);
    }

    if (req.user?.role === 'MODERATOR') {
      const summary = `Request to remove inventory record for "${inv.product.name}" (${inv.product.sku}). Product will remain in catalogue with 0 stock.`;
      const payload: ChangeRequestPayload = {
        action: 'DELETE_INVENTORY',
        scope: 'INVENTORY',
        productId: inv.productId,
        productName: inv.product.name,
        sku: inv.product.sku,
        currentValues: { 'Tracked Stock': inv.quantity },
        proposedValues: { Status: 'Inventory record removed (Stock reset to 0)' },
      };

      const request = await requestService.createRequest(req.user.id, {
        type: RequestType.INVENTORY_RESTOCK,
        title: `Remove inventory: ${inv.product.name}`,
        description: serializeDescription(summary, payload),
      });

      sendSuccess(res, 200, 'Removal request submitted for owner approval.', { request, requiresApproval: true });
      return;
    }

    throw new AppError('Operational changes must be submitted by a Moderator.', 403);
  });

  addStock = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (req.user?.role === 'OWNER') {
      throw new AppError('Owners cannot directly perform operational changes. Changes must be requested by a Moderator and approved by an Owner.', 403);
    }

    const product = await prisma.product.findFirst({
      where: { id: req.params.productId as string, deletedAt: null },
      include: { inventory: true },
    });
    if (!product) {
      throw new AppError('Product not found.', 404);
    }
    if (!product.inventory) {
      throw new AppError('Inventory record not found for this product. Use Record Stock for initial physical stock.', 404);
    }

    if (req.user?.role === 'MODERATOR') {
      const currentStock = product.inventory.quantity;
      const proposedStock = currentStock + req.body.quantity;
      const summary = `Adjust stock for ${product.name} (${product.sku}): Add ${req.body.quantity} units (Current: ${currentStock}, Proposed: ${proposedStock}).`;

      const payload: ChangeRequestPayload = {
        action: 'ADJUST_STOCK',
        scope: 'INVENTORY',
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        currentValues: { Stock: currentStock },
        proposedValues: { Stock: proposedStock },
        adjustData: { direction: 'add', quantity: req.body.quantity, targetQuantity: proposedStock },
      };

      const request = await requestService.createRequest(req.user.id, {
        type: RequestType.INVENTORY_RESTOCK,
        title: `Adjust stock: ${product.name}`,
        description: serializeDescription(summary, payload),
      });

      sendSuccess(res, 200, 'Stock adjustment request submitted for owner approval.', { request, requiresApproval: true });
      return;
    }

    throw new AppError('Operational changes must be submitted by a Moderator.', 403);
  });

  reduceStock = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (req.user?.role === 'OWNER') {
      throw new AppError('Owners cannot directly perform operational changes. Changes must be requested by a Moderator and approved by an Owner.', 403);
    }

    const inv = await prisma.inventory.findUnique({
      where: { productId: req.params.productId as string },
      include: { product: true },
    });
    if (!inv || inv.product.deletedAt) {
      throw new AppError('Inventory record not found for this product. Use Record Stock for initial physical stock.', 404);
    }

    const currentStock = inv.quantity;
    const proposedStock = Math.max(0, currentStock - req.body.quantity);

    if (proposedStock < inv.reservedQty) {
      throw new AppError(`Cannot reduce stock below reserved quantity (${inv.reservedQty}).`, 400);
    }

    if (req.user?.role === 'MODERATOR') {
      const summary = `Adjust stock for ${inv.product.name} (${inv.product.sku}): Reduce ${req.body.quantity} units (Current: ${currentStock}, Proposed: ${proposedStock}).`;

      const payload: ChangeRequestPayload = {
        action: 'ADJUST_STOCK',
        scope: 'INVENTORY',
        productId: inv.productId,
        productName: inv.product.name,
        sku: inv.product.sku,
        currentValues: { Stock: currentStock },
        proposedValues: { Stock: proposedStock },
        adjustData: { direction: 'reduce', quantity: req.body.quantity, targetQuantity: proposedStock },
      };

      const request = await requestService.createRequest(req.user.id, {
        type: RequestType.INVENTORY_RESTOCK,
        title: `Adjust stock: ${inv.product.name}`,
        description: serializeDescription(summary, payload),
      });

      sendSuccess(res, 200, 'Stock adjustment request submitted for owner approval.', { request, requiresApproval: true });
      return;
    }

    throw new AppError('Operational changes must be submitted by a Moderator.', 403);
  });

  adjustStock = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (req.user?.role === 'OWNER') {
      throw new AppError('Owners cannot directly perform operational changes. Changes must be requested by a Moderator and approved by an Owner.', 403);
    }

    const productId = req.params.productId as string;
    const inv = await prisma.inventory.findUnique({
      where: { productId },
      include: { product: true },
    });
    if (!inv || inv.product.deletedAt) {
      throw new AppError('Inventory record not found for this product. Use Record Stock for initial physical stock.', 404);
    }

    const targetQuantity = Number(req.body.targetQuantity);
    if (!Number.isInteger(targetQuantity) || targetQuantity < 0) {
      throw new AppError('Target quantity must be a non-negative whole number.', 400);
    }

    if (targetQuantity < inv.reservedQty) {
      throw new AppError(`Cannot reduce stock below reserved quantity (${inv.reservedQty}).`, 400);
    }

    if (req.user?.role === 'MODERATOR') {
      const currentStock = inv.quantity;
      const summary = `Adjust stock for ${inv.product.name} (${inv.product.sku}): Change on-hand stock from ${currentStock} to ${targetQuantity} units.`;

      const payload: ChangeRequestPayload = {
        action: 'ADJUST_STOCK',
        scope: 'INVENTORY',
        productId: inv.productId,
        productName: inv.product.name,
        sku: inv.product.sku,
        currentValues: { Stock: currentStock },
        proposedValues: { Stock: targetQuantity },
        adjustData: {
          direction: targetQuantity >= currentStock ? 'add' : 'reduce',
          quantity: Math.abs(targetQuantity - currentStock),
          targetQuantity,
        },
      };

      const request = await requestService.createRequest(req.user.id, {
        type: RequestType.INVENTORY_RESTOCK,
        title: `Adjust stock: ${inv.product.name}`,
        description: serializeDescription(summary, payload),
      });

      sendSuccess(res, 200, 'Stock adjustment request submitted for owner approval.', { request, requiresApproval: true });
      return;
    }

    throw new AppError('Operational changes must be submitted by a Moderator.', 403);
  });

  reserveStock = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const inventory = await this.inventoryService.reserveStock(req.params.productId as string, req.body.quantity);
    sendSuccess(res, 200, 'Stock reserved successfully.', { inventory });
  });

  releaseStock = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const inventory = await this.inventoryService.releaseReservedStock(req.params.productId as string, req.body.quantity);
    sendSuccess(res, 200, 'Reserved stock released successfully.', { inventory });
  });
}

export const inventoryController = new InventoryController(inventoryService);
