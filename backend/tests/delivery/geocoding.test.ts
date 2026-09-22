import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DeliveryLocation } from '../../src/modules/delivery/delivery.domain';
import { geocodingService } from '../../src/modules/delivery/services/geocoding.service';

// Mocked per-test so both the "no token configured" and "token configured"
// paths can be exercised in one file - env.ts is a frozen singleton parsed
// once at process start, so this is the only way to vary MAPBOX_ACCESS_TOKEN
// here without touching the shared .env.test used by the rest of the suite.
// Hoisted above the imports above by vitest, so the static import already
// resolves to this mocked module.
let mockAccessToken: string | undefined;
vi.mock('../../src/config/env', () => ({ env: new Proxy({}, { get: (_target, prop) => (prop === 'MAPBOX_ACCESS_TOKEN' ? mockAccessToken : undefined) }) }));

const location = (): Omit<DeliveryLocation, 'latitude' | 'longitude' | 'geocodingStatus'> => ({
  addressLine1: '1 M. Villarica Rd',
  regionCode: '030000000',
  regionName: 'Region III',
  provinceCode: '031400000',
  provinceName: 'Bulacan',
  cityMunicipalityCode: '030905000',
  cityMunicipalityName: 'City of San Jose del Monte',
  barangayCode: '030905001',
  barangayName: 'Tungkong Mangga',
  postalCode: '3023',
  formattedAddress: '1 M. Villarica Rd, Tungkong Mangga, City of San Jose del Monte, Bulacan 3023, Philippines',
  recipientName: 'Juan Dela Cruz',
  recipientPhone: '+639171234567',
});

const mapboxResponse = (overrides: Record<string, unknown> = {}) => ({
  ok: true,
  json: async () => ({
    features: [
      {
        properties: {
          mapbox_id: 'place_123',
          coordinates: { latitude: 14.808, longitude: 121.042, accuracy: 'rooftop' },
          ...overrides,
        },
      },
    ],
  }),
});

afterEach(() => {
  vi.unstubAllGlobals();
  mockAccessToken = undefined;
});

describe('GeocodingService', () => {
  it('returns "pending" (not "failed"), never calling the network, when no access token is configured - unchanged from before a geocoder existed', async () => {
    mockAccessToken = undefined;
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await geocodingService.resolveDeliveryCoordinates(location());

    expect(result).toEqual({ latitude: null, longitude: null, geocodingStatus: 'pending', geocodingProvider: null, geocodingPlaceId: null });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('resolves real coordinates for a precise (rooftop) match', async () => {
    mockAccessToken = 'fake-test-token';
    const fetchSpy = vi.fn().mockResolvedValue(mapboxResponse());
    vi.stubGlobal('fetch', fetchSpy);

    const result = await geocodingService.resolveDeliveryCoordinates(location());

    expect(result).toEqual({ latitude: 14.808, longitude: 121.042, geocodingStatus: 'completed', geocodingProvider: 'mapbox', geocodingPlaceId: 'place_123' });
    const [url] = fetchSpy.mock.calls[0] as [string];
    expect(url).toContain('api.mapbox.com/search/geocode/v6/forward');
    expect(url).toContain('access_token=fake-test-token');
    expect(url).toContain('country=ph');
    expect(url).toContain('permanent=true');
  });

  it('accepts an interpolated match as precise enough', async () => {
    mockAccessToken = 'fake-test-token';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mapboxResponse({ coordinates: { latitude: 14.8, longitude: 121.0, accuracy: 'interpolated' } })));

    const result = await geocodingService.resolveDeliveryCoordinates(location());

    expect(result.geocodingStatus).toBe('completed');
  });

  it.each(['parcel', 'point', 'approximate'])(
    'refuses a %s match - the same "no fabricated centroid" rule this project enforces everywhere else',
    async (accuracy) => {
      mockAccessToken = 'fake-test-token';
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mapboxResponse({ coordinates: { latitude: 14.8, longitude: 121.0, accuracy } })));

      const result = await geocodingService.resolveDeliveryCoordinates(location());

      expect(result.latitude).toBeNull();
      expect(result.longitude).toBeNull();
      expect(result.geocodingStatus).toBe('failed');
      expect(result.geocodingPlaceId).toBe('place_123'); // kept for staff reference even though not used automatically
    },
  );

  it('returns "failed" for zero features without logging it as an error', async () => {
    mockAccessToken = 'fake-test-token';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [] }) }));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await geocodingService.resolveDeliveryCoordinates(location());

    expect(result).toEqual({ latitude: null, longitude: null, geocodingStatus: 'failed', geocodingProvider: 'mapbox', geocodingPlaceId: null });
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it.each([401, 422, 500])('returns "failed" (never throws) for an HTTP %i error response', async (status) => {
    mockAccessToken = 'fake-test-token';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status, json: async () => ({ message: 'details' }) }));

    await expect(geocodingService.resolveDeliveryCoordinates(location())).resolves.toMatchObject({ geocodingStatus: 'failed', latitude: null });
  });

  it('returns "failed" (never throws) on a network error', async () => {
    mockAccessToken = 'fake-test-token';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));

    await expect(geocodingService.resolveDeliveryCoordinates(location())).resolves.toMatchObject({ geocodingStatus: 'failed' });
  });

  it('returns "failed" (never throws) on an unparseable response body', async () => {
    mockAccessToken = 'fake-test-token';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new Error('not json'); } }));

    await expect(geocodingService.resolveDeliveryCoordinates(location())).resolves.toMatchObject({ geocodingStatus: 'failed' });
  });

  it('never sends the access token anywhere but the request URL itself (no stray logging of the raw token value)', async () => {
    mockAccessToken = 'fake-test-token-should-not-leak';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mapboxResponse()));
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await geocodingService.resolveDeliveryCoordinates(location());

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
