/**
 * Lalamove Delivery Provider - Real API v3 Integration
 *
 * All operations run strictly server-side:
 * Browser -> PanelScan Backend -> Lalamove Provider -> Lalamove v3 API
 *
 * Endpoints, the HMAC signing scheme, and the order-status vocabulary are
 * taken from Lalamove's own published API reference (developers.lalamove.com)
 * rather than assumed. Two things are NOT publicly documented there and are
 * called out at their point of use instead of being silently guessed:
 *   1. The exact JSON field names for GET /v3/cities and POST /v3/orders'
 *      less-common fields - parsing is defensive (optional chaining, no
 *      throw on a missing field) and the full raw response is always kept
 *      in Delivery.providerMetadata so nothing is lost even if a specific
 *      typed field extraction misses.
 *   2. Lalamove's webhook *signature* scheme (it's in a partner-only PDF).
 *      See lalamove.routes.ts / delivery.service.ts for the disclosed
 *      secret-URL-token fallback used instead.
 */

import { randomUUID } from 'crypto';

import { AppError } from '../../../utils/AppError';
import type {
  DeliveryLocation,
  DeliveryQuotationSnapshot,
  DeliveryQuoteRequest,
  LalamoveDriverDetails,
  LalamoveDeliveryStop,
  LalamoveOrderResult,
  LalamoveQuotedStop,
  LalamoveServiceType,
} from '../delivery.domain.js';
import { formatPhilippineDeliveryAddress } from '../utils/address-formatter.js';
import { isLalamoveConfigured, lalamoveConfig } from './lalamove.config.js';
import { signLalamoveRequest } from './lalamove.signing.js';

export interface PlaceOrderRecipient {
  stopId: string;
  name: string;
  phone: string;
}

export interface DeliveryProvider {
  getAvailableServices(): Promise<LalamoveServiceType[]>;
  getQuotation(request: DeliveryQuoteRequest): Promise<DeliveryQuotationSnapshot>;
  placeDeliveryOrder(quotationId: string, senderStopId: string, recipient: PlaceOrderRecipient, referenceId: string): Promise<LalamoveOrderResult>;
  getOrder(providerOrderId: string): Promise<LalamoveOrderResult>;
  getDriverDetails(providerOrderId: string, driverId: string): Promise<LalamoveDriverDetails>;
  cancelOrder(providerOrderId: string): Promise<{ success: boolean }>;
}

/** A city-info cache entry: successful live results only, so a transient failure never poisons the cache with an empty list. */
let serviceTypeCache: { fetchedAt: number; services: LalamoveServiceType[] } | null = null;
const SERVICE_TYPE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour - vehicle lineups change rarely

/** Lalamove "city" locodes that actually cover PanelScan's Luzon-only delivery-coverage.config.ts whitelist. See getAvailableServices() for why this is inclusive, not exclusive. */
const LUZON_LOCODES = new Set(['PH MNL', 'PH PAM']);

/** Test-only: clears the module-level service-type cache so tests don't leak state into one another via this shared singleton. Never called from production code. */
export const __resetLalamoveServiceTypeCacheForTests = (): void => {
  serviceTypeCache = null;
};

const toNumber = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
const toStr = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);

/** Lalamove's error response shape isn't fully fixed across endpoints, so several common shapes are tried before falling back to a generic message. */
const extractLalamoveErrorMessage = (body: unknown): string | null => {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (typeof b.message === 'string') return b.message;
  const errors = b.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    const first = errors[0] as Record<string, unknown>;
    if (typeof first.message === 'string') return first.message;
    if (typeof first.detail === 'string') return first.detail;
  }
  const error = b.error;
  if (error && typeof error === 'object' && typeof (error as Record<string, unknown>).message === 'string') {
    return (error as Record<string, unknown>).message as string;
  }
  return null;
};

export class LalamoveProvider implements DeliveryProvider {
  /** Builds a Lalamove-compatible delivery stop representation from a DeliveryLocation. */
  public buildDeliveryStop(location: DeliveryLocation): LalamoveDeliveryStop {
    return {
      coordinates: { lat: location.latitude, lng: location.longitude },
      address: location.formattedAddress || formatPhilippineDeliveryAddress(location),
      name: location.recipientName,
      phone: location.recipientPhone,
    };
  }

  /** Generates a unique, server-side Request-ID for Lalamove API idempotency and tracing. */
  public generateRequestId(): string {
    return `req_${Date.now()}_${randomUUID().slice(0, 8)}`;
  }

  /**
   * Signs and sends one Lalamove v3 request. Never called with the raw
   * secret exposed anywhere but the Authorization header itself; nothing
   * here is ever logged. `path` must be the literal request path (no query
   * string needs signing for the endpoints this module uses).
   */
  private async request<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
    if (!isLalamoveConfigured()) {
      throw new AppError('The delivery provider is not configured on this server.', 503);
    }

    const bodyString = body !== undefined ? JSON.stringify(body) : '';
    const timestamp = Date.now();
    const headers = signLalamoveRequest(lalamoveConfig.apiKey, lalamoveConfig.apiSecret, method, path, bodyString, timestamp, this.generateRequestId());

    let response: Response;
    try {
      response = await fetch(`${lalamoveConfig.baseUrl}${path}`, {
        method,
        headers,
        body: bodyString || undefined,
      });
    } catch {
      throw new AppError('Could not reach the delivery provider. Please try again later.', 503);
    }

    let parsedBody: unknown = null;
    try {
      parsedBody = await response.json();
    } catch {
      // Some responses (e.g. a successful DELETE) may have no body at all.
    }

    if (!response.ok) {
      const upstreamMessage = extractLalamoveErrorMessage(parsedBody);
      // 401/403 means OUR credentials/signature are wrong - a server misconfiguration,
      // never the customer's fault, and never worth repeating the raw detail to them.
      if (response.status === 401 || response.status === 403) {
        throw new AppError('The delivery provider rejected our credentials. Please contact support.', 502);
      }
      if (response.status >= 500) {
        throw new AppError('The delivery provider is temporarily unavailable. Please try again shortly.', 503);
      }
      throw new AppError(upstreamMessage ?? 'The delivery provider rejected this request.', 400);
    }

    return ((parsedBody as { data?: T })?.data ?? (parsedBody as T)) as T;
  }

  /**
   * GET /v3/cities - live vehicle lineup, restricted to the two Lalamove
   * "city" groupings that actually cover PanelScan's Luzon-only delivery
   * coverage (verified live against the real account - see PROJECT_NOTES.txt):
   *   PH MNL - Manila NCR & South Luzon
   *   PH PAM - Central & North Luzon
   * A whitelist (not "exclude PH CEB / Cebu") on purpose: a locode Lalamove
   * adds later defaults to EXCLUDED, matching the same fail-safe philosophy
   * as delivery-coverage.config.ts's own region whitelist, rather than
   * silently offering a courier outside PanelScan's service area.
   *
   * `load` and `dimensions` both arrive as `{ value, unit }` objects (unit is
   * always kg/m for this account) - confirmed against the real response, not
   * guessed. A service is still returned (with nulls for whatever couldn't
   * be parsed) rather than dropped, since Lalamove could still add fields.
   */
  async getAvailableServices(): Promise<LalamoveServiceType[]> {
    if (serviceTypeCache && Date.now() - serviceTypeCache.fetchedAt < SERVICE_TYPE_CACHE_TTL_MS) {
      return serviceTypeCache.services;
    }

    const cities = await this.request<Array<Record<string, unknown>>>('GET', '/v3/cities');
    const services: LalamoveServiceType[] = [];

    for (const city of cities ?? []) {
      const locode = toStr(city.locode);
      if (!locode || !LUZON_LOCODES.has(locode)) continue;

      const cityServices = (city.services as Array<Record<string, unknown>> | undefined) ?? [];
      for (const svc of cityServices) {
        const key = toStr(svc.key) ?? toStr(svc.serviceType) ?? toStr(svc.id);
        if (!key || services.some((existing) => existing.key === key)) continue; // de-dupe across the two cities

        const dims = (svc.dimensions ?? svc.dimension) as Record<string, { value?: unknown }> | undefined;
        const length = toNumber(dims?.length?.value);
        const width = toNumber(dims?.width?.value);
        const height = toNumber(dims?.height?.value);

        const load = svc.load as { value?: unknown } | number | undefined;

        services.push({
          key,
          description: toStr(svc.description) ?? toStr(svc.name),
          maxWeightKg: typeof load === 'number' ? load : toNumber(load?.value),
          // Only reported when Lalamove actually gave all three dimensions -
          // never a fabricated 0x0x0, which would misleadingly read as "no vehicle."
          dimensionsMeters: length !== null && width !== null && height !== null ? { length, width, height } : null,
        });
      }
    }

    serviceTypeCache = { fetchedAt: Date.now(), services };
    return services;
  }

  /** POST /v3/quotations - free and non-committal; creates no booking, dispatches no driver, and cannot be charged. */
  async getQuotation(quoteRequest: DeliveryQuoteRequest): Promise<DeliveryQuotationSnapshot> {
    if (!quoteRequest.serviceType) {
      throw new AppError('A vehicle type is required to request a quotation.', 400);
    }

    const stops = [this.buildDeliveryStop(quoteRequest.pickup), this.buildDeliveryStop(quoteRequest.dropoff)];
    for (const stop of stops) {
      if (stop.coordinates.lat === null || stop.coordinates.lng === null) {
        throw new AppError('Delivery coordinates are required to request a quotation.', 400);
      }
    }

    const raw = await this.request<Record<string, unknown>>('POST', '/v3/quotations', {
      data: {
        serviceType: quoteRequest.serviceType,
        language: 'en_PH',
        stops: stops.map((stop) => ({ coordinates: { lat: String(stop.coordinates.lat), lng: String(stop.coordinates.lng) }, address: stop.address })),
        ...(quoteRequest.scheduleAt ? { scheduleAt: quoteRequest.scheduleAt } : {}),
        ...(quoteRequest.specialRequests.length > 0 ? { specialRequests: quoteRequest.specialRequests } : {}),
      },
    });

    const quotationId = toStr(raw.quotationId);
    if (!quotationId) {
      throw new AppError('The delivery provider returned an unexpected quotation response.', 502);
    }

    const priceBreakdown = raw.priceBreakdown as Record<string, unknown> | undefined;
    const amount = toNumber(priceBreakdown?.total);
    const distance = raw.distance as Record<string, unknown> | undefined;
    const distanceValue = toNumber(distance?.value);
    const distanceUnit = toStr(distance?.unit)?.toLowerCase();

    const rawStops = (raw.stops as Array<Record<string, unknown>> | undefined) ?? [];
    const quotedStops: LalamoveQuotedStop[] = rawStops.map((stop) => ({
      stopId: String(stop.stopId ?? ''),
      coordinates: { lat: String((stop.coordinates as Record<string, unknown> | undefined)?.lat ?? ''), lng: String((stop.coordinates as Record<string, unknown> | undefined)?.lng ?? '') },
      address: toStr(stop.address) ?? '',
    }));

    if (quotedStops.length < 2 || quotedStops.some((stop) => !stop.stopId)) {
      throw new AppError('The delivery provider did not return usable stop identifiers for this quotation.', 502);
    }

    return {
      quotationId,
      quotedAt: new Date().toISOString(),
      expiresAt: toStr(raw.expiresAt) ?? new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      amount: amount ?? 0,
      currency: toStr(priceBreakdown?.currency) ?? 'PHP',
      serviceType: toStr(raw.serviceType) ?? quoteRequest.serviceType,
      distanceMeters: distanceValue !== null && (distanceUnit === 'm' || distanceUnit === 'meter' || distanceUnit === 'meters') ? distanceValue : null,
      stops: quotedStops,
    };
  }

  /**
   * POST /v3/orders. `senderStopId`/`recipient.stopId` MUST be the stopIds
   * from the quotation this quotationId came from (see getQuotation) -
   * Lalamove correlates the order to those exact stops.
   */
  async placeDeliveryOrder(quotationId: string, senderStopId: string, recipient: PlaceOrderRecipient, referenceId: string): Promise<LalamoveOrderResult> {
    const raw = await this.request<Record<string, unknown>>('POST', '/v3/orders', {
      data: {
        quotationId,
        sender: { stopId: senderStopId, name: lalamoveConfig.pickupLocation.contactName, phone: lalamoveConfig.pickupLocation.contactPhone },
        recipients: [{ stopId: recipient.stopId, name: recipient.name, phone: recipient.phone }],
        metadata: { panelscanOrderId: referenceId },
      },
    });

    return this.parseOrderResult(raw);
  }

  /** GET /v3/orders/{id} - live status + driver id (if one has been assigned). Read-only, no side effects on Lalamove's side. */
  async getOrder(providerOrderId: string): Promise<LalamoveOrderResult> {
    const raw = await this.request<Record<string, unknown>>('GET', `/v3/orders/${providerOrderId}`);
    return this.parseOrderResult(raw, providerOrderId);
  }

  /** GET /v3/orders/{orderId}/drivers/{driverId}. Only meaningful once getOrder() reports a driverId. */
  async getDriverDetails(providerOrderId: string, driverId: string): Promise<LalamoveDriverDetails> {
    const raw = await this.request<Record<string, unknown>>('GET', `/v3/orders/${providerOrderId}/drivers/${driverId}`);
    return {
      driverId,
      name: toStr(raw.name),
      phone: toStr(raw.phone),
      plateNumber: toStr(raw.plateNumber) ?? toStr(raw.plate_number),
      photoUrl: toStr(raw.photo) ?? toStr(raw.photoUrl),
    };
  }

  /**
   * DELETE /v3/orders/{orderId}. Lalamove refuses this once a driver has
   * picked up the order (surfaced as a normal AppError from `request()`,
   * not swallowed here) - cancellation is only possible up to that point.
   */
  async cancelOrder(providerOrderId: string): Promise<{ success: boolean }> {
    await this.request<unknown>('DELETE', `/v3/orders/${providerOrderId}`);
    return { success: true };
  }

  /**
   * PATCH /v3/webhook - registers the URL Lalamove will push order events to.
   * A ONE-TIME account-configuration action, not something the running app
   * calls on its own: it is exposed here but only ever invoked by an explicit
   * admin action (see delivery.routes.ts), and only makes sense once the
   * backend has a real public HTTPS URL to give Lalamove.
   */
  async registerWebhookUrl(url: string): Promise<void> {
    await this.request<unknown>('PATCH', '/v3/webhook', { data: { url } });
  }

  private parseOrderResult(raw: Record<string, unknown>, fallbackOrderId?: string): LalamoveOrderResult {
    const orderId = toStr(raw.orderId) ?? toStr(raw.id) ?? fallbackOrderId;
    if (!orderId) {
      throw new AppError('The delivery provider returned an unexpected order response.', 502);
    }
    const priceBreakdown = raw.priceBreakdown as Record<string, unknown> | undefined;
    return {
      orderId,
      status: toStr(raw.status) ?? 'ASSIGNING_DRIVER',
      shareLink: toStr(raw.shareLink) ?? toStr(raw.share_link),
      priceBreakdown: priceBreakdown ? { total: toNumber(priceBreakdown.total) ?? 0, currency: toStr(priceBreakdown.currency) ?? 'PHP' } : null,
      driverId: toStr(raw.driverId) ?? toStr(raw.driver_id),
    };
  }

  /** Safe server-side provider request logger that strictly omits secrets, signatures, and credentials. */
  public logProviderAction(action: string, orderId: string, details: Record<string, unknown>): void {
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        provider: 'LALAMOVE',
        env: lalamoveConfig.env,
        market: lalamoveConfig.market,
        action,
        requestId: this.generateRequestId(),
        orderId,
        details,
      }),
    );
  }
}

export const lalamoveProvider = new LalamoveProvider();
