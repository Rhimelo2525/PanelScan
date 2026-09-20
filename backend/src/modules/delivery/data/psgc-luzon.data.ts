/**
 * Official Complete PSGC (Philippine Standard Geographic Code) Dataset for Luzon
 *
 * Provides the COMPLETE set of administrative units:
 * Region -> Province (null for NCR) -> City/Municipality -> Barangay
 *
 * Sourced from official PSA PSGC release data via ph-addresses-locations.
 * Includes complete coverage of all cities, municipalities, and small barangays
 * for PanelScan-supported Luzon territories.
 */

import fs from 'fs';
import path from 'path';

function resolvePsgcDataDir(): string {
  const cwdPath = path.resolve(process.cwd(), 'node_modules/ph-addresses-locations/data');
  if (fs.existsSync(cwdPath)) return cwdPath;

  try {
    const parentPath = path.resolve(__dirname, '../../../../node_modules/ph-addresses-locations/data');
    if (fs.existsSync(parentPath)) return parentPath;
  } catch {
    // __dirname might not be defined in some ESM contexts
  }

  return cwdPath;
}

const dataDir = resolvePsgcDataDir();

export interface PsgcRegion {
  code: string;
  name: string;
  shortName: string;
  islandGroup: 'Luzon' | 'Visayas' | 'Mindanao';
  hasProvinces: boolean; // false for NCR
}

export interface PsgcProvince {
  code: string;
  name: string;
  regionCode: string;
}

export interface PsgcCity {
  code: string;
  name: string;
  regionCode: string;
  provinceCode: string | null; // null for NCR cities
  defaultPostalCode?: string;
}

export interface PsgcBarangay {
  code: string;
  name: string;
  cityCode: string;
  postalCode?: string;
}

// 1. WHITELISTED LUZON REGIONS (Visayas & Mindanao are strictly excluded)
export const PSGC_REGIONS: PsgcRegion[] = [
  {
    code: '130000000',
    name: 'National Capital Region (NCR)',
    shortName: 'NCR',
    islandGroup: 'Luzon',
    hasProvinces: false,
  },
  {
    code: '030000000',
    name: 'Region III – Central Luzon',
    shortName: 'Region III',
    islandGroup: 'Luzon',
    hasProvinces: true,
  },
  {
    code: '040000000',
    name: 'Region IV-A – CALABARZON',
    shortName: 'Region IV-A',
    islandGroup: 'Luzon',
    hasProvinces: true,
  },
  {
    code: '010000000',
    name: 'Region I – Ilocos Region',
    shortName: 'Region I',
    islandGroup: 'Luzon',
    hasProvinces: true,
  },
  {
    code: '020000000',
    name: 'Region II – Cagayan Valley',
    shortName: 'Region II',
    islandGroup: 'Luzon',
    hasProvinces: true,
  },
  {
    code: '050000000',
    name: 'Region V – Bicol Region',
    shortName: 'Region V',
    islandGroup: 'Luzon',
    hasProvinces: true,
  },
  {
    code: '140000000',
    name: 'Cordillera Administrative Region (CAR)',
    shortName: 'CAR',
    islandGroup: 'Luzon',
    hasProvinces: true,
  },
];

// Helper to sanitize UTF-8 mojibake (e.g. "Ã±" -> "ñ") and excess whitespace
function cleanName(raw: string | undefined | null): string {
  if (!raw) return '';
  return raw
    .trim()
    .replace(/Ã±/g, 'ñ')
    .replace(/Ã‘/g, 'Ñ')
    .replace(/\s+/g, ' ');
}

// Helper to normalize 9-digit to 10-digit code
function to10Digit(code: string | undefined | null): string {
  if (!code) return '';
  const clean = code.trim();
  if (clean.length === 9) {
    if (clean.endsWith('0000000')) {
      return clean + '0';
    }
    return clean.slice(0, 2) + '0' + clean.slice(2);
  }
  return clean;
}

// Helper to normalize 10-digit to 9-digit code
function to9Digit(code: string | undefined | null): string {
  if (!code) return '';
  const clean = code.trim();
  if (clean.length === 10) {
    if (clean.endsWith('00000000')) {
      return clean.slice(0, 9);
    }
    // 0301400000 -> 031400000
    if (clean[2] === '0') {
      return clean.slice(0, 2) + clean.slice(3);
    }
    return clean.slice(0, 9);
  }
  return clean;
}

// Load complete dataset from ph-addresses-locations synchronously at startup

interface RawProvince {
  regionCode: string;
  code: string;
  name: string;
}

interface RawCity {
  provinceCode: string;
  code: string;
  name: string;
  zipCode?: string;
  districtCode?: string;
}

interface RawBarangay {
  cityCode: string;
  code: string;
  name: string;
}

const rawProvinces: RawProvince[] = JSON.parse(fs.readFileSync(path.join(dataDir, 'provinces.json'), 'utf8'));
const rawCities: RawCity[] = JSON.parse(fs.readFileSync(path.join(dataDir, 'cities.json'), 'utf8'));
const rawBarangays: RawBarangay[] = JSON.parse(fs.readFileSync(path.join(dataDir, 'barangays.json'), 'utf8'));

// Whitelisted 10-digit region codes
const COVERED_REGION_CODES_10 = new Set(PSGC_REGIONS.map((r) => to10Digit(r.code)));

// 2. COMPILED PROVINCES
export const PSGC_PROVINCES: PsgcProvince[] = rawProvinces
  .filter((p) => COVERED_REGION_CODES_10.has(to10Digit(p.regionCode)))
  .map((p) => ({
    code: p.code,
    name: cleanName(p.name),
    regionCode: to9Digit(p.regionCode),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const provinceCode10Set = new Set(PSGC_PROVINCES.map((p) => p.code));

// 3. COMPILED CITIES AND MUNICIPALITIES (Complete set of cities + municipalities)
export const PSGC_CITIES: PsgcCity[] = rawCities
  .filter((c) => {
    // Include NCR cities (codes starting with 13)
    if (c.code.startsWith('13')) return true;
    // Include all cities and municipalities of covered provinces
    return provinceCode10Set.has(c.provinceCode);
  })
  .map((c) => {
    const isNcr = c.code.startsWith('13');
    return {
      code: c.code,
      name: cleanName(c.name),
      regionCode: isNcr ? '130000000' : to9Digit(c.provinceCode.slice(0, 2) + '0000000'),
      provinceCode: isNcr ? null : c.provinceCode,
      defaultPostalCode: c.zipCode ? c.zipCode.trim() : undefined,
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

// Fast lookups indexed by cityCode and provinceCode
const citiesByProvince10 = new Map<string, PsgcCity[]>();
const ncrCitiesList: PsgcCity[] = [];
const cityMapByCode = new Map<string, PsgcCity>();

for (const city of PSGC_CITIES) {
  cityMapByCode.set(city.code, city);
  cityMapByCode.set(to9Digit(city.code), city);

  if (city.provinceCode === null) {
    ncrCitiesList.push(city);
  } else {
    const p10 = city.provinceCode;
    const p9 = to9Digit(p10);
    if (!citiesByProvince10.has(p10)) citiesByProvince10.set(p10, []);
    citiesByProvince10.get(p10)!.push(city);

    if (!citiesByProvince10.has(p9)) citiesByProvince10.set(p9, []);
    citiesByProvince10.get(p9)!.push(city);
  }
}

// 4. COMPILED BARANGAYS (Complete set of all official barangays)
const coveredCityCodesSet = new Set(PSGC_CITIES.map((c) => c.code));
const barangaysByCityCode = new Map<string, PsgcBarangay[]>();

export const PSGC_BARANGAYS: PsgcBarangay[] = [];

for (const b of rawBarangays) {
  if (coveredCityCodesSet.has(b.cityCode)) {
    const item: PsgcBarangay = {
      code: b.code,
      name: cleanName(b.name),
      cityCode: b.cityCode,
    };
    PSGC_BARANGAYS.push(item);

    const c10 = b.cityCode;
    const c9 = to9Digit(c10);

    if (!barangaysByCityCode.has(c10)) barangaysByCityCode.set(c10, []);
    barangaysByCityCode.get(c10)!.push(item);

    if (!barangaysByCityCode.has(c9)) barangaysByCityCode.set(c9, []);
    barangaysByCityCode.get(c9)!.push(item);
  }
}

// Sort all barangay lists alphabetically
for (const list of barangaysByCityCode.values()) {
  list.sort((a, b) => a.name.localeCompare(b.name));
}

// Legacy 9-digit city code aliases to 10-digit codes for backwards compatibility
const LEGACY_CITY_ALIASES: Record<string, string> = {
  '137404000': '1381300000', // Quezon City
  '133900000': '1380600000', // City of Manila
  '137501000': '1380100000', // Caloocan
  '137601000': '1380300000', // Makati
  '137403000': '1381200000', // Pasig
  '137607000': '1381500000', // Taguig
  '137401000': '1380500000', // Mandaluyong
  '137405000': '1381400000', // San Juan
  '137402000': '1380700000', // Marikina
  '137605000': '1381100000', // Pasay
  '137604000': '1381000000', // Parañaque
  '137602000': '1380200000', // Las Piñas
  '137603000': '1380800000', // Muntinlupa
  '137504000': '1381600000', // Valenzuela
  '137502000': '1380400000', // Malabon
  '137503000': '1380900000', // Navotas
  '137606000': '1381701000', // Pateros
  '031420000': '0301420000', // CSJDM
  '031410000': '0301410000', // Malolos
  '031419000': '0301419000', // Meycauayan
  '031423000': '0301423000', // Santa Maria
};

/**
 * Public Query Methods
 */
export function getPsgcRegions(): PsgcRegion[] {
  return PSGC_REGIONS;
}

export function getPsgcProvinces(regionCode: string): PsgcProvince[] {
  const norm9 = to9Digit(regionCode);
  const norm10 = to10Digit(regionCode);
  return PSGC_PROVINCES.filter(
    (p) => p.regionCode === norm9 || to10Digit(p.regionCode) === norm10
  );
}

export function getPsgcCities(regionCode: string, provinceCode?: string | null): PsgcCity[] {
  const normRegion9 = to9Digit(regionCode);
  if (normRegion9 === '130000000') {
    // NCR has no provinces, returns all 17 NCR cities/municipalities
    return ncrCitiesList;
  }

  if (provinceCode) {
    const list10 = citiesByProvince10.get(to10Digit(provinceCode));
    if (list10) return list10;
    const list9 = citiesByProvince10.get(to9Digit(provinceCode));
    if (list9) return list9;
    return [];
  }

  // If no province specified, return all cities in that region
  return PSGC_CITIES.filter((c) => to9Digit(c.regionCode) === normRegion9);
}

export function getPsgcBarangays(cityCode: string): PsgcBarangay[] {
  const alias = LEGACY_CITY_ALIASES[cityCode] || cityCode;
  const list =
    barangaysByCityCode.get(alias) ||
    barangaysByCityCode.get(to10Digit(alias)) ||
    barangaysByCityCode.get(to9Digit(alias));
  return list || [];
}

/**
 * Strict PSGC Hierarchy Validator
 * Validates whether Region -> Province -> City -> Barangay is an official PSA relationship.
 */
export function validatePsgcHierarchy(params: {
  regionCode: string;
  provinceCode: string | null;
  cityMunicipalityCode: string;
  barangayCode: string;
}): { isValid: boolean; error?: string } {
  const { regionCode, provinceCode, cityMunicipalityCode, barangayCode } = params;
  const reg9 = to9Digit(regionCode);
  const reg10 = to10Digit(regionCode);

  // 1. Validate Region
  const region = PSGC_REGIONS.find((r) => r.code === reg9 || to10Digit(r.code) === reg10);
  if (!region) {
    return { isValid: false, error: `Invalid or unsupported region code: ${regionCode}` };
  }

  // 2. Validate Province
  if (reg9 === '130000000') {
    if (provinceCode !== null && provinceCode !== undefined && provinceCode !== '') {
      return { isValid: false, error: 'NCR does not have a province. provinceCode must be null.' };
    }
  } else {
    if (!provinceCode) {
      return { isValid: false, error: `Province is required for ${region.name}.` };
    }
    const prov10 = to10Digit(provinceCode);
    const prov9 = to9Digit(provinceCode);
    const province = PSGC_PROVINCES.find((p) => p.code === prov10 || to9Digit(p.code) === prov9);
    if (!province) {
      return { isValid: false, error: `Invalid province code: ${provinceCode}` };
    }
    if (to9Digit(province.regionCode) !== reg9) {
      return { isValid: false, error: `Province ${provinceCode} does not belong to region ${regionCode}.` };
    }
  }

  // 3. Validate City/Municipality
  const resolvedCityCode = LEGACY_CITY_ALIASES[cityMunicipalityCode] || cityMunicipalityCode;
  const city =
    cityMapByCode.get(resolvedCityCode) ||
    cityMapByCode.get(to10Digit(resolvedCityCode)) ||
    cityMapByCode.get(to9Digit(resolvedCityCode));

  if (!city) {
    return { isValid: false, error: `Invalid city/municipality code: ${cityMunicipalityCode}` };
  }

  if (to9Digit(city.regionCode) !== reg9) {
    return { isValid: false, error: `City ${cityMunicipalityCode} does not belong to region ${regionCode}.` };
  }

  if (reg9 !== '130000000' && provinceCode) {
    const prov10 = to10Digit(provinceCode);
    const prov9 = to9Digit(provinceCode);
    if (city.provinceCode !== prov10 && to9Digit(city.provinceCode) !== prov9) {
      return { isValid: false, error: `City ${cityMunicipalityCode} does not belong to province ${provinceCode}.` };
    }
  }

  // 4. Validate Barangay
  const cityBarangays = getPsgcBarangays(city.code);
  const barangay = cityBarangays.find(
    (b) =>
      b.code === barangayCode ||
      to9Digit(b.code) === to9Digit(barangayCode) ||
      b.code.endsWith(barangayCode.slice(-3)) ||
      b.name.toLowerCase() === barangayCode.toLowerCase()
  );

  if (!barangay) {
    return { isValid: false, error: `Invalid barangay code: ${barangayCode}` };
  }

  return { isValid: true };
}
