import { UserRole } from '@prisma/client';
import type { Request, Response } from 'express';

import { getRequestAuditContext } from '../../utils/activityLog.js';
import { AppError } from '../../utils/AppError.js';
import { catchAsync } from '../../utils/catchAsync.js';
import { sendSuccess } from '../../utils/response.js';
import { DeliveryService, deliveryService } from './delivery.service.js';
import type { DeliveryFilters } from './delivery.types.js';
import { lalamoveConfig } from './providers/lalamove.config.js';
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
  deliveryState: query.deliveryState === 'active' || query.deliveryState === 'completed' || query.deliveryState === 'cancelled' ? query.deliveryState : undefined,
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

  /** Live Lalamove vehicle lineup for the quotation UI's dropdown. */
  getVehicleTypes = catchAsync(async (_req: Request, res: Response): Promise<void> => {
    const services = await this.deliveryService.getAvailableVehicleTypes();
    sendSuccess(res, 200, 'Vehicle types retrieved successfully.', { services });
  });

  /** Free, non-committal - requests a live fee quote from Lalamove without booking anything. */
  requestQuotation = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const orderId = req.params.orderId as string;
    const quotation = await this.deliveryService.requestQuotation(orderId, requester.id, requester.role, req.body.serviceType, getRequestAuditContext(req));
    sendSuccess(res, 200, 'Quotation retrieved successfully.', { quotation });
  });

  /** Redeems the stored quotation into a real, billable Lalamove booking. Refuses unless the delivery fee is paid (GCash) or Cash on Delivery is selected - see delivery.service.ts#confirmBooking. */
  confirmBooking = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const orderId = req.params.orderId as string;
    const delivery = await this.deliveryService.confirmBooking(orderId, requester.id, requester.role, getRequestAuditContext(req));
    sendSuccess(res, 200, 'Delivery booked successfully.', { delivery });
  });

  /** Opens a PayMongo GCash checkout session for the delivery fee shown in the still-valid quotation. */
  payFeeWithGcash = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const orderId = req.params.orderId as string;
    const result = await this.deliveryService.createFeeGcashCheckout(orderId, requester.id, requester.role, getRequestAuditContext(req));
    sendSuccess(res, 200, 'Delivery fee checkout created successfully.', result);
  });

  /** Selects Cash on Delivery for the delivery fee - rider collects it at drop-off. */
  payFeeWithCash = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const orderId = req.params.orderId as string;
    const result = await this.deliveryService.selectFeeCash(orderId, requester.id, requester.role, getRequestAuditContext(req));
    sendSuccess(res, 200, 'Cash on Delivery selected for the delivery fee.', result);
  });

  /** Pulls live status + driver info from Lalamove and syncs it onto the record. */
  refreshStatus = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const delivery = await this.deliveryService.refreshDeliveryStatus(req.params.id as string, requester.id, requester.role, getRequestAuditContext(req));
    sendSuccess(res, 200, 'Delivery status refreshed successfully.', { delivery });
  });

  /** MODERATOR-only: cancels the real Lalamove booking (not the local record - see DELETE /:id for that). */
  cancelBooking = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const delivery = await this.deliveryService.cancelLalamoveBooking(req.params.id as string, requester.id, getRequestAuditContext(req));
    sendSuccess(res, 200, 'Delivery booking cancelled successfully.', { delivery });
  });

  /** MODERATOR/OWNER interim bridge until a real geocoder is configured (see geocoding.service.ts). */
  setCoordinates = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const requester = getRequester(req);
    const orderId = req.params.orderId as string;
    await this.deliveryService.setDeliveryCoordinates(orderId, requester.id, req.body.latitude, req.body.longitude, getRequestAuditContext(req));
    sendSuccess(res, 200, 'Delivery coordinates saved successfully.');
  });

  /** MODERATOR/OWNER: "Failed API requests" admin view. */
  getFailedRequests = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const page = typeof req.query.page === 'string' ? Number(req.query.page) : undefined;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const result = await this.deliveryService.getFailedProviderRequests({ page, limit });
    sendSuccess(res, 200, 'Failed provider requests retrieved successfully.', result);
  });

  /**
   * Lalamove pushes order events here. No JWT - Lalamove is not a logged-in
   * PanelScan user - so authenticity instead rests on the secret token in
   * the URL itself matching LALAMOVE_WEBHOOK_TOKEN (see delivery.routes.ts
   * for why: Lalamove's webhook signature scheme isn't publicly documented).
   * Always acknowledges 200 once the token checks out, even for an event
   * this system doesn't recognize, so Lalamove doesn't retry indefinitely.
   */
  webhook = catchAsync(async (req: Request, res: Response): Promise<void> => {
    const providedToken = req.params.token;
    if (!lalamoveConfig.webhookToken || providedToken !== lalamoveConfig.webhookToken) {
      throw new AppError('Invalid webhook token.', 404);
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse((req.body as Buffer).toString('utf8'));
    } catch {
      throw new AppError('Invalid webhook payload.', 400);
    }

    const eventType = typeof payload.eventType === 'string' ? payload.eventType : 'UNKNOWN';
    // `data` is passed through WHOLE (order + any sibling keys like `driver`)
    // - the service itself narrows to `data.order` for status and reads
    // `data.driver` separately, so neither is lost.
    const data = (payload.data as Record<string, unknown> | undefined) ?? {};
    const orderData = (data.order as Record<string, unknown> | undefined) ?? data;
    const lalamoveOrderId = typeof orderData.orderId === 'string' ? orderData.orderId : typeof orderData.id === 'string' ? orderData.id : undefined;

    await this.deliveryService.handleLalamoveWebhook(eventType, lalamoveOrderId, data);
    sendSuccess(res, 200, 'Webhook received.');
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
