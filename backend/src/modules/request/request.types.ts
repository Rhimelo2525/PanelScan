import type { Prisma, RequestStatus, RequestType } from '@prisma/client';

export const requestInclude = {
  requestedBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
  reviewedBy: { select: { id: true, firstName: true, lastName: true, email: true, role: true } },
} satisfies Prisma.RequestInclude;

export type RequestWithRelations = Prisma.RequestGetPayload<{ include: typeof requestInclude }>;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface RequestFilters {
  page?: number;
  limit?: number;
  status?: RequestStatus;
  type?: RequestType;
  requestedById?: string;
  reviewedById?: string;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
  sortBy?: 'title' | 'createdAt' | 'reviewedAt';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedRequests {
  requests: RequestWithRelations[];
  pagination: PaginationMeta;
}

export type ChangeRequestAction = 'ADD_PRODUCT' | 'EDIT_PRODUCT' | 'DELETE_PRODUCT' | 'ADJUST_STOCK' | 'ADD_INVENTORY' | 'DELETE_INVENTORY';

export interface ChangeRequestPayload {
  action: ChangeRequestAction;
  scope: 'PRODUCTS' | 'INVENTORY';
  productId?: string;
  productName?: string;
  sku?: string;
  currentValues?: Record<string, any>;
  proposedValues?: Record<string, any>;
  productData?: any;
  updateData?: any;
  adjustData?: { direction?: 'add' | 'reduce'; quantity?: number; targetQuantity?: number };
}

export const CHANGE_PAYLOAD_DELIMITER = '\n\n__PANELSCAN_CHANGE_PAYLOAD__:\n';

export function serializeDescription(summary: string, payload: ChangeRequestPayload): string {
  return `${summary.trim()}${CHANGE_PAYLOAD_DELIMITER}${JSON.stringify(payload)}`;
}

export function parseDescription(raw: string | null | undefined): { summary: string; payload: ChangeRequestPayload | null } {
  if (!raw) return { summary: '—', payload: null };
  const idx = raw.indexOf(CHANGE_PAYLOAD_DELIMITER);
  if (idx !== -1) {
    const summary = raw.substring(0, idx).trim();
    try {
      const payload = JSON.parse(raw.substring(idx + CHANGE_PAYLOAD_DELIMITER.length)) as ChangeRequestPayload;
      return { summary, payload };
    } catch {
      return { summary, payload: null };
    }
  }
  return { summary: raw.trim(), payload: null };
}

