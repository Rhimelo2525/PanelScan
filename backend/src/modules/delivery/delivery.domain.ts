/**
 * Canonical Delivery Domain Models & Lalamove Integration Types
 *
 * This module defines the domain models for PanelScan delivery management,
 * structured address representations, and the contract boundary for the upcoming
 * official Lalamove API integration.
 */

export interface DeliveryCoordinates {
  lat: number | null;
  lng: number | null;
}

export type GeocodingStatus = 'pending' | 'completed' | 'failed' | 'not_required';

export interface DeliveryLocation {
  // Customer-readable / PanelScan address line
  addressLine1: string; // Street, building, house/unit number

  // PSGC Administrative hierarchy
  regionCode: string;
  regionName: string;

  provinceCode: string | null; // null for NCR
  provinceName: string | null; // null for NCR

  cityMunicipalityCode: string;
  cityMunicipalityName: string;

  barangayCode: string;
  barangayName: string;

  postalCode: string;

  // Single authoritative normalized address string
  formattedAddress: string;

  // Recipient information snapshot
  recipientName?: string;
  recipientPhone?: string; // E.164 formatted (+639XXXXXXXXX)

  // Geospatial information for delivery integrations (Lalamove stops)
  // NEVER fake coordinates or use city/barangay centroids. Null until verified.
  latitude: number | null;
  longitude: number | null;

  // Geocoder metadata
  geocodingStatus: GeocodingStatus;
  geocodingProvider?: string | null;
  geocodingPlaceId?: string | null;
}

/**
 * Lalamove Stop representation required by Lalamove v3 API.
 */
export interface LalamoveDeliveryStop {
  coordinates: {
    lat: string | number | null;
    lng: string | number | null;
  };
  address: string;
  name?: string;
  phone?: string;
  remarks?: string;
}

/**
 * Pickup + Dropoff route structure.
 * Dropoff comes from customer checkout address.
 * Pickup comes from PanelScan warehouse/store configuration.
 */
export interface DeliveryRoute {
  pickup: DeliveryLocation;
  dropoff: DeliveryLocation;
}

/**
 * Quotation request domain model.
 * Vehicle selection (serviceType) will be determined dynamically
 * via Lalamove City Info in the next integration phase based on
 * order weight, dimensions, and Lalamove market options.
 */
export interface DeliveryQuoteRequest {
  pickup: DeliveryLocation;
  dropoff: DeliveryLocation;
  serviceType: string | null; // e.g. MOTORCYCLE, SEDAN, VAN, TRUCK (dynamic from provider)
  scheduleAt: string | null;
  specialRequests: string[];
}

/**
 * Future Quotation Snapshot data model.
 */
export interface DeliveryQuotationSnapshot {
  quotationId: string | null;
  quotedAt: string | null;
  expiresAt: string | null;
  amount: number | null;
  currency: string;
  serviceType: string | null;
}

/**
 * Standardized Delivery Business Errors.
 * Frontend receives safe business errors; internal provider payloads and secrets
 * are never leaked to the client.
 */
export const DELIVERY_ERRORS = {
  DELIVERY_ADDRESS_INVALID: 'DELIVERY_ADDRESS_INVALID',
  DELIVERY_OUTSIDE_PANELSCAN_COVERAGE: 'DELIVERY_OUTSIDE_PANELSCAN_COVERAGE',
  DELIVERY_COORDINATES_REQUIRED: 'DELIVERY_COORDINATES_REQUIRED',
  DELIVERY_PROVIDER_UNAVAILABLE: 'DELIVERY_PROVIDER_UNAVAILABLE',
  DELIVERY_QUOTATION_EXPIRED: 'DELIVERY_QUOTATION_EXPIRED',
  DELIVERY_OUT_OF_SERVICE_AREA: 'DELIVERY_OUT_OF_SERVICE_AREA',
} as const;

export type DeliveryErrorCode = (typeof DELIVERY_ERRORS)[keyof typeof DELIVERY_ERRORS];
