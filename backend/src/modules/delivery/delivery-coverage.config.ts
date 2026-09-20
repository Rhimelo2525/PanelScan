/**
 * Centralized PanelScan Delivery Coverage Configuration
 *
 * Defines the preliminary geographic whitelist for PanelScan delivery eligibility.
 *
 * NOTE ON SEPARATION OF CONCERNS:
 * PANELSCAN_ELIGIBLE_ADDRESS is only a preliminary whitelist filter.
 * LALAMOVE_CONFIRMED_SERVICEABILITY will be determined by the official Lalamove API
 * quotation/serviceability response during the next integration phase.
 */

export interface DeliveryCoverageConfig {
  market: 'PH';
  language: 'en_PH';
  // Allowed regions (Luzon mainland & key centers)
  includedRegions: string[];
  // Explicitly excluded regions (Visayas, Mindanao, MIMAROPA island provinces)
  excludedRegions: string[];
  // Province inclusions/exclusions
  includedProvinces: string[];
  excludedProvinces: string[];
  // City inclusions/exclusions
  includedCities: string[];
  excludedCities: string[];
  // Helper text displayed to customers
  displayNotice: string;
}

export const deliveryCoverage: DeliveryCoverageConfig = {
  market: 'PH',
  language: 'en_PH',

  // Supported Luzon Regions by PSGC Code:
  includedRegions: [
    '130000000', // NCR (National Capital Region)
    '030000000', // Region III (Central Luzon - Bulacan, Pampanga, etc.)
    '040000000', // Region IV-A (CALABARZON - Rizal, Cavite, Laguna, etc.)
    '010000000', // Region I (Ilocos Region)
    '020000000', // Region II (Cagayan Valley)
    '050000000', // Region V (Bicol Region)
    '140000000', // CAR (Cordillera Administrative Region)
  ],

  // Explicitly excluded island & non-Luzon regions
  excludedRegions: [
    '060000000', // Region VI (Western Visayas)
    '070000000', // Region VII (Central Visayas)
    '080000000', // Region VIII (Eastern Visayas)
    '090000000', // Region IX (Zamboanga Peninsula)
    '100000000', // Region X (Northern Mindanao)
    '110000000', // Region XI (Davao Region)
    '120000000', // Region XII (SOCCSKSARGEN)
    '160000000', // Region XIII (Caraga)
    '190000000', // BARMM
    '170000000', // MIMAROPA (Island provinces - Palawan, Mindoro, Romblon, Marinduque)
  ],

  // Provinces allowed for delivery
  includedProvinces: [
    // Bulacan, Pampanga, Bataan, Nueva Ecija, Tarlac, Zambales, Aurora
    '031400000',
    '035400000',
    '030800000',
    '034900000',
    '036900000',
    '037100000',
    '037700000',
    // Rizal, Cavite, Laguna, Batangas, Quezon
    '045800000',
    '042100000',
    '043400000',
    '041000000',
    '045600000',
    // Pangasinan, La Union, Ilocos Sur, Ilocos Norte
    '015500000',
    '013300000',
    '012900000',
    '012800000',
    // Isabela, Cagayan, Nueva Vizcaya, Quirino
    '023100000',
    '021500000',
    '025000000',
    '025700000',
    // Camarines Sur, Albay, Camarines Norte, Sorsogon
    '051700000',
    '050500000',
    '051600000',
    '056200000',
    // Benguet, Abra, Mountain Province
    '141100000',
    '140100000',
    '144400000',
  ],

  excludedProvinces: [
    // Island provinces excluded from ground logistics
    '175300000', // Palawan
    '175100000', // Occidental Mindoro
    '175200000', // Oriental Mindoro
    '175900000', // Romblon
    '174000000', // Marinduque
    '052000000', // Catanduanes
    '054100000', // Masbate
    '020900000', // Batanes
  ],

  // Specific city inclusions / exclusions (empty list means all included in province)
  includedCities: [],
  excludedCities: [],

  displayNotice: 'Delivery is currently available within selected areas in Luzon.',
};

function to9(code: string | null | undefined): string {
  if (!code) return '';
  const clean = code.trim();
  if (clean.length === 10) {
    if (clean.endsWith('00000000')) {
      return clean.slice(0, 9);
    }
    if (clean[2] === '0') {
      return clean.slice(0, 2) + clean.slice(3);
    }
    return clean.slice(0, 9);
  }
  return clean;
}

/**
 * Validates whether a location is within PanelScan's preliminary delivery coverage.
 */
export function isLocationInPanelScanCoverage(regionCode: string, provinceCode?: string | null): boolean {
  const r9 = to9(regionCode);
  const p9 = provinceCode ? to9(provinceCode) : null;

  if (deliveryCoverage.excludedRegions.includes(r9)) {
    return false;
  }

  if (!deliveryCoverage.includedRegions.includes(r9)) {
    return false;
  }

  // NCR has no province and is covered
  if (r9 === '130000000') {
    return true;
  }

  // If province provided, check province
  if (p9) {
    if (deliveryCoverage.excludedProvinces.includes(p9)) {
      return false;
    }
    if (deliveryCoverage.includedProvinces.length > 0 && !deliveryCoverage.includedProvinces.includes(p9)) {
      return false;
    }
  }

  return true;
}
