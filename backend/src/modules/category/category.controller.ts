import type { Request, Response } from 'express';

import { catchAsync } from '../../utils/catchAsync';
import { sendSuccess } from '../../utils/response';
import { CategoryService, categoryService } from './category.service';

export class CategoryController {
  constructor(private readonly categoryService: CategoryService) {}

  create = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const category = await this.categoryService.createCategory(req.body);
    sendSuccess(res, 201, 'Category created successfully.', { category });
  });

  getAll = catchAsync(async (_req: Request, res: Response): Promise<void> => {
    const categories = await this.categoryService.getAllCategories();
    sendSuccess(res, 200, 'Categories retrieved successfully.', { categories });
  });

  getById = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const category = await this.categoryService.getCategoryById(req.params.id as string);
    sendSuccess(res, 200, 'Category retrieved successfully.', { category });
  });

  update = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const category = await this.categoryService.updateCategory(req.params.id as string, req.body);
    sendSuccess(res, 200, 'Category updated successfully.', { category });
  });

  softDelete = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const category = await this.categoryService.softDeleteCategory(req.params.id as string);
    sendSuccess(res, 200, 'Category deactivated successfully.', { category });
  });
}

export const categoryController = new CategoryController(categoryService);
