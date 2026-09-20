/**
 * Geocoding Service Boundary
 *
 * Prepares the integration boundary for resolving geographical coordinates (latitude & longitude)
 * from structured Philippine delivery locations.
 *
 * CRITICAL SAFETY RULES:
 * 1. NEVER invent or hallucinate coordinates.
 * 2. NEVER silently substitute barangay/city center centroids as the customer's delivery destination.
 * 3. Coordinates remain null with status "pending" until an official geocoder (e.g. Google Maps Geocoding API / Mapbox / Lalamove address lookup) is explicitly configured.
 */

import type { DeliveryLocation, GeocodingStatus } from '../delivery.domain.js';

export interface GeocodingResult {
  latitude: number | null;
  longitude: number | null;
  geocodingStatus: GeocodingStatus;
  geocodingProvider: string | null;
  geocodingPlaceId: string | null;
}

export class GeocodingService {
  /**
   * Resolves exact delivery coordinates.
   * Currently returns pending status and null coordinates until an authorized provider is wired.
   */
  async resolveDeliveryCoordinates(_location: Omit<DeliveryLocation, 'latitude' | 'longitude' | 'geocodingStatus'>): Promise<GeocodingResult> {
    // Structural boundary ready for Google Maps / Geocoding provider in the Lalamove phase.
    // For this phase, preserve integrity by never inventing fake coordinates.
    return {
      latitude: null,
      longitude: null,
      geocodingStatus: 'pending',
      geocodingProvider: null,
      geocodingPlaceId: null,
    };
  }
}

export const geocodingService = new GeocodingService();
