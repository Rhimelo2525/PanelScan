/**
 * Centralized API client — every api/*.api.ts module should route its HTTP calls
 * through this, never call `fetch` directly. See FRONTEND_HANDOFF.md §3-4 for the
 * full backend contract this wraps (auth flow, response envelope, error codes).
 *
 * Scope of this scaffolding pass: base URL + response envelope typing only.
 * Deliberately NOT implemented yet (tracked for the first real auth-integration
 * task, per this task's instructions not to build the auth client prematurely):
 *   - `Authorization: Bearer <token>` header injection
 *   - 401 → POST /api/auth/refresh → retry-once flow (FRONTEND_HANDOFF.md §3.3)
 *   - Token storage/retrieval (secure device storage — §3.1)
 *   - Centralized error normalization keyed off `ApiErrorResponse` (§4.1)
 * Until that work lands, every request below goes out unauthenticated.
 */
import { API_BASE_URL } from '../config/env';
import type { ApiResponse } from '../types/api';

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
}

export const apiRequest = async <T = unknown>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  return (await response.json()) as ApiResponse<T>;
};
