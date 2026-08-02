import { Prisma, UserRole } from '@prisma/client';

import { prisma } from '../../config/database';
import { AppError } from '../../utils/AppError';
import { measurementInclude } from './ar.types';
import type { MeasurementFilters, MeasurementWithCustomer, PaginatedMeasurements, PanelEstimateResult } from './ar.types';
import type { CreateMeasurementInput, EstimatePanelsInput, UpdateMeasurementInput } from './ar.validation';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

export class ArService {
  async createMeasurement(customerId: string, input: CreateMeasurementInput): Promise<MeasurementWithCustomer> {
    return prisma.measurement.create({
      data: {
        customerId,
        label: input.label,
        width: input.width,
        height: input.height,
        depth: input.depth,
        unit: input.unit ?? 'm',
        imageUrl: input.imageUrl,
        arDataUrl: input.arDataUrl,
      },
      include: measurementInclude,
    });
  }

  /** CUSTOMER's own measurements. */
  async getMyMeasurements(customerId: string, filters: MeasurementFilters): Promise<PaginatedMeasurements> {
    return this.listMeasurements({ ...filters, customerId });
  }

  /** MODERATOR/OWNER view of every measurement, optionally narrowed by ?customerId=. */
  async getAllMeasurements(filters: MeasurementFilters): Promise<PaginatedMeasurements> {
    return this.listMeasurements(filters);
  }

  private async listMeasurements(filters: MeasurementFilters): Promise<PaginatedMeasurements> {
    const page = filters.page ?? DEFAULT_PAGE;
    const limit = filters.limit ?? DEFAULT_LIMIT;

    const where: Prisma.MeasurementWhereInput = {
      ...(filters.customerId ? { customerId: filters.customerId } : {}),
      ...(filters.search ? { label: { contains: filters.search, mode: 'insensitive' } } : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
            createdAt: {
              ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
              ...(filters.dateTo ? { lte: filters.dateTo } : {}),
            },
          }
        : {}),
    };

    const [measurements, total] = await Promise.all([
      prisma.measurement.findMany({
        where,
        include: measurementInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.measurement.count({ where }),
    ]);

    return { measurements, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  }

  async getMeasurementById(measurementId: string, requesterId: string, requesterRole: UserRole): Promise<MeasurementWithCustomer> {
    const measurement = await prisma.measurement.findUnique({ where: { id: measurementId }, include: measurementInclude });
    if (!measurement) {
      throw new AppError('Measurement not found.', 404);
    }
    if (requesterRole === UserRole.CUSTOMER && measurement.customerId !== requesterId) {
      throw new AppError('Measurement not found.', 404);
    }
    return measurement;
  }

  async updateOwnMeasurement(measurementId: string, customerId: string, input: UpdateMeasurementInput): Promise<MeasurementWithCustomer> {
    const existing = await prisma.measurement.findUnique({ where: { id: measurementId } });
    if (!existing || existing.customerId !== customerId) {
      throw new AppError('Measurement not found.', 404);
    }

    return prisma.measurement.update({
      where: { id: measurementId },
      data: {
        label: input.label,
        width: input.width,
        height: input.height,
        depth: input.depth,
        unit: input.unit,
        imageUrl: input.imageUrl,
        arDataUrl: input.arDataUrl,
      },
      include: measurementInclude,
    });
  }

  async deleteOwnMeasurement(measurementId: string, customerId: string): Promise<void> {
    const existing = await prisma.measurement.findUnique({ where: { id: measurementId } });
    if (!existing || existing.customerId !== customerId) {
      throw new AppError('Measurement not found.', 404);
    }

    await prisma.measurement.delete({ where: { id: measurementId } });
  }

  /**
   * Pure calculation, no rows written - the mobile app's AR engine already
   * did the actual scanning; this just turns width/height (either provided
   * directly, or read from a saved Measurement) plus a Product's panel
   * dimensions/price into a panel count and cost estimate.
   */
  async estimatePanels(requesterId: string, requesterRole: UserRole, input: EstimatePanelsInput): Promise<PanelEstimateResult> {
    let width: number;
    let height: number;
    let measurementId: string | undefined;

    if (input.measurementId) {
      const measurement = await prisma.measurement.findUnique({ where: { id: input.measurementId } });
      if (!measurement) {
        throw new AppError('Measurement not found.', 404);
      }
      if (requesterRole === UserRole.CUSTOMER && measurement.customerId !== requesterId) {
        throw new AppError('Measurement not found.', 404);
      }
      width = Number(measurement.width);
      height = Number(measurement.height);
      measurementId = measurement.id;
    } else {
      // Validated by estimatePanelsSchema's refine to both be present when measurementId is absent.
      width = input.width as number;
      height = input.height as number;
    }

    const product = await prisma.product.findFirst({ where: { id: input.productId, isActive: true, deletedAt: null } });
    if (!product) {
      throw new AppError('Product not found.', 404);
    }
    if (product.width === null || product.height === null) {
      throw new AppError('This product does not have panel dimensions configured and cannot be used for estimation.', 400);
    }

    const wallArea = width * height;
    const panelArea = Number(product.width) * Number(product.height);
    const requiredPanels = Math.ceil(wallArea / panelArea);
    const unitPrice = Number(product.price);
    const estimatedCost = requiredPanels * unitPrice;

    return {
      measurementId,
      productId: product.id,
      productName: product.name,
      width,
      height,
      wallArea,
      panelArea,
      requiredPanels,
      unitPrice,
      estimatedCost,
    };
  }
}

export const arService = new ArService();
