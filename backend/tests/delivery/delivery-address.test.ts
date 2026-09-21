import { describe, expect, it } from 'vitest';

import {
  getPsgcRegions,
  getPsgcCities,
  getPsgcBarangays,
  validatePsgcHierarchy,
} from '../../src/modules/delivery/data/psgc-luzon.data.js';
import {
  isLocationInPanelScanCoverage,
} from '../../src/modules/delivery/delivery-coverage.config.js';
import { formatPhilippineDeliveryAddress } from '../../src/modules/delivery/utils/address-formatter.js';
import {
  isValidPhilippinePhone,
  normalizePhilippinePhone,
} from '../../src/modules/delivery/utils/phone-normalizer.js';
import { geocodingService } from '../../src/modules/delivery/services/geocoding.service.js';
import { lalamoveProvider } from '../../src/modules/delivery/providers/lalamove.provider.js';
import type { DeliveryLocation } from '../../src/modules/delivery/delivery.domain.js';

describe('Delivery Address & Lalamove Integration Readiness', () => {
  describe('PSGC Luzon Hierarchy', () => {
    it('provides whitelisted Luzon regions and excludes Visayas and Mindanao', () => {
      const regions = getPsgcRegions();
      expect(regions.length).toBeGreaterThan(0);
      expect(regions.some((r) => r.code === '130000000')).toBe(true); // NCR
      expect(regions.some((r) => r.code === '030000000')).toBe(true); // Region III
      // Should not contain Visayas / Mindanao
      expect(regions.some((r) => r.code === '070000000')).toBe(false); // Central Visayas
      expect(regions.some((r) => r.code === '110000000')).toBe(false); // Davao
    });

    it('validates a correct provincial hierarchy (Bulacan -> CSJDM -> Tungkong Mangga)', () => {
      const result = validatePsgcHierarchy({
        regionCode: '030000000',
        provinceCode: '031400000',
        cityMunicipalityCode: '031420000',
        barangayCode: '031420042',
      });
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('rejects an invalid province or city mismatch', () => {
      const result = validatePsgcHierarchy({
        regionCode: '030000000',
        provinceCode: '045800000', // Rizal province passed with Region III
        cityMunicipalityCode: '031420000',
        barangayCode: '031420042',
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('does not belong to region');
    });

    it('NCR Special Handling: requires provinceCode to be null and succeeds with Quezon City -> Central', () => {
      const validNcr = validatePsgcHierarchy({
        regionCode: '130000000',
        provinceCode: null,
        cityMunicipalityCode: '137404000',
        barangayCode: '137404020',
      });
      expect(validNcr.isValid).toBe(true);

      const invalidNcrWithProvince = validatePsgcHierarchy({
        regionCode: '130000000',
        provinceCode: '031400000', // fake or invented province
        cityMunicipalityCode: '137404000',
        barangayCode: '137404020',
      });
      expect(invalidNcrWithProvince.isValid).toBe(false);
      expect(invalidNcrWithProvince.error).toContain('NCR does not have a province');
    });
  });

  describe('Preliminary Delivery Coverage Configuration', () => {
    it('allows whitelisted Luzon routes', () => {
      expect(isLocationInPanelScanCoverage('130000000', null)).toBe(true); // NCR
      expect(isLocationInPanelScanCoverage('030000000', '031400000')).toBe(true); // Bulacan
      expect(isLocationInPanelScanCoverage('040000000', '045800000')).toBe(true); // Rizal
    });

    it('strictly denies Visayas, Mindanao, and excluded island provinces', () => {
      expect(isLocationInPanelScanCoverage('070000000', null)).toBe(false); // Cebu / Visayas
      expect(isLocationInPanelScanCoverage('110000000', null)).toBe(false); // Davao / Mindanao
      expect(isLocationInPanelScanCoverage('170000000', '175300000')).toBe(false); // Palawan
    });
  });

  describe('Address Normalization Formatter', () => {
    it('normalizes standard provincial address correctly', () => {
      const formatted = formatPhilippineDeliveryAddress({
        addressLine1: 'Block 5 Lot 8, Sample Subdivision',
        barangayName: 'Tungkong Mangga',
        cityMunicipalityName: 'City of San Jose del Monte',
        provinceName: 'Bulacan',
        regionName: 'Region III – Central Luzon',
        postalCode: '3023',
      });

      expect(formatted).toBe(
        'Block 5 Lot 8, Sample Subdivision, Tungkong Mangga, City of San Jose del Monte, Bulacan 3023, Philippines',
      );
    });

    it('normalizes NCR address without inventing a fake province', () => {
      const formatted = formatPhilippineDeliveryAddress({
        addressLine1: 'Unit 12B, Tower 1, High Street',
        barangayName: 'Central',
        cityMunicipalityName: 'Quezon City',
        provinceName: null,
        regionName: 'National Capital Region (NCR)',
        postalCode: '1100',
      });

      expect(formatted).toBe('Unit 12B, Tower 1, High Street, Central, Quezon City 1100, Philippines');
      expect(formatted).not.toContain('Metro Manila Province');
    });
  });

  describe('Phone Normalization', () => {
    it('normalizes Philippine mobile formats to standard E.164 (+639XXXXXXXXX)', () => {
      expect(normalizePhilippinePhone('09171234567')).toBe('+639171234567');
      expect(normalizePhilippinePhone('9171234567')).toBe('+639171234567');
      expect(normalizePhilippinePhone('+639171234567')).toBe('+639171234567');
      expect(normalizePhilippinePhone('639171234567')).toBe('+639171234567');
      expect(normalizePhilippinePhone('0917-123-4567')).toBe('+639171234567');
    });

    it('validates valid Philippine mobile numbers', () => {
      expect(isValidPhilippinePhone('09171234567')).toBe(true);
      expect(isValidPhilippinePhone('+639171234567')).toBe(true);
      expect(isValidPhilippinePhone('12345')).toBe(false);
      expect(isValidPhilippinePhone('')).toBe(false);
    });
  });

  describe('Geocoding Safety & Null Coordinates', () => {
    it('returns null coordinates and pending status without inventing fake centroids', async () => {
      const result = await geocodingService.resolveDeliveryCoordinates({
        addressLine1: 'Block 5 Lot 8',
        regionCode: '030000000',
        regionName: 'Region III',
        provinceCode: '031400000',
        provinceName: 'Bulacan',
        cityMunicipalityCode: '031420000',
        cityMunicipalityName: 'City of San Jose del Monte',
        barangayCode: '031420042',
        barangayName: 'Tungkong Mangga',
        postalCode: '3023',
        formattedAddress: 'Block 5 Lot 8, Tungkong Mangga, City of San Jose del Monte, Bulacan 3023, Philippines',
      });

      expect(result.latitude).toBeNull();
      expect(result.longitude).toBeNull();
      expect(result.geocodingStatus).toBe('pending');
    });
  });

  describe('Lalamove Stop Payload Readiness', () => {
    it('generates a valid Lalamove delivery stop object from DeliveryLocation', () => {
      const location: DeliveryLocation = {
        addressLine1: 'Block 5 Lot 8, Sample Subdivision',
        regionCode: '030000000',
        regionName: 'Region III',
        provinceCode: '031400000',
        provinceName: 'Bulacan',
        cityMunicipalityCode: '031420000',
        cityMunicipalityName: 'City of San Jose del Monte',
        barangayCode: '031420042',
        barangayName: 'Tungkong Mangga',
        postalCode: '3023',
        formattedAddress:
          'Block 5 Lot 8, Sample Subdivision, Tungkong Mangga, City of San Jose del Monte, Bulacan 3023, Philippines',
        recipientName: 'Juan Dela Cruz',
        recipientPhone: '+639171234567',
        latitude: null,
        longitude: null,
        geocodingStatus: 'pending',
      };

      const stop = lalamoveProvider.buildDeliveryStop(location);

      expect(stop.address).toBe(location.formattedAddress);
      expect(stop.name).toBe('Juan Dela Cruz');
      expect(stop.phone).toBe('+639171234567');
      expect(stop.coordinates.lat).toBeNull();
      expect(stop.coordinates.lng).toBeNull();
    });
  });

  describe('Follow-up Completeness Tests (Municipalities & Small Barangays)', () => {
    it('TEST 1 — MUNICIPALITY: returns the complete set of cities AND municipalities for any supported province', () => {
      // Bulacan
      const bulacanCities = getPsgcCities('030000000', '031400000');
      expect(bulacanCities.length).toBe(24); // All 24 LGUs in Bulacan
      const bulacanNames = bulacanCities.map((c) => c.name);

      // Verify smaller municipalities appear, not only major cities
      expect(bulacanNames).toContain('Angat');
      expect(bulacanNames).toContain('Balagtas');
      expect(bulacanNames).toContain('Bustos');
      expect(bulacanNames).toContain('Calumpit');
      expect(bulacanNames).toContain('Doña Remedios Trinidad');
      expect(bulacanNames).toContain('Guiguinto');
      expect(bulacanNames).toContain('Hagonoy');
      expect(bulacanNames).toContain('Norzagaray');
      expect(bulacanNames).toContain('Obando');
      expect(bulacanNames).toContain('Pandi');
      expect(bulacanNames).toContain('Paombong');
      expect(bulacanNames).toContain('Plaridel');
      expect(bulacanNames).toContain('Pulilan');
      expect(bulacanNames).toContain('San Ildefonso');
      expect(bulacanNames).toContain('San Miguel');
      expect(bulacanNames).toContain('San Rafael');
      expect(bulacanNames).toContain('Santa Maria');

      // Cavite
      const caviteCities = getPsgcCities('040000000', '042100000');
      expect(caviteCities.length).toBe(23); // All 23 LGUs in Cavite
      const caviteNames = caviteCities.map((c) => c.name);
      expect(caviteNames).toContain('Alfonso');
      expect(caviteNames).toContain('Amadeo');
      expect(caviteNames).toContain('Indang');
      expect(caviteNames).toContain('Silang');
      expect(caviteNames).toContain('Naic');
    });

    it('TEST 2 — SMALL BARANGAY: returns ALL official barangays under selected LGUs, including smaller ones', () => {
      // City of San Jose del Monte (has 62 official barangays)
      const csjdm = getPsgcCities('030000000', '031400000').find((c) =>
        c.name.toLowerCase().includes('jose del monte')
      );
      expect(csjdm).toBeDefined();

      const csjdmBarangays = getPsgcBarangays(csjdm!.code);
      expect(csjdmBarangays.length).toBe(62);
      const csjdmBarangayNames = csjdmBarangays.map((b) => b.name);
      expect(csjdmBarangayNames).toContain('Tungkong Mangga');
      expect(csjdmBarangayNames).toContain('Minuyan Proper');
      expect(csjdmBarangayNames).toContain('Citrus');
      expect(csjdmBarangayNames).toContain('Ciudad Real');
      expect(csjdmBarangayNames).toContain('Dulong Bayan');
      expect(csjdmBarangayNames).toContain('Fatima I');
      expect(csjdmBarangayNames).toContain('Gumaoc Central');
      expect(csjdmBarangayNames).toContain('Paradise III');

      // Quezon City (has 142 official barangays)
      const qc = getPsgcCities('130000000', null).find((c) => c.name.toLowerCase().includes('quezon'));
      expect(qc).toBeDefined();
      const qcBarangays = getPsgcBarangays(qc!.code);
      expect(qcBarangays.length).toBe(142);
      const qcNames = qcBarangays.map((b) => b.name);
      expect(qcNames).toContain('Central');
      expect(qcNames).toContain('Batasan Hills');
      expect(qcNames).toContain('Bagong Silangan');
      expect(qcNames).toContain('Damayan');
    });

    it('TEST 3 — SEARCH: previously missing municipalities and small barangays appear and can be found', () => {
      const bulacanCities = getPsgcCities('030000000', '031400000');

      // Search for previously missing municipality: "Norzagaray"
      const norzagaray = bulacanCities.find((c) => c.name.toLowerCase().includes('norzagaray'));
      expect(norzagaray).toBeDefined();

      // Norzagaray barangays
      const norzagarayBarangays = getPsgcBarangays(norzagaray!.code);
      expect(norzagarayBarangays.length).toBe(13);
      expect(norzagarayBarangays.map((b) => b.name)).toContain('Poblacion');
      expect(norzagarayBarangays.map((b) => b.name)).toContain('Tigbe');

      // Search for previously missing municipality: "Angat"
      const angat = bulacanCities.find((c) => c.name.toLowerCase().includes('angat'));
      expect(angat).toBeDefined();

      // Search for small barangay: "Banaban" in Angat
      const angatBarangays = getPsgcBarangays(angat!.code);
      const banaban = angatBarangays.find((b) => b.name.toLowerCase().includes('banaban'));
      expect(banaban).toBeDefined();

      // Validates in PSGC hierarchy
      const validAngatOrder = validatePsgcHierarchy({
        regionCode: '030000000',
        provinceCode: '031400000',
        cityMunicipalityCode: angat!.code,
        barangayCode: banaban!.code,
      });
      expect(validAngatOrder.isValid).toBe(true);
    });

    it('TEST 4 — NO COVERAGE CHANGE: region and province list remain strictly Luzon and deny Visayas/Mindanao', () => {
      const regions = getPsgcRegions();
      expect(regions.length).toBe(7); // Exact 7 Luzon regions
      expect(regions.every((r) => r.islandGroup === 'Luzon')).toBe(true);

      expect(isLocationInPanelScanCoverage('060000000', null)).toBe(false); // Western Visayas
      expect(isLocationInPanelScanCoverage('070000000', null)).toBe(false); // Central Visayas
      expect(isLocationInPanelScanCoverage('110000000', null)).toBe(false); // Davao Region
      expect(isLocationInPanelScanCoverage('170000000', '175300000')).toBe(false); // Palawan
    });
  });
});
