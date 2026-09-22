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

/** One stop as Lalamove's quotation response assigns it - the stopId here MUST be reused verbatim when placing the order. */
export interface LalamoveQuotedStop {
  stopId: string;
  coordinates: { lat: string; lng: string };
  address: string;
}

/**
 * Quotation Snapshot data model. Carries everything `placeDeliveryOrder`
 * needs (the raw stopIds Lalamove assigned), so a quotation obtained once
 * can be booked later without re-deriving stop data. Non-committal and free
 * to request - Lalamove does not charge or dispatch anything for a quotation.
 */
export interface DeliveryQuotationSnapshot {
  quotationId: string;
  quotedAt: string;
  expiresAt: string;
  amount: number;
  currency: string;
  serviceType: string;
  distanceMeters: number | null;
  stops: LalamoveQuotedStop[];
}

/** A Lalamove service type (vehicle) as returned by GET /v3/cities, e.g. MOTORCYCLE, SEDAN, VAN. */
export interface LalamoveServiceType {
  key: string;
  description: string | null;
  maxWeightKg: number | null;
  dimensionsMeters: { length: number; width: number; height: number } | null;
}

/** The real Lalamove v3 order statuses (see providers/lalamove.provider.ts). Stored verbatim in Delivery.deliveryStatus. */
export const LALAMOVE_ORDER_STATUSES = ['ASSIGNING_DRIVER', 'ON_GOING', 'PICKED_UP', 'COMPLETED', 'CANCELED', 'REJECTED', 'EXPIRED'] as const;
export type LalamoveOrderStatus = (typeof LALAMOVE_ORDER_STATUSES)[number];

export interface LalamoveOrderResult {
  orderId: string;
  status: string;
  shareLink: string | null;
  priceBreakdown: { total: number; currency: string } | null;
  driverId: string | null;
}

export interface LalamoveDriverDetails {
  driverId: string;
  name: string | null;
  phone: string | null;
  plateNumber: string | null;
  photoUrl: string | null;
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
  DELIVERY_PROVIDER_NOT_CONFIGURED: 'DELIVERY_PROVIDER_NOT_CONFIGURED',
} as const;

export type DeliveryErrorCode = (typeof DELIVERY_ERRORS)[keyof typeof DELIVERY_ERRORS];
