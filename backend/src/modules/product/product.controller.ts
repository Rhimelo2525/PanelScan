import type { Request, Response } from 'express';

import { catchAsync } from '../../utils/catchAsync';
import { sendSuccess } from '../../utils/response';
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
    const product = await this.productService.createProduct(req.body);
    sendSuccess(res, 201, 'Product created successfully.', { product });
  });

  update = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const product = await this.productService.updateProduct(req.params.id as string, req.body);
    sendSuccess(res, 200, 'Product updated successfully.', { product });
  });

  softDelete = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const product = await this.productService.softDeleteProduct(req.params.id as string);
    sendSuccess(res, 200, 'Product deleted successfully.', { product });
  });

  getById = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const product = await this.productService.getProductById(req.params.id as string);
    sendSuccess(res, 200, 'Product retrieved successfully.', { product });
  });

  getAll = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const result = await this.productService.getProducts(parseProductFilters(req.query));
    sendSuccess(res, 200, 'Products retrieved successfully.', result);
  });

  search = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const result = await this.productService.getProducts(parseProductFilters(req.query));
    sendSuccess(res, 200, 'Search results retrieved successfully.', result);
  });

  getFeatured = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { limit } = parseProductFilters(req.query);
    const result = await this.productService.getFeaturedProducts(limit);
    sendSuccess(res, 200, 'Featured products retrieved successfully.', result);
  });

  getByCategory = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const filters = parseProductFilters(req.query);
    const result = await this.productService.getProductsByCategory(req.params.categoryId as string, filters);
    sendSuccess(res, 200, 'Products retrieved successfully.', result);
  });
}

export const productController = new ProductController(productService);
