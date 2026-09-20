/**
 * Lalamove Delivery Provider Service Boundary
 *
 * Implements the delivery provider abstraction for future Lalamove API connection.
 *
 * All operations will run strictly server-side:
 * Browser -> PanelScan Backend -> Lalamove Provider -> Lalamove v3 API
 *
 * Zero live or mock Lalamove API calls are made in this phase.
 */

import { randomUUID } from 'crypto';
import type {
  DeliveryLocation,
  DeliveryQuoteRequest,
  DeliveryQuotationSnapshot,
  LalamoveDeliveryStop,
} from '../delivery.domain.js';
import { lalamoveConfig } from './lalamove.config.js';
import { formatPhilippineDeliveryAddress } from '../utils/address-formatter.js';

export interface DeliveryProvider {
  getAvailableServices(cityCode?: string): Promise<{ services: string[] }>;
  getQuotation(request: DeliveryQuoteRequest): Promise<DeliveryQuotationSnapshot>;
  placeDeliveryOrder(quotationId: string, stopDetails: LalamoveDeliveryStop[]): Promise<{ orderId: string; trackingUrl?: string }>;
  getOrder(providerOrderId: string): Promise<{ status: string; driver?: unknown }>;
  cancelOrder(providerOrderId: string): Promise<{ success: boolean }>;
}

export class LalamoveProvider implements DeliveryProvider {
  /**
   * Builds a Lalamove-compatible delivery stop representation from a DeliveryLocation.
   */
  public buildDeliveryStop(location: DeliveryLocation): LalamoveDeliveryStop {
    return {
      coordinates: {
        lat: location.latitude,
        lng: location.longitude,
      },
      address: location.formattedAddress || formatPhilippineDeliveryAddress(location),
      name: location.recipientName,
      phone: location.recipientPhone,
    };
  }

  /**
   * Generates a unique, server-side Request-ID for Lalamove API idempotency and tracing.
   */
  public generateRequestId(): string {
    return `req_${Date.now()}_${randomUUID().slice(0, 8)}`;
  }

  /**
   * Future method: Get supported service types / vehicles for a city from Lalamove City Info endpoint.
   * In this phase, not yet called.
   */
  async getAvailableServices(_cityCode?: string): Promise<{ services: string[] }> {
    // To be connected with Lalamove v3 GET /v3/cities/{cityCode} in the next phase
    return { services: [] };
  }

  /**
   * Future method: Request live delivery fee quotation from Lalamove API.
   * In this phase, not yet called.
   */
  async getQuotation(_request: DeliveryQuoteRequest): Promise<DeliveryQuotationSnapshot> {
    // To be connected with Lalamove v3 POST /v3/quotations in the next phase
    return {
      quotationId: null,
      quotedAt: null,
      expiresAt: null,
      amount: null,
      currency: 'PHP',
      serviceType: null,
    };
  }

  /**
   * Future method: Place Lalamove delivery order after customer confirms checkout.
   */
  async placeDeliveryOrder(
    _quotationId: string,
    _stopDetails: LalamoveDeliveryStop[],
  ): Promise<{ orderId: string; trackingUrl?: string }> {
    // To be connected with Lalamove v3 POST /v3/orders in the next phase
    throw new Error('Lalamove order placement will be connected in the next integration phase.');
  }

  /**
   * Future method: Retrieve delivery status and driver coordinates from Lalamove.
   */
  async getOrder(_providerOrderId: string): Promise<{ status: string; driver?: unknown }> {
    throw new Error('Lalamove getOrder will be connected in the next integration phase.');
  }

  /**
   * Future method: Cancel an unassigned/pending delivery order.
   */
  async cancelOrder(_providerOrderId: string): Promise<{ success: boolean }> {
    throw new Error('Lalamove cancelOrder will be connected in the next integration phase.');
  }

  /**
   * Safe server-side provider request logger that strictly omits secrets, signatures, and credentials.
   */
  public logProviderAction(action: string, orderId: string, details: Record<string, unknown>): void {
    const requestId = this.generateRequestId();
    // Safe structured logging without exposing apiKey or apiSecret
    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        provider: 'LALAMOVE',
        env: lalamoveConfig.env,
        market: lalamoveConfig.market,
        action,
        requestId,
        orderId,
        details,
      }),
    );
  }
}

export const lalamoveProvider = new LalamoveProvider();
