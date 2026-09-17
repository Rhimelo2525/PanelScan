import { RequestType } from '@prisma/client';
import type { Request, Response } from 'express';

import { prisma } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { catchAsync } from '../../utils/catchAsync';
import { sendSuccess } from '../../utils/response';
import { requestService } from '../request/request.service';
import { serializeDescription } from '../request/request.types';
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

  getByProductId = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const inventory = await this.inventoryService.getInventoryByProductId(req.params.productId as string);
    sendSuccess(res, 200, 'Inventory retrieved successfully.', { inventory });
  });

  addStock = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (req.user?.role === 'MODERATOR') {
      const inv = await prisma.inventory.findUnique({
        where: { productId: req.params.productId as string },
        include: { product: true },
      });
      if (!inv || inv.product.deletedAt) {
        throw new AppError('Inventory record not found.', 404);
      }

      const currentStock = inv.quantity;
      const proposedStock = currentStock + req.body.quantity;
      const summary = `Adjust stock for ${inv.product.name} (${inv.product.sku}): Add ${req.body.quantity} units (Current: ${currentStock}, Proposed: ${proposedStock}).`;

      const payload: ChangeRequestPayload = {
        action: 'ADJUST_STOCK',
        scope: 'INVENTORY',
        productId: inv.productId,
        productName: inv.product.name,
        sku: inv.product.sku,
        currentValues: { Stock: currentStock },
        proposedValues: { Stock: proposedStock },
        adjustData: { direction: 'add', quantity: req.body.quantity },
      };

      const request = await requestService.createRequest(req.user.id, {
        type: RequestType.INVENTORY_RESTOCK,
        title: `Adjust stock: ${inv.product.name}`,
        description: serializeDescription(summary, payload),
      });

      sendSuccess(res, 200, 'Stock adjustment request submitted for owner approval.', { request, requiresApproval: true });
      return;
    }

    const inventory = await this.inventoryService.addStock(req.params.productId as string, req.body.quantity);
    sendSuccess(res, 200, 'Stock added successfully.', { inventory });
  });

  reduceStock = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (req.user?.role === 'MODERATOR') {
      const inv = await prisma.inventory.findUnique({
        where: { productId: req.params.productId as string },
        include: { product: true },
      });
      if (!inv || inv.product.deletedAt) {
        throw new AppError('Inventory record not found.', 404);
      }

      const currentStock = inv.quantity;
      const proposedStock = Math.max(0, currentStock - req.body.quantity);
      const summary = `Adjust stock for ${inv.product.name} (${inv.product.sku}): Reduce ${req.body.quantity} units (Current: ${currentStock}, Proposed: ${proposedStock}).`;

      const payload: ChangeRequestPayload = {
        action: 'ADJUST_STOCK',
        scope: 'INVENTORY',
        productId: inv.productId,
        productName: inv.product.name,
        sku: inv.product.sku,
        currentValues: { Stock: currentStock },
        proposedValues: { Stock: proposedStock },
        adjustData: { direction: 'reduce', quantity: req.body.quantity },
      };

      const request = await requestService.createRequest(req.user.id, {
        type: RequestType.INVENTORY_RESTOCK,
        title: `Adjust stock: ${inv.product.name}`,
        description: serializeDescription(summary, payload),
      });

      sendSuccess(res, 200, 'Stock adjustment request submitted for owner approval.', { request, requiresApproval: true });
      return;
    }

    const inventory = await this.inventoryService.reduceStock(req.params.productId as string, req.body.quantity);
    sendSuccess(res, 200, 'Stock reduced successfully.', { inventory });
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
