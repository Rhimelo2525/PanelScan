/**
 * Map pin -> pre-filled saved-address fields.
 *
 * Mapbox reverse geocoding (geocoding.service.ts) gives place NAMES; orders
 * and saved addresses need the official PSGC CODES the rest of the delivery
 * module validates against. This matches one to the other using the same
 * Luzon PSGC dataset the address dropdowns are built from, so a suggested
 * value is always one the customer could have picked by hand. Anything that
 * can't be matched confidently is left empty for the customer to choose -
 * it is never guessed.
 */
import { isLocationInPanelScanCoverage } from '../delivery/delivery-coverage.config';
import { PSGC_CITIES, PSGC_PROVINCES, PSGC_REGIONS, getPsgcBarangays } from '../delivery/data/psgc-luzon.data';
import type { PsgcBarangay, PsgcCity } from '../delivery/data/psgc-luzon.data';
import { geocodingService } from '../delivery/services/geocoding.service';
import type { AddressSuggestion } from './address.types';

const NCR_REGION_CODE = '130000000';

/** Comparable form of a PH place name: "City of San Jose Del Monte" and "San José del Monte" both become "san jose del monte". */
export const normalizePlaceName = (value: string | null | undefined): string =>
  (value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/\b(city|municipality) of\b/g, ' ')
    .replace(/\bcity\b/g, ' ')
    .replace(/\b(barangay|brgy)\b\.?/g, ' ')
    .replace(/\bsto\b\.?/g, 'santo')
    .replace(/\bsta\b\.?/g, 'santa')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const matchCity = (cityName: string | null, provinceName: string | null): PsgcCity | null => {
  const target = normalizePlaceName(cityName);
  if (!target) return null;

  const candidates = PSGC_CITIES.filter((city) => normalizePlaceName(city.name) === target);
  if (candidates.length <= 1) return candidates[0] ?? null;

  // Several towns share a name (e.g. four municipalities called "Quezon") -
  // Mapbox's `region` is the province, or the city itself inside Metro Manila.
  const province = normalizePlaceName(provinceName);
  const inProvince = candidates.filter((city) => {
    const cityProvince = PSGC_PROVINCES.find((p) => p.code === city.provinceCode);
    return cityProvince && normalizePlaceName(cityProvince.name) === province;
  });
  if (inProvince.length === 1) return inProvince[0]!;

  const inNcr = candidates.filter((city) => city.regionCode === NCR_REGION_CODE);
  if (province === target && inNcr.length === 1) return inNcr[0]!;

  return null;
};

const matchBarangay = (city: PsgcCity, names: Array<string | null>): PsgcBarangay | null => {
  const barangays = getPsgcBarangays(city.code);
  for (const name of names) {
    const target = normalizePlaceName(name);
    if (!target) continue;
    const match = barangays.find((b) => normalizePlaceName(b.name) === target);
    if (match) return match;
  }
  return null;
};

const emptySuggestion = (latitude: number, longitude: number, status: AddressSuggestion['status']): AddressSuggestion => ({
  latitude,
  longitude,
  status,
  detectedAddress: null,
  addressLine1: null,
  regionCode: null,
  regionName: null,
  provinceCode: null,
  provinceName: null,
  cityMunicipalityCode: null,
  cityMunicipalityName: null,
  barangayCode: null,
  barangayName: null,
  postalCode: null,
  inCoverage: null,
});

export const suggestAddressForPin = async (latitude: number, longitude: number): Promise<AddressSuggestion> => {
  const place = await geocodingService.reverseGeocode(latitude, longitude);
  if (place.status !== 'ok') {
    return emptySuggestion(latitude, longitude, place.status === 'not_configured' ? 'unavailable' : 'failed');
  }

  const suggestion: AddressSuggestion = {
    ...emptySuggestion(latitude, longitude, 'partial'),
    detectedAddress: place.fullAddress,
    addressLine1: place.streetLine,
    postalCode: place.postalCode,
  };

  const city = matchCity(place.city, place.province) ?? matchCity(place.district, place.province);
  if (!city) return suggestion;

  const region = PSGC_REGIONS.find((r) => r.code === city.regionCode) ?? null;
  const province = city.provinceCode ? PSGC_PROVINCES.find((p) => p.code === city.provinceCode) ?? null : null;
  const barangay = matchBarangay(city, [place.barangay, place.neighborhood]);

  suggestion.regionCode = region?.code ?? null;
  suggestion.regionName = region?.name ?? null;
  suggestion.provinceCode = province?.code ?? null;
  suggestion.provinceName = province?.name ?? null;
  suggestion.cityMunicipalityCode = city.code;
  suggestion.cityMunicipalityName = city.name;
  suggestion.barangayCode = barangay?.code ?? null;
  suggestion.barangayName = barangay?.name ?? null;
  suggestion.postalCode = place.postalCode ?? barangay?.postalCode ?? city.defaultPostalCode ?? null;
  suggestion.inCoverage = region ? isLocationInPanelScanCoverage(region.code, province?.code ?? null) : null;
  suggestion.status = region && barangay && suggestion.addressLine1 && suggestion.postalCode ? 'complete' : 'partial';

  return suggestion;
};
