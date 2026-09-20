import { RequestType } from '@prisma/client';
import type { Request, Response } from 'express';

import { prisma } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { catchAsync } from '../../utils/catchAsync';
import { sendSuccess } from '../../utils/response';
import { requestService } from '../request/request.service';
import { serializeDescription } from '../request/request.types';
import type { ChangeRequestPayload } from '../request/request.types';
import type { ProductFilters } from './product.service';
import { ProductService, productService } from './product.service';

/**
 * `validate.middleware` only rewrites `req.body`, not `req.query` (query
 * values stay as raw strings even after Zod validation passes), so filters
 * are parsed here from the already-format-validated query string.
 */
const parseProductFilters = (query: Request['query']): ProductFilters => {
  const sortBy = query.sortBy === 'price' || query.sortBy === 'name' || query.sortBy === 'createdAt' ? query.sortBy : undefined;
  const sortOrder = query.sortOrder === 'asc' || query.sortOrder === 'desc' ? query.sortOrder : undefined;

  return {
    page: typeof query.page === 'string' ? Number(query.page) : undefined,
    limit: typeof query.limit === 'string' ? Number(query.limit) : undefined,
    search: typeof query.search === 'string' ? query.search : undefined,
    categoryId: typeof query.categoryId === 'string' ? query.categoryId : undefined,
    isFeatured: query.isFeatured === 'true' ? true : query.isFeatured === 'false' ? false : undefined,
    minPrice: typeof query.minPrice === 'string' ? Number(query.minPrice) : undefined,
    maxPrice: typeof query.maxPrice === 'string' ? Number(query.maxPrice) : undefined,
    sortBy,
    sortOrder,
  };
};

export class ProductController {
  constructor(private readonly productService: ProductService) {}

  create = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (req.user?.role === 'OWNER') {
      throw new AppError('Owners cannot directly perform operational changes. Changes must be requested by a Moderator and approved by an Owner.', 403);
    }

    if (req.user?.role === 'MODERATOR') {
      const skuConflict = await prisma.product.findFirst({
        where: { sku: { equals: req.body.sku.trim(), mode: 'insensitive' }, deletedAt: null },
      });
      if (skuConflict) {
        throw new AppError('A product with this slug or SKU already exists.', 409);
      }

      const category = await prisma.category.findUnique({ where: { id: req.body.categoryId } });
      if (!category) {
        throw new AppError('Category not found.', 404);
      }

      const priceNum = Number(req.body.price);
      const priceFormatted = `₱${priceNum.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const summary = `Request to add product "${req.body.name.trim()}" (${req.body.sku.trim().toUpperCase()}) in category "${category.name}" with price ${priceFormatted}.`;

      const payload: ChangeRequestPayload = {
        action: 'ADD_PRODUCT',
        scope: 'PRODUCTS',
        productName: req.body.name.trim(),
        sku: req.body.sku.trim().toUpperCase(),
        currentValues: { Status: 'Not in catalogue' },
        proposedValues: {
          Product: req.body.name.trim(),
          Category: category.name,
          SKU: req.body.sku.trim().toUpperCase(),
          Price: priceFormatted,
        },
        productData: req.body,
      };

      const request = await requestService.createRequest(req.user.id, {
        type: RequestType.OTHER,
        title: `Add product: ${req.body.name.trim()}`,
        description: serializeDescription(summary, payload),
      });

      sendSuccess(res, 201, 'Change request submitted for owner approval.', { request, requiresApproval: true });
      return;
    }

    throw new AppError('Operational changes must be submitted by a Moderator.', 403);
  });

  update = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (req.user?.role === 'OWNER') {
      throw new AppError('Owners cannot directly perform operational changes. Changes must be requested by a Moderator and approved by an Owner.', 403);
    }

    if (req.user?.role === 'MODERATOR') {
      const product = await prisma.product.findFirst({
        where: { id: req.params.id as string, deletedAt: null },
        include: { category: true, inventory: true },
      });
      if (!product) {
        throw new AppError('Product not found.', 404);
      }

      const currentValues: Record<string, any> = {};
      const proposedValues: Record<string, any> = {};
      const diffList: string[] = [];

      if (req.body.name && req.body.name.trim() !== product.name) {
        currentValues.Name = product.name;
        proposedValues.Name = req.body.name.trim();
        diffList.push(`Name: "${product.name}" → "${req.body.name.trim()}"`);
      }
      if (req.body.price !== undefined) {
        const curPrice = Number(product.price);
        const newPrice = Number(req.body.price);
        if (curPrice !== newPrice) {
          currentValues.Price = `₱${curPrice.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          proposedValues.Price = `₱${newPrice.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          diffList.push(`Price: Current: ${currentValues.Price} | Proposed: ${proposedValues.Price}`);
        }
      }
      if (req.body.sku && req.body.sku.trim().toUpperCase() !== product.sku) {
        currentValues.SKU = product.sku;
        proposedValues.SKU = req.body.sku.trim().toUpperCase();
        diffList.push(`SKU: ${product.sku} → ${proposedValues.SKU}`);
      }
      if (req.body.material !== undefined && req.body.material !== product.material) {
        currentValues.Material = product.material || 'None';
        proposedValues.Material = req.body.material || 'None';
        diffList.push(`Material: ${currentValues.Material} → ${proposedValues.Material}`);
      }
      if (req.body.isActive !== undefined && req.body.isActive !== product.isActive) {
        currentValues.Status = product.isActive ? 'Active' : 'Draft';
        proposedValues.Status = req.body.isActive ? 'Active' : 'Draft';
        diffList.push(`Status: ${currentValues.Status} → ${proposedValues.Status}`);
      }

      const summary = diffList.length > 0
        ? `Modify ${product.name} (${product.sku}): ${diffList.join(', ')}`
        : `Update specifications for ${product.name} (${product.sku})`;

      const payload: ChangeRequestPayload = {
        action: 'EDIT_PRODUCT',
        scope: 'PRODUCTS',
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        currentValues: Object.keys(currentValues).length > 0 ? currentValues : { Details: 'Existing specifications' },
        proposedValues: Object.keys(proposedValues).length > 0 ? proposedValues : { Details: 'Updated specifications' },
        updateData: req.body,
      };

      const request = await requestService.createRequest(req.user.id, {
        type: RequestType.OTHER,
        title: `Edit product: ${product.name}`,
        description: serializeDescription(summary, payload),
      });

      sendSuccess(res, 200, 'Change request submitted for owner approval.', { request, requiresApproval: true });
      return;
    }

    throw new AppError('Operational changes must be submitted by a Moderator.', 403);
  });

  softDelete = catchAsync(async (req: Request, res: Response): Promise<void> => {
    if (req.user?.role === 'OWNER') {
      throw new AppError('Owners cannot directly perform operational changes. Changes must be requested by a Moderator and approved by an Owner.', 403);
    }

    if (req.user?.role === 'MODERATOR') {
      const product = await prisma.product.findFirst({
        where: { id: req.params.id as string, deletedAt: null },
      });
      if (!product) {
        throw new AppError('Product not found.', 404);
      }

      const summary = `Request to delete product "${product.name}" (${product.sku}). Product will be archived from catalogue upon owner approval.`;
      const payload: ChangeRequestPayload = {
        action: 'DELETE_PRODUCT',
        scope: 'PRODUCTS',
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        currentValues: { Status: 'Active' },
        proposedValues: { Status: 'Deleted / Archived' },
      };

      const request = await requestService.createRequest(req.user.id, {
        type: RequestType.OTHER,
        title: `Delete product: ${product.name}`,
        description: serializeDescription(summary, payload),
      });

      sendSuccess(res, 200, 'Delete request submitted for owner approval.', { request, requiresApproval: true });
      return;
    }

    throw new AppError('Operational changes must be submitted by a Moderator.', 403);
  });

  getById = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const isStaff = req.user?.role === 'OWNER' || req.user?.role === 'MODERATOR';
    const product = await this.productService.getProductById(req.params.id as string, Boolean(req.user), isStaff);
    sendSuccess(res, 200, 'Product retrieved successfully.', { product });
  });

  getAll = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const isStaff = req.user?.role === 'OWNER' || req.user?.role === 'MODERATOR';
    const result = await this.productService.getProducts(parseProductFilters(req.query), Boolean(req.user), isStaff);
    sendSuccess(res, 200, 'Products retrieved successfully.', result);
  });

  search = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const result = await this.productService.getProducts(parseProductFilters(req.query), Boolean(req.user));
    sendSuccess(res, 200, 'Search results retrieved successfully.', result);
  });

  getFeatured = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { limit } = parseProductFilters(req.query);
    const result = await this.productService.getFeaturedProducts(limit, Boolean(req.user));
    sendSuccess(res, 200, 'Featured products retrieved successfully.', result);
  });

  getByCategory = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const filters = parseProductFilters(req.query);
    const result = await this.productService.getProductsByCategory(req.params.categoryId as string, filters, Boolean(req.user));
    sendSuccess(res, 200, 'Products retrieved successfully.', result);
  });
}

export const productController = new ProductController(productService);
