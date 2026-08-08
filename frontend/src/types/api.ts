/**
 * Mirrors the backend's response envelope contract exactly
 * (backend/src/types/api.types.ts) — the wire shape, not the database schema.
 * See FRONTEND_HANDOFF.md §4 for the full explanation of these fields.
 */

export interface ApiSuccessResponse<T = unknown> {
  success: true;
  message: string;
  data?: T;
}

export interface ApiValidationIssue {
  path: string;
  message: string;
}

export interface ApiErrorResponse {
  success: false;
  message: string;
  errors?: ApiValidationIssue[];
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

/** Shape shared by every paginated list endpoint in this API (see backend/README.md §3). */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}
