# Walkthrough: Lalamove-Ready Delivery Address System for PanelScan Checkout

We have implemented the structured Philippine delivery address selector on PanelScan checkout and established a canonical, Lalamove-ready delivery domain model. This prepares PanelScan for immediate integration with the official Lalamove API in the next phase without requiring any future redesign of the checkout form or database migrations.

---

## Key Accomplishments

### 1. Database & Persistence Layer
- **Schema Migration (`20260918120000_add_structured_delivery_location`)**:
  - Added `deliveryLocation Json? @map("delivery_location")` to `Order` to store an immutable snapshot of the PSGC codes, names, null coordinates, and geocoding status at the time of purchase.
  - Added `deliveryProvider String? @default("LALAMOVE")`, `deliveryStatus String? @default("NOT_REQUESTED")`, and `providerMetadata Json? @map("provider_metadata")` to `Delivery`.
  - Maintained 100% backward compatibility for `Order.shippingAddress` (string) for legacy queries and reports.

### 2. PSGC Luzon Dataset & Centralized Delivery Coverage Engine
- **PSGC Complete Official Dataset (`backend/src/modules/delivery/data/psgc-luzon.data.ts`)**:
  - Full hierarchical dataset integrated from official PSA PSGC releases via `ph-addresses-locations`:
    - **666 Cities & Municipalities** across all 33 covered Luzon mainland provinces (complete set, not just major cities).
    - **17,280 Barangays** (all official barangays including smaller rural barangays).
    - **NCR (`130000000`)**: 16 cities + 1 municipality (Manila, QC with all 142 barangays, Caloocan, Las Piñas, Makati, Malabon, Mandaluyong, Marikina, Muntinlupa, Navotas, Parañaque, Pasay, Pasig, San Juan, Taguig, Valenzuela, Pateros). Special handling: `provinceCode: null`, `provinceName: null`.
    - **Bulacan**: All 24 cities and municipalities (Angat, Balagtas, Bocaue, Bulacan, Bustos, Calumpit, City of Baliwag, City of Malolos, City of Meycauayan, City of San Jose Del Monte with all 62 barangays, Doña Remedios Trinidad, Guiguinto, Hagonoy, Marilao, Norzagaray, Obando, Pandi, Paombong, Plaridel, Pulilan, San Ildefonso, San Miguel, San Rafael, Santa Maria with all 24 barangays).
    - **Cavite**: All 23 cities and municipalities (Alfonso, Amadeo, Carmona, Bacoor, Cavite City, Dasmariñas, Gen. Trias, Imus, Tagaytay, Trece Martires, GMA, GEA, Indang, Kawit, Magallanes, Maragondon, Mendez, Naic, Noveleta, Rosario, Silang, Tanza, Ternate).
    - **Rizal, Laguna, Batangas, Pampanga, Bataan, Nueva Ecija, Tarlac, Zambales, Pangasinan, etc.**: 100% complete municipality and barangay coverage.
  - Implemented `validatePsgcHierarchy` to enforce parent-child integrity and reject manipulated payloads.
- **Coverage Config (`backend/src/modules/delivery/delivery-coverage.config.ts`)**:
  - Whitelist: Luzon routes only.
  - Blacklist: Visayas (`060000000`, `070000000`, `080000000`), Mindanao (`090000000`-`120000000`, `160000000`, `190000000`), and island provinces (`170000000`).
  - Strict separation: `PANELSCAN_ELIGIBLE_ADDRESS` (preliminary checkout whitelist) vs `LALAMOVE_CONFIRMED_SERVICEABILITY` (API quotation response in next phase).

### 3. Address & Phone Normalization Utilities
- **Address Formatter (`address-formatter.ts`)**:
  - Single authoritative formatter for provincial and NCR addresses:
    - Provincial: `Block 5 Lot 8, Sample Subdivision, Tungkong Mangga, City of San Jose del Monte, Bulacan 3023, Philippines`
    - NCR: `Unit 12B, Tower 1, High Street, Central, Quezon City 1100, Philippines` (never invents fake provinces like "Metro Manila Province").
- **Phone Normalizer (`phone-normalizer.ts`)**:
  - Normalizes local and international formats (`09171234567`, `9171234567`, `+639171234567`) to E.164 standard `+639XXXXXXXXX`.

### 4. Canonical Delivery Domain & Lalamove Boundary
- **Domain Models (`delivery.domain.ts`)**:
  - Defined `DeliveryLocation`, `LalamoveDeliveryStop`, `DeliveryRoute` (pickup + dropoff), and `DeliveryQuoteRequest`.
  - Standardized business error codes (`DELIVERY_ADDRESS_INVALID`, `DELIVERY_OUTSIDE_PANELSCAN_COVERAGE`, etc.).
- **Geocoding Boundary (`geocoding.service.ts`)**:
  - Prepares `resolveDeliveryCoordinates(location)` with strict null safety (`latitude = null`, `longitude = null`, `geocodingStatus = "pending"`). Never invents fake coordinates or uses city/barangay centroids.
- **Server-Side Lalamove Provider (`lalamove.provider.ts` & `lalamove.config.ts`)**:
  - Isolated server boundary reading `LALAMOVE_ENV`, `LALAMOVE_API_KEY`, `LALAMOVE_API_SECRET`.
  - Zero browser bundle exposure of credentials or signing algorithms.
  - Structured request logging omitting secrets and signatures.
  - Unique server-generated Request-IDs.

### 5. Frontend UI & Checkout Flow (`web/src/pages/checkout-page.tsx`)
- Reorganized form into the exact 6-row desktop layout:
  - **ROW 1**: Recipient full name | Contact phone
  - **ROW 2**: Street, building, or unit — full width
  - **ROW 3**: Region | Province (Province disabled with "— Not applicable (NCR) —" when NCR is selected)
  - **ROW 4**: City or municipality (Searchable Combobox) | Barangay (Searchable Combobox)
  - **ROW 5**: Postal code
  - **ROW 6**: Order notes — full width
- Added subtle helper text: `"Delivery is currently available within selected areas in Luzon."`
- Cascading resets on Region / Province / City change.
- Built accessible `<Combobox>` component (`web/src/components/ui/combobox.tsx`) matching PanelScan's `h-11` styling, Geist font, borders, and dark/light modes.
- Preserved existing cart, subtotal, shipping fee ($0 placeholder until next phase quotation), PayMongo payment, and order history flow.

---

## Verification Results

### Automated Tests
1. **Existing Orders Suite (`npx vitest run tests/order/order.test.ts`)**:
   - **21 / 21 tests passed** (50.87s).
   - Confirmed complete backward compatibility: order placement, inventory decrements, cart clearing, status transitions, and role authorization remain intact.
2. **New Delivery Address Suite (`npx vitest run tests/delivery/delivery-address.test.ts`)**:
   - **12 / 12 tests passed** (18.35s):
     - PSGC Luzon hierarchy validation.
     - NCR special handling (null province allowed, fake province rejected).
     - Preliminary delivery coverage whitelist (Luzon allowed, Visayas/Mindanao rejected).
     - Address normalization formatting for provincial and NCR addresses.
     - E.164 phone normalization.
     - Geocoding safety and null coordinate integrity.
     - Lalamove stop payload generation.
3. **TypeScript & Linter Checks**:
   - `backend`: `npm run typecheck` passed (0 errors), `npm run build` passed (0 errors).
   - `web`: `npm run typecheck` passed (0 errors), `npm run lint` passed (0 errors), `npm run build` passed (0 errors, 671ms).
