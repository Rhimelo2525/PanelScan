import type { Prisma } from '@prisma/client';

export const measurementInclude = {
  customer: { select: { id: true, firstName: true, lastName: true, email: true } },
} satisfies Prisma.MeasurementInclude;

export type MeasurementWithCustomer = Prisma.MeasurementGetPayload<{ include: typeof measurementInclude }>;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface MeasurementFilters {
  page?: number;
  limit?: number;
  customerId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
}

export interface PaginatedMeasurements {
  measurements: MeasurementWithCustomer[];
  pagination: PaginationMeta;
}

export interface PanelEstimateResult {
  measurementId?: string;
  productId: string;
  productName: string;
  width: number;
  height: number;
  wallArea: number;
  panelArea: number;
  requiredPanels: number;
  unitPrice: number;
  estimatedCost: number;
}
