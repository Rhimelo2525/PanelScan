import { clearSessionTokens, getSessionTokens, updateSessionTokens } from "@/auth/token-storage"

interface ApiSuccessResponse<T> {
  success: true
  message: string
  data?: T
}

interface ApiErrorResponse {
  success: false
  message: string
  errors?: Array<{ path: string; message: string }>
}

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()

export const apiBaseUrl = configuredBaseUrl?.replace(/\/$/, "") ?? ""
export const isApiConfigured = apiBaseUrl.length > 0

export class ApiRequestError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ApiRequestError"
    this.status = status
  }
}

interface ApiRequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE"
  body?: unknown
  signal?: AbortSignal
  authenticated?: boolean
  retryAfterRefresh?: boolean
}

interface RefreshPayload {
  token: string
  refreshToken: string
}

let refreshLock: Promise<string | null> | null = null

function announceSessionEnd() {
  window.dispatchEvent(new Event("panelscan:session-ended"))
}

async function performTokenRefresh(): Promise<string | null> {
  const refreshToken = getSessionTokens()?.refreshToken
  if (!refreshToken || !isApiConfigured) return null

  try {
    const response = await fetch(`${apiBaseUrl}/auth/refresh`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    })
    const body = (await response.json()) as ApiSuccessResponse<RefreshPayload> | ApiErrorResponse

    if (!response.ok || !body.success || !body.data) throw new Error("Refresh failed")
    updateSessionTokens({ accessToken: body.data.token, refreshToken: body.data.refreshToken })
    return body.data.token
  } catch {
    clearSessionTokens()
    announceSessionEnd()
    return null
  }
}

export function refreshAccessToken(): Promise<string | null> {
  if (!refreshLock) {
    refreshLock = performTokenRefresh().finally(() => { refreshLock = null })
  }
  return refreshLock
}

async function request<T>(path: string, options: ApiRequestOptions, accessToken?: string): Promise<T> {
  if (!isApiConfigured) {
    throw new ApiRequestError("PanelScan is not connected to its API in this environment.", 503)
  }

  const headers: Record<string, string> = { Accept: "application/json" }
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData
  if (options.body !== undefined && !isFormData) headers["Content-Type"] = "application/json"
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`

  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body === undefined ? undefined : isFormData ? (options.body as FormData) : JSON.stringify(options.body),
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error
    throw new ApiRequestError("We couldn't connect to PanelScan right now. Please try again.", 0)
  }

  let responseBody: ApiSuccessResponse<T> | ApiErrorResponse

  try {
    responseBody = (await response.json()) as ApiSuccessResponse<T> | ApiErrorResponse
  } catch {
    throw new ApiRequestError("PanelScan returned an unreadable response. Please try again.", response.status)
  }

  if (response.status === 401 && options.authenticated && options.retryAfterRefresh !== false) {
    const refreshedToken = await refreshAccessToken()
    if (refreshedToken) return request<T>(path, { ...options, retryAfterRefresh: false }, refreshedToken)
    clearSessionTokens()
    announceSessionEnd()
  }

  if (!response.ok || !responseBody.success) {
    throw new ApiRequestError(responseBody.message || "The request could not be completed.", response.status)
  }

  return responseBody.data as T
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  let accessToken: string | undefined

  if (options.authenticated) {
    accessToken = getSessionTokens()?.accessToken
    if (!accessToken && getSessionTokens()?.refreshToken) accessToken = (await refreshAccessToken()) ?? undefined
  }

  return request<T>(path, options, accessToken)
}
