/**
 * Lalamove Integration Configuration (Server-Side Only)
 *
 * CRITICAL SECURITY:
 * Never expose these configuration keys, secrets, or signing algorithms to the frontend or browser bundle.
 */

export interface PanelScanWarehouseConfig {
  id: string;
  name: string;
  contactName: string;
  contactPhone: string;
  addressLine1: string;
  barangay: string;
  city: string;
  province: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
}

export interface LalamoveServerConfig {
  env: 'sandbox' | 'production';
  market: 'PH';
  language: 'en_PH';
  apiKey: string;
  apiSecret: string;
  baseUrl: string;
  pickupLocation: PanelScanWarehouseConfig;
}

export const lalamoveConfig: LalamoveServerConfig = {
  env: (process.env.LALAMOVE_ENV as 'sandbox' | 'production') || 'sandbox',
  market: 'PH',
  language: 'en_PH',
  apiKey: process.env.LALAMOVE_API_KEY || '',
  apiSecret: process.env.LALAMOVE_API_SECRET || '',
  baseUrl:
    process.env.LALAMOVE_ENV === 'production'
      ? 'https://rest.lalamove.com'
      : 'https://rest.sandbox.lalamove.com',

  // Configurable warehouse dispatch location (server-managed)
  pickupLocation: {
    id: 'DIS-WH-MAIN',
    name: 'Disenyo Interior Solution Central Warehouse',
    contactName: 'PanelScan Dispatch Operations',
    contactPhone: process.env.PANELSCAN_WAREHOUSE_PHONE || '+639170000000',
    addressLine1: process.env.PANELSCAN_WAREHOUSE_ADDRESS || 'Main Logistics Hub',
    barangay: process.env.PANELSCAN_WAREHOUSE_BARANGAY || 'Poblacion',
    city: process.env.PANELSCAN_WAREHOUSE_CITY || 'City of San Jose del Monte',
    province: process.env.PANELSCAN_WAREHOUSE_PROVINCE || 'Bulacan',
    postalCode: process.env.PANELSCAN_WAREHOUSE_POSTAL || '3023',
    // Nullable until confirmed by site survey/geocoding
    latitude: null,
    longitude: null,
  },
};
