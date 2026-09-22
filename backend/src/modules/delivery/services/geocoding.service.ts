/**
 * Geocoding Service Boundary
 *
 * Resolves geographical coordinates (latitude & longitude) from structured
 * Philippine delivery locations, via the Mapbox Geocoding API v6.
 *
 * CRITICAL SAFETY RULES (unchanged since before a real provider was wired in):
 * 1. NEVER invent or hallucinate coordinates.
 * 2. NEVER silently substitute barangay/city center centroids as the customer's
 *    delivery destination. Mapbox's own geocoder can itself return exactly this
 *    kind of low-precision match when it can't find the exact address - see the
 *    `accuracy` check below, which treats that the same as a failure.
 * 3. A geocoding failure never blocks checkout - coordinates simply stay null
 *    (geocodingStatus "failed"/"pending") until PanelScan staff set them via
 *    PATCH /api/delivery/orders/:orderId/coordinates.
 *
 * `permanent=true` is always sent (see resolveDeliveryCoordinates below) -
 * PanelScan stores the returned coordinates on the order, which Mapbox's
 * terms classify as "permanent" (as opposed to a one-off, unstored lookup),
 * and requires this flag plus a billing-enabled account regardless of volume.
 */

import { env } from '../../../config/env.js';
import type { DeliveryLocation, GeocodingStatus } from '../delivery.domain.js';
import { formatPhilippineDeliveryAddress } from '../utils/address-formatter.js';

export interface GeocodingResult {
  latitude: number | null;
  longitude: number | null;
  geocodingStatus: GeocodingStatus;
  geocodingProvider: string | null;
  geocodingPlaceId: string | null;
}

// Mapbox's documented coordinates.accuracy values (Geocoding API v6). Only
// these two mean "a real, specific point" - "parcel"/"point"/"approximate"
// are a property-boundary or zipcode-centroid guess, which this project
// treats as not good enough to send a driver to.
const PRECISE_ACCURACY_VALUES = new Set(['rooftop', 'interpolated']);

interface MapboxFeature {
  properties?: {
    mapbox_id?: string;
    coordinates?: {
      longitude?: number;
      latitude?: number;
      accuracy?: string;
    };
  };
}

interface MapboxGeocodeResponse {
  features?: MapboxFeature[];
  message?: string; // present on error responses (e.g. bad token, bad params)
}

const NOT_CONFIGURED: GeocodingResult = { latitude: null, longitude: null, geocodingStatus: 'pending', geocodingProvider: null, geocodingPlaceId: null };
const failed = (placeId: string | null = null): GeocodingResult => ({ latitude: null, longitude: null, geocodingStatus: 'failed', geocodingProvider: 'mapbox', geocodingPlaceId: placeId });

export class GeocodingService {
  /**
   * Resolves exact delivery coordinates. Returns `pending` (not `failed`)
   * when no access token is configured at all, matching this method's
   * original pre-integration behavior exactly - existing callers/tests that
   * never set MAPBOX_ACCESS_TOKEN see no change.
   */
  async resolveDeliveryCoordinates(location: Omit<DeliveryLocation, 'latitude' | 'longitude' | 'geocodingStatus'>): Promise<GeocodingResult> {
    if (!env.MAPBOX_ACCESS_TOKEN) {
      return NOT_CONFIGURED;
    }

    const addressQuery = location.formattedAddress || formatPhilippineDeliveryAddress(location);
    const params = new URLSearchParams({
      q: addressQuery,
      access_token: env.MAPBOX_ACCESS_TOKEN,
      country: 'ph',
      language: 'en',
      limit: '1',
      permanent: 'true', // coordinates are stored on the order - see file header
    });

    let response: Response;
    try {
      response = await fetch(`https://api.mapbox.com/search/geocode/v6/forward?${params.toString()}`, {
        signal: AbortSignal.timeout(8000), // Checkout is customer-facing - never let a slow/hanging call stall it.
      });
    } catch (error) {
      console.error('[geocoding] Could not reach the Mapbox Geocoding API:', error);
      return failed();
    }

    let body: MapboxGeocodeResponse;
    try {
      body = (await response.json()) as MapboxGeocodeResponse;
    } catch {
      console.error('[geocoding] Mapbox Geocoding API returned an unreadable response.');
      return failed();
    }

    if (!response.ok) {
      console.error(`[geocoding] Mapbox Geocoding API returned HTTP ${response.status}${body.message ? `: ${body.message}` : ''}`);
      return failed();
    }

    if (!body.features || body.features.length === 0) {
      return failed(); // A real "no match" for this address - not an error worth logging.
    }

    const feature = body.features[0]!;
    const coords = feature.properties?.coordinates;
    const lat = coords?.latitude;
    const lng = coords?.longitude;
    const accuracy = coords?.accuracy;
    const placeId = feature.properties?.mapbox_id ?? null;

    if (typeof lat !== 'number' || typeof lng !== 'number') {
      console.error('[geocoding] Mapbox Geocoding API response was missing coordinates.');
      return failed(placeId);
    }

    if (!accuracy || !PRECISE_ACCURACY_VALUES.has(accuracy)) {
      // A "parcel"/"point"/"approximate" match is exactly the "barangay/city
      // centroid" this service is forbidden from using as a delivery point -
      // left for PanelScan staff to confirm manually instead.
      console.warn(`[geocoding] "${addressQuery}" only matched at ${accuracy ?? 'an unknown'} accuracy - too imprecise to dispatch to; leaving for manual entry.`);
      return failed(placeId);
    }

    return { latitude: lat, longitude: lng, geocodingStatus: 'completed', geocodingProvider: 'mapbox', geocodingPlaceId: placeId };
  }
}

export const geocodingService = new GeocodingService();
