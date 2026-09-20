import { UserRole } from '@prisma/client';
import type { Request, Response } from 'express';

import { AppError } from '../../utils/AppError.js';
import { catchAsync } from '../../utils/catchAsync.js';
import { sendSuccess } from '../../utils/response.js';
import { DeliveryService, deliveryService } from './delivery.service.js';
import type { DeliveryFilters } from './delivery.types.js';
import { deliveryCoverage, isLocationInPanelScanCoverage } from './delivery-coverage.config.js';
import {
  getPsgcRegions,
  getPsgcProvinces,
  getPsgcCities,
  getPsgcBarangays,
  validatePsgcHierarchy,
} from './data/psgc-luzon.data.js';
import { formatPhilippineDeliveryAddress } from './utils/address-formatter.js';

interface Requester {
  id: string;
  role: UserRole;
}

const getRequester = (req: Request): Requester => {
  if (!req.user) {
    throw new AppError('Authentication required.', 401);
  }
  return { id: req.user.id, role: req.user.role };
};

/**
 * `validate.middleware` only rewrites `req.body`, not `req.query` (query
 * values stay as raw strings even after Zod validation passes), so filters
 * are parsed here from the already-format-validated query string.
 */
const parseDeliveryFilters = (query: Request['query']): DeliveryFilters => ({
  page: typeof query.page === 'string' ? Number(query.page) : undefined,
  limit: typeof query.limit === 'string' ? Number(query.limit) : undefined,
  search: typeof query.search === 'string' ? query.search : undefined,
  status: query.status === 'scheduled' || query.status === 'delivered' ? query.status : undefined,
  sortBy: query.sortBy === 'scheduledDate' || query.sortBy === 'createdAt' ? query.sortBy : undefined,
  sortOrder: query.sortOrder === 'asc' || query.sortOrder === 'desc' ? query.sortOrder : undefined,
});

export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  create = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const delivery = await this.deliveryService.createDelivery(req.body);
    sendSuccess(res, 201, 'Delivery created successfully.', { delivery });
  });

  arrangeForOrder = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const orderId = req.params.orderId as string;
    const delivery = await this.deliveryService.arrangeDeliveryForOrder(orderId, requester.id, requester.role);
    sendSuccess(res, 200, 'Delivery arranged successfully.', { delivery });
  });

  requestDelivery = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const orderId = req.params.orderId as string;
    const delivery = await this.deliveryService.requestDelivery(orderId, requester.id);
    sendSuccess(res, 200, 'Delivery request submitted successfully.', { delivery });
  });

  approveDeliveryRequest = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const orderId = req.params.orderId as string;
    const delivery = await this.deliveryService.approveDeliveryRequest(orderId, requester.id);
    sendSuccess(res, 200, 'Delivery request approved successfully.', { delivery });
  });

  declineDeliveryRequest = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const orderId = req.params.orderId as string;
    const reason = req.body?.reason;
    const delivery = await this.deliveryService.declineDeliveryRequest(orderId, requester.id, reason);
    sendSuccess(res, 200, 'Delivery request declined successfully.', { delivery });
  });

  proceedWithDelivery = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const orderId = req.params.orderId as string;
    const result = await this.deliveryService.proceedWithDelivery(orderId, requester.id);
    sendSuccess(res, 200, result.message, result);
  });

  /** CUSTOMER: deliveries for their own orders only. MODERATOR/OWNER: every delivery. */
  getAll = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const filters = parseDeliveryFilters(req.query);
    const result =
      requester.role === UserRole.CUSTOMER
        ? await this.deliveryService.getMyDeliveries(requester.id, filters)
        : await this.deliveryService.getAllDeliveries(filters);
    sendSuccess(res, 200, 'Deliveries retrieved successfully.', result);
  });

  getById = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const delivery = await this.deliveryService.getDeliveryById(req.params.id as string, requester.id, requester.role);
    sendSuccess(res, 200, 'Delivery retrieved successfully.', { delivery });
  });

  update = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const delivery = await this.deliveryService.updateDelivery(req.params.id as string, req.body);
    sendSuccess(res, 200, 'Delivery updated successfully.', { delivery });
  });

  markDelivered = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const delivery = await this.deliveryService.markDelivered(req.params.id as string);
    sendSuccess(res, 200, 'Delivery marked as delivered.', { delivery });
  });

  remove = catchAsync(async (req: Request, res: Response): Promise<void> => {
    await this.deliveryService.deleteDelivery(req.params.id as string);
    sendSuccess(res, 200, 'Delivery deleted successfully.');
  });

  /** PSGC & Delivery Coverage endpoints for structured address selection */
  getCoverage = catchAsync(async (_req: Request, res: Response): Promise<void> => {
    sendSuccess(res, 200, 'Delivery coverage retrieved successfully.', { coverage: deliveryCoverage });
  });

  getRegions = catchAsync(async (_req: Request, res: Response): Promise<void> => {
    const regions = getPsgcRegions();
    sendSuccess(res, 200, 'Regions retrieved successfully.', { regions });
  });

  getProvinces = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const regionCode = req.query.regionCode as string;
    if (!regionCode) {
      throw new AppError('regionCode query parameter is required.', 400);
    }
    const provinces = getPsgcProvinces(regionCode);
    sendSuccess(res, 200, 'Provinces retrieved successfully.', { provinces });
  });

  getCities = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const regionCode = req.query.regionCode as string;
    const provinceCode = req.query.provinceCode as string | undefined;
    if (!regionCode) {
      throw new AppError('regionCode query parameter is required.', 400);
    }
    const cities = getPsgcCities(regionCode, provinceCode);
    sendSuccess(res, 200, 'Cities retrieved successfully.', { cities });
  });

  getBarangays = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const cityCode = req.query.cityCode as string;
    if (!cityCode) {
      throw new AppError('cityCode query parameter is required.', 400);
    }
    const barangays = getPsgcBarangays(cityCode);
    sendSuccess(res, 200, 'Barangays retrieved successfully.', { barangays });
  });

  validateAddress = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const { regionCode, provinceCode, cityMunicipalityCode, barangayCode } = req.body;

    const hierarchy = validatePsgcHierarchy({
      regionCode,
      provinceCode: provinceCode ?? null,
      cityMunicipalityCode,
      barangayCode,
    });

    if (!hierarchy.isValid) {
      throw new AppError(hierarchy.error || 'Invalid PSGC address hierarchy.', 400);
    }

    const isCovered = isLocationInPanelScanCoverage(regionCode, provinceCode);
    if (!isCovered) {
      throw new AppError('Location is outside PanelScan preliminary delivery coverage.', 400);
    }

    const formattedAddress = formatPhilippineDeliveryAddress(req.body);

    sendSuccess(res, 200, 'Address is valid and eligible for delivery.', {
      isValid: true,
      formattedAddress,
    });
  });
}

export const deliveryController = new DeliveryController(deliveryService);
