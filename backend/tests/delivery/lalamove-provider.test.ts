import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DeliveryLocation, DeliveryQuoteRequest } from '../../src/modules/delivery/delivery.domain';
import { __resetLalamoveServiceTypeCacheForTests, LalamoveProvider } from '../../src/modules/delivery/providers/lalamove.provider';

const provider = new LalamoveProvider();

const location = (overrides: Partial<DeliveryLocation> = {}): DeliveryLocation => ({
  addressLine1: '123 Test St',
  regionCode: '',
  regionName: '',
  provinceCode: null,
  provinceName: 'Bulacan',
  cityMunicipalityCode: '',
  cityMunicipalityName: 'City of San Jose del Monte',
  barangayCode: '',
  barangayName: 'Test Barangay',
  postalCode: '3023',
  formattedAddress: '123 Test St, Test Barangay, City of San Jose del Monte, Bulacan 3023, Philippines',
  recipientName: 'Juan Dela Cruz',
  recipientPhone: '+639171234567',
  latitude: 14.8136,
  longitude: 121.045,
  geocodingStatus: 'completed',
  ...overrides,
});

const quoteRequest = (overrides: Partial<DeliveryQuoteRequest> = {}): DeliveryQuoteRequest => ({
  pickup: location({ addressLine1: 'Warehouse' }),
  dropoff: location(),
  serviceType: 'MOTORCYCLE',
  scheduleAt: null,
  specialRequests: [],
  ...overrides,
});

const jsonResponse = (status: number, body: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

/** Captures the single fetch() call the provider made, for header/body assertions. */
const stubFetchOnce = (response: unknown): { calls: Array<[string, RequestInit]> } => {
  const fn = vi.fn().mockResolvedValue(response);
  vi.stubGlobal('fetch', fn);
  return { get calls() { return fn.mock.calls as Array<[string, RequestInit]>; } };
};

// getAvailableServices() caches a successful result for an hour (see
// SERVICE_TYPE_CACHE_TTL_MS) in a module-level singleton - reset it before
// every test so one test's mocked response can never leak into the next.
beforeEach(() => __resetLalamoveServiceTypeCacheForTests());
afterEach(() => vi.unstubAllGlobals());

describe('LalamoveProvider', () => {
  describe('request signing on the wire', () => {
    it('sends a signed Authorization header, Market: PH, and a Request-ID on every call', async () => {
      const { calls } = stubFetchOnce(jsonResponse(200, { data: [] }));

      await provider.getAvailableServices();

      const [url, init] = calls[0]!;
      expect(url).toMatch(/\/v3\/cities$/);
      expect(init.method).toBe('GET');
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toMatch(/^hmac pk_test_fake_key_for_testing_only:\d+:[0-9a-f]{64}$/);
      expect(headers.Market).toBe('PH');
      expect(typeof headers['Request-ID']).toBe('string');
    });

    it('never puts the API secret anywhere in the outgoing request', async () => {
      const { calls } = stubFetchOnce(jsonResponse(200, { data: [] }));
      await provider.getAvailableServices();
      const [url, init] = calls[0]!;
      const headers = init.headers as Record<string, string>;
      expect(JSON.stringify({ url, headers, body: init.body })).not.toContain('sk_test_fake_secret_for_testing_only');
    });
  });

  // Fixture shapes below (locode, nested {value,unit} for dimensions/load) match
  // the REAL Lalamove production response, verified live against GET /v3/cities
  // with the real account credentials - not guessed. See PROJECT_NOTES.txt.
  describe('getAvailableServices', () => {
    it('parses services across Luzon cities, de-duplicates by key, and reads the nested {value,unit} dimension/load shape', async () => {
      stubFetchOnce(
        jsonResponse(200, {
          data: [
            {
              locode: 'PH MNL',
              services: [
                { key: 'MOTORCYCLE', description: 'Motorbike', dimensions: { length: { value: '0.5', unit: 'm' }, width: { value: '0.4', unit: 'm' }, height: { value: '0.4', unit: 'm' } }, load: { value: '20', unit: 'kg' } },
              ],
            },
            {
              locode: 'PH PAM',
              services: [
                { key: 'MOTORCYCLE', description: 'Motorbike', load: { value: '20', unit: 'kg' } },
                { key: 'VAN', description: 'Van', load: { value: '700', unit: 'kg' } },
              ],
            },
          ],
        }),
      );

      const services = await provider.getAvailableServices();

      expect(services.map((s) => s.key).sort()).toEqual(['MOTORCYCLE', 'VAN']);
      expect(services.find((s) => s.key === 'MOTORCYCLE')?.maxWeightKg).toBe(20);
      expect(services.find((s) => s.key === 'MOTORCYCLE')?.dimensionsMeters).toEqual({ length: 0.5, width: 0.4, height: 0.4 });
    });

    it('excludes cities outside PanelScan\'s Luzon coverage (e.g. Cebu), even though Lalamove returns them', async () => {
      stubFetchOnce(
        jsonResponse(200, {
          data: [
            { locode: 'PH CEB', services: [{ key: '2000KG_ALUMINUM', description: 'Cebu-only van', load: { value: '2000', unit: 'kg' } }] },
            { locode: 'PH MNL', services: [{ key: 'VAN', description: 'Van', load: { value: '700', unit: 'kg' } }] },
          ],
        }),
      );

      const services = await provider.getAvailableServices();

      expect(services.map((s) => s.key)).toEqual(['VAN']);
    });

    it('reports dimensionsMeters as null (never a fabricated 0x0x0) when Lalamove omits it', async () => {
      stubFetchOnce(jsonResponse(200, { data: [{ locode: 'PH MNL', services: [{ key: 'VAN', load: { value: '700', unit: 'kg' } }] }] }));

      const services = await provider.getAvailableServices();

      expect(services[0]?.dimensionsMeters).toBeNull();
    });

    it('does not throw when the response has an unexpected shape - returns an empty list instead', async () => {
      stubFetchOnce(jsonResponse(200, { data: [{}] }));
      await expect(provider.getAvailableServices()).resolves.toEqual([]);
    });

    it('caches a successful result and does not re-fetch on the next call', async () => {
      const { calls } = stubFetchOnce(jsonResponse(200, { data: [{ locode: 'PH MNL', services: [{ key: 'VAN' }] }] }));

      const first = await provider.getAvailableServices();
      const second = await provider.getAvailableServices();

      expect(calls).toHaveLength(1); // only the first call actually hit fetch()
      expect(second).toEqual(first);
    });
  });

  describe('getQuotation', () => {
    it('requires both stops to have coordinates before calling the provider at all', async () => {
      const { calls } = stubFetchOnce(jsonResponse(200, {}));
      await expect(provider.getQuotation(quoteRequest({ dropoff: location({ latitude: null }) }))).rejects.toThrow(/coordinates/i);
      expect(calls).toHaveLength(0);
    });

    it('sends stops built from pickup/dropoff and returns a parsed snapshot with usable stop ids', async () => {
      const { calls } = stubFetchOnce(
        jsonResponse(200, {
          data: {
            quotationId: 'quo_123',
            expiresAt: '2026-01-01T00:05:00.000Z',
            serviceType: 'MOTORCYCLE',
            priceBreakdown: { total: '89.00', currency: 'PHP' },
            distance: { value: 5200, unit: 'm' },
            stops: [
              { stopId: 'stop_pickup', coordinates: { lat: '14.8136', lng: '121.0450' }, address: 'Warehouse' },
              { stopId: 'stop_dropoff', coordinates: { lat: '14.8136', lng: '121.0450' }, address: 'Customer' },
            ],
          },
        }),
      );

      const result = await provider.getQuotation(quoteRequest());

      const [, init] = calls[0]!;
      const sentBody = JSON.parse(init.body as string);
      expect(sentBody.data.serviceType).toBe('MOTORCYCLE');
      expect(sentBody.data.stops).toHaveLength(2);

      expect(result).toMatchObject({ quotationId: 'quo_123', amount: 89, currency: 'PHP', serviceType: 'MOTORCYCLE', distanceMeters: 5200 });
      expect(result.stops.map((s) => s.stopId)).toEqual(['stop_pickup', 'stop_dropoff']);
    });

    it('throws a clear error when the provider omits usable stop ids, rather than returning unbookable data', async () => {
      stubFetchOnce(jsonResponse(200, { data: { quotationId: 'quo_1', priceBreakdown: { total: 10 }, stops: [{ stopId: '' }, { stopId: '' }] } }));
      await expect(provider.getQuotation(quoteRequest())).rejects.toThrow(/stop/i);
    });
  });

  // Uses cancelOrder() rather than getAvailableServices() here deliberately:
  // getAvailableServices() caches a successful result for an hour (see
  // SERVICE_TYPE_CACHE_TTL_MS), which would make these error-path tests
  // flaky depending on test order within the shared process (vitest runs
  // this whole suite as a single fork - see vitest.config.ts). cancelOrder()
  // always hits the network fresh, so it exercises request()'s error mapping
  // in isolation from that caching behavior.
  describe('error mapping', () => {
    it('maps a 4xx business error to a 400 AppError carrying the provider message', async () => {
      stubFetchOnce(jsonResponse(400, { message: 'Invalid service type for this market.' }));
      await expect(provider.cancelOrder('order_1')).rejects.toMatchObject({ statusCode: 400, message: 'Invalid service type for this market.' });
    });

    it('maps a 401 (our own credentials rejected) to a 502 without leaking Lalamove\'s detail', async () => {
      stubFetchOnce(jsonResponse(401, { message: 'invalid signature' }));
      await expect(provider.cancelOrder('order_1')).rejects.toMatchObject({ statusCode: 502 });
    });

    it('maps a 5xx upstream failure to a 503', async () => {
      stubFetchOnce(jsonResponse(500, {}));
      await expect(provider.cancelOrder('order_1')).rejects.toMatchObject({ statusCode: 503 });
    });

    it('maps a network failure (fetch throws) to a 503', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));
      await expect(provider.cancelOrder('order_1')).rejects.toMatchObject({ statusCode: 503 });
    });

    it('tolerates a response with no JSON body at all (e.g. a 200 with empty body)', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error('no body'); } }));
      await expect(provider.cancelOrder('order_1')).resolves.toEqual({ success: true });
    });
  });

  describe('placeDeliveryOrder / getOrder / getDriverDetails / cancelOrder', () => {
    it('places an order using the given quotationId and stop ids, and parses the result', async () => {
      const { calls } = stubFetchOnce(jsonResponse(200, { data: { orderId: 'order_1', status: 'ASSIGNING_DRIVER', shareLink: 'https://share.lalamove.com/x', priceBreakdown: { total: 89, currency: 'PHP' } } }));

      const result = await provider.placeDeliveryOrder('quo_123', 'stop_pickup', { stopId: 'stop_dropoff', name: 'Juan', phone: '+639171234567' }, 'order_ref_1');

      const [, init] = calls[0]!;
      const sentBody = JSON.parse(init.body as string);
      expect(sentBody.data.quotationId).toBe('quo_123');
      expect(sentBody.data.sender.stopId).toBe('stop_pickup');
      expect(sentBody.data.recipients[0].stopId).toBe('stop_dropoff');
      expect(result).toMatchObject({ orderId: 'order_1', status: 'ASSIGNING_DRIVER', shareLink: 'https://share.lalamove.com/x' });
    });

    it('gets live order status and driver id', async () => {
      stubFetchOnce(jsonResponse(200, { data: { orderId: 'order_1', status: 'ON_GOING', driverId: 'driver_1' } }));
      const result = await provider.getOrder('order_1');
      expect(result).toMatchObject({ orderId: 'order_1', status: 'ON_GOING', driverId: 'driver_1' });
    });

    it('gets driver details', async () => {
      stubFetchOnce(jsonResponse(200, { data: { name: 'Pedro Santos', phone: '+639179999999', plateNumber: 'ABC123' } }));
      const result = await provider.getDriverDetails('order_1', 'driver_1');
      expect(result).toEqual({ driverId: 'driver_1', name: 'Pedro Santos', phone: '+639179999999', plateNumber: 'ABC123', photoUrl: null });
    });

    it('cancels an order via DELETE /v3/orders/{id}', async () => {
      const { calls } = stubFetchOnce(jsonResponse(200, {}));
      const result = await provider.cancelOrder('order_1');
      expect(calls[0]![1].method).toBe('DELETE');
      expect(calls[0]![0]).toMatch(/\/v3\/orders\/order_1$/);
      expect(result).toEqual({ success: true });
    });

    it('surfaces a Lalamove rejection (e.g. already picked up) as a normal AppError, not a silent failure', async () => {
      stubFetchOnce(jsonResponse(400, { message: 'Order cannot be cancelled after pickup.' }));
      await expect(provider.cancelOrder('order_1')).rejects.toMatchObject({ statusCode: 400, message: 'Order cannot be cancelled after pickup.' });
    });
  });
});
