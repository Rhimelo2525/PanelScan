/**
 * What the saved-address form is pre-filled with after the customer drops a
 * pin. `complete` = every field was detected; `partial` = the customer needs
 * to fill in what's null; `failed`/`unavailable` = nothing could be detected
 * (lookup error / no geocoder configured) - the pin itself is still valid.
 */
export interface AddressSuggestion {
  latitude: number;
  longitude: number;
  status: 'complete' | 'partial' | 'failed' | 'unavailable';
  /** Mapbox's own one-line reading of the point, for the customer to sanity-check. */
  detectedAddress: string | null;
  addressLine1: string | null;
  regionCode: string | null;
  regionName: string | null;
  provinceCode: string | null;
  provinceName: string | null;
  cityMunicipalityCode: string | null;
  cityMunicipalityName: string | null;
  barangayCode: string | null;
  barangayName: string | null;
  postalCode: string | null;
  /** Null when the region couldn't be detected. */
  inCoverage: boolean | null;
}
