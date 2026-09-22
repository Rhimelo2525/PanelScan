/**
 * Lalamove Integration Configuration (Server-Side Only)
 *
 * CRITICAL SECURITY:
 * Never expose these configuration keys, secrets, or signing algorithms to the frontend or browser bundle.
 */

import { env } from '../../../config/env';

export interface PanelScanWarehouseConfig {
  id: string;
  name: string | null;
  contactName: string;
  contactPhone: string | null;
  addressLine1: string | null;
  barangay: string | null;
  city: string | null;
  province: string | null;
  postalCode: string | null;
  // Deliberately null unless PANELSCAN_WAREHOUSE_LAT/LNG are explicitly set -
  // never a fabricated or city-centroid coordinate. A real Lalamove driver
  // gets routed here, so a wrong value is worse than none.
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
  webhookToken: string | null;
  pickupLocation: PanelScanWarehouseConfig;
}

export const lalamoveConfig: LalamoveServerConfig = {
  env: env.LALAMOVE_ENV,
  market: 'PH',
  language: 'en_PH',
  apiKey: env.LALAMOVE_API_KEY ?? '',
  apiSecret: env.LALAMOVE_API_SECRET ?? '',
  baseUrl: env.LALAMOVE_ENV === 'production' ? 'https://rest.lalamove.com' : 'https://rest.sandbox.lalamove.com',
  webhookToken: env.LALAMOVE_WEBHOOK_TOKEN ?? null,

  // Configurable warehouse dispatch location (server-managed). No fallback
  // values on purpose - see isWarehouseConfigured() below, which every
  // provider call that needs a pickup point must check first.
  pickupLocation: {
    id: 'DIS-WH-MAIN',
    name: env.PANELSCAN_WAREHOUSE_NAME ?? null,
    contactName: 'PanelScan Dispatch Operations',
    contactPhone: env.PANELSCAN_WAREHOUSE_PHONE ?? null,
    addressLine1: env.PANELSCAN_WAREHOUSE_ADDRESS ?? null,
    barangay: env.PANELSCAN_WAREHOUSE_BARANGAY ?? null,
    city: env.PANELSCAN_WAREHOUSE_CITY ?? null,
    province: env.PANELSCAN_WAREHOUSE_PROVINCE ?? null,
    postalCode: env.PANELSCAN_WAREHOUSE_POSTAL ?? null,
    latitude: env.PANELSCAN_WAREHOUSE_LAT ?? null,
    longitude: env.PANELSCAN_WAREHOUSE_LNG ?? null,
  },
};

/** True once every field a real Lalamove stop needs is present - checked before any quotation/booking call. */
export function isWarehouseConfigured(): boolean {
  const p = lalamoveConfig.pickupLocation;
  return Boolean(p.contactPhone && p.addressLine1 && p.city && p.province && p.latitude !== null && p.longitude !== null);
}

/** True once API credentials are present - checked before any live provider call. */
export function isLalamoveConfigured(): boolean {
  return Boolean(lalamoveConfig.apiKey && lalamoveConfig.apiSecret);
}
