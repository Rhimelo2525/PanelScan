import type { Request, Response } from 'express';

import { catchAsync } from '../../utils/catchAsync';
import { sendSuccess } from '../../utils/response';
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
    const inventory = await this.inventoryService.addStock(req.params.productId as string, req.body.quantity);
    sendSuccess(res, 200, 'Stock added successfully.', { inventory });
  });

  reduceStock = catchAsync(async (req: Request, res: Response): Promise<void> => {
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
