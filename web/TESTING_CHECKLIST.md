# PanelScan Web — ISO/IEC 25010 Test Preparation Checklist

> Historical evaluation plan, not completed results. Use [current testing guidance](../docs/TESTING.md) and [roles](../docs/ROLES_AND_PERMISSIONS.md) for the current source-backed expectations. API-dependent scenarios require a separate backend. Older bundle-size, credential-status, and logo-delivery expectations below are not verified current deployment facts. Managed preview listings display local prices; the brand component currently selects `panelscan-logo.png`.

Preparation for formal evaluation. **No scores or ratings are recorded here** — this
document defines *what* is to be tested, *how*, and against *which* expected result, so the later
evaluation can be run and scored by the evaluators rather than by the implementation.

Scope: the `/web` application only (storefront, customer services, PanelScan Admin). The
mobile app (`/frontend`) and the backend are evaluated separately.

**Out of web scope (do not test here):** augmented reality, camera or device-sensor
measurement, and interactive 3D visualisation. The client confirmed these are not
website features; the retired Designer and visualizer routes redirect to the product catalogue.

Legend for the result column when this checklist is executed: `Pass` / `Fail` / `Partial` /
`Blocked` / `N/A`, with evidence (screenshot, request/response, or console output) attached.

---

## 1. Functional Suitability

Functional completeness, correctness, and appropriateness.

| # | Test | Method | Expected result |
|---|---|---|---|
| F1 | Guest browsing | Visit `/`, `/products`, `/products/:id`, `/about` while signed out | Catalogue browsable; prices hidden behind a sign-in prompt |
| F2 | Registration and login | Register a new customer, sign out, sign in again | Customer lands on `/dashboard`; session restores on reload |
| F3 | Role landing | Sign in as OWNER, MODERATOR, CUSTOMER | Staff land on `/admin`; customers land on `/dashboard` |
| F4 | Cart and checkout | Add items, change quantity, checkout | Order created with server-confirmed totals; cart cleared |
| F5 | Payment initiation | Open an unpaid order → Continue to payment | Backend creates a checkout session and the browser is redirected (requires PayMongo credentials) |
| F6 | Payment result | Return to `/payment/success` | State is read from the backend; a pending payment polls, then resolves or times out honestly |
| F7 | Product taxonomy | Browse `/products` and both category filters | Only PVC wall and ceiling panels are offered; seeded flooring/partition/cladding records never appear |
| F8 | Non-catalogue record handling | Inspect non-PVC seeded wall/ceiling records | Each is identified as outside the customer catalogue and cannot be purchased |
| F9 | Support messaging | Start a conversation, send a message, reply from the Admin inbox, re-read as the customer | Both messages appear in both surfaces with the correct sender |
| F10 | Installation request | Submit a request, then cancel it while pending | Request appears with PENDING status; cancellation succeeds; nothing is charged |
| F11 | Order feedback | Submit feedback for a delivered order, then attempt a second submission | First succeeds; the order is no longer offered afterwards |
| F12 | Admin dashboard | Open `/admin` as OWNER then MODERATOR | Owner sees revenue; moderator sees "Not available for your role" instead of ₱0 |
| F13 | Project management | Update status, save notes, reassign (owner) | Change persists after reload; moderator cannot reassign |
| F14 | Inventory adjustment | Add and reduce stock | Quantity and available stock update; reducing below zero is rejected |
| F15 | Sales fulfilment | Change an order's status | Status persists; final statuses offer no control |
| F16 | Request approval | Moderator raises a request; owner approves and rejects with notes | Status, reviewer, and note are recorded |
| F17 | Installer management | Moderator creates and deactivates an installer | Directory reflects both changes |
| F18 | Support chat | Moderator replies to a conversation; owner opens the same conversation | Moderator can post; owner is read-only |
| F19 | Feedback (staff) | Open `/admin/feedback` | Ratings and comments listed read-only |
| F20 | Empty states | Exercise every admin table with no records | Each shows a purposeful empty state, never a blank table |
| F21 | Retired routes | Visit `/designer` and `/visualizer` | Both redirect to `/products`; no canvas or WebGL context is created anywhere |

## 2. Performance Efficiency

Time behaviour, resource utilisation, capacity.

| # | Test | Method | Expected result |
|---|---|---|---|
| P1 | Initial bundle | `npm run build` | Storefront entry chunk stays at or below ~434 kB raw / ~132 kB gzip |
| P2 | No 3D weight | Inspect `package.json` and the build output | `three`, `@react-three/fiber`, `@react-three/drei` absent; no Three chunk emitted |
| P3 | Route splitting | Load `/` cold and watch requests | Admin and customer-service screens load only when their route is opened |
| P4 | Image delivery | Inspect image requests | Below-the-fold imagery is lazy-loaded; hero is eager with explicit dimensions |
| P5 | Logo asset weight | Inspect `/brand` requests | The optimised logo derivatives are served, never the 11 MB original |
| P6 | Admin table load | Open each admin list | One request per list plus documented summary reads; no per-row request fan-out |
| P7 | Memory behaviour | Navigate repeatedly across storefront, services, and Admin | No unbounded growth; aborted requests do not accumulate |
| P8 | Rate limiting | Exercise polling and admin refreshes | Stays within the backend's `/api` limit under normal use |

## 3. Usability

Learnability, operability, user error protection, aesthetics, accessibility.

| # | Test | Method | Expected result |
|---|---|---|---|
| U1 | First-run comprehension | Ask an unfamiliar user to plan a wall | Task completed without help from a supervisor |
| U2 | Error recovery | Trigger network failure on each surface | Message explains what happened and offers a retry |
| U3 | Destructive-action protection | Attempt order cancellation, account restriction, request rejection | Confirmation dialog states the consequence before proceeding |
| U4 | Double-submit protection | Double-click Continue to payment and Add to cart | Exactly one request is issued |
| U5 | Status clarity | Inspect an order that is paid but not delivered | Order status and payment status are shown as two separate values |
| U6 | Keyboard operation | Traverse storefront, service forms, and admin tables with Tab/Enter only | Every control reachable and operable; focus visible |
| U7 | Screen reader | Read product detail, messages, and payment result pages with VoiceOver/NVDA | Product specs, message authorship, and payment result states are announced as text |
| U8 | Colour independence | Review every badge in greyscale | Status always carries a text label (and icon where applicable) |
| U9 | Reduced motion | Enable `prefers-reduced-motion` and navigate | Transitions and animations are suppressed |
| U10 | Responsive layout | 1440 / 1280 / 1024 / 768 / 390 px on storefront and Admin | No horizontal overflow; admin tables become cards below `md` |
| U11 | Content honesty | Review About, catalogue notices, and Admin advisory copy | Client-content gaps, reference records, and system limitations are stated, not invented |

## 4. Reliability

Maturity, availability, fault tolerance, recoverability.

| # | Test | Method | Expected result |
|---|---|---|---|
| R1 | Session expiry | Let an access token expire, then act | Refresh rotates once and retries; otherwise the user is returned to login with the destination preserved |
| R2 | Backend down | Stop the API and exercise each surface | Every screen shows an error state with retry; nothing renders fabricated data |
| R3 | No WebGL dependency | Disable WebGL entirely | Every page still works; the website requires no 3D context |
| R4 | Webhook delay | Return from checkout before confirmation arrives | Bounded polling, then a "still waiting" state — never a false success or failure |
| R5 | Aborted navigation | Navigate away mid-request repeatedly | No state updates after unmount; no console warnings |
| R6 | Partial failure | Make one dashboard read fail while others succeed | The failing panel degrades alone; the rest of the page still renders |

## 5. Security

Confidentiality, integrity, non-repudiation, accountability, authenticity.

| # | Test | Method | Expected result |
|---|---|---|---|
| S1 | Admin access control | Visit every `/admin/*` route as a CUSTOMER | Redirected away; no admin data requested or shown |
| S2 | Backend authority | Call an owner-only endpoint with a moderator token | Backend returns 403 and the UI shows a role message — frontend checks are never the only gate |
| S3 | Cross-customer isolation | Request another customer's order, payment, and measurement | 403/404 from the backend in every case |
| S4 | Role-restricted fields | Compare moderator and owner responses | Financial fields absent for moderator; UI never substitutes 0 |
| S5 | Secret exposure | Grep `/web` for provider keys and tokens; inspect the built bundle | No PayMongo secret, webhook secret, or credential present |
| S6 | Amount integrity | Inspect the payment-create request | Only an order id is sent; the browser never asserts an amount |
| S7 | Redirect safety | Feed the checkout-URL validator malformed, `javascript:`, and off-host values | All rejected; only PayMongo hosts (and loopback in development) are followed |
| S8 | Installer privacy | Inspect an installation request before and after assignment | Only the assigned installer's name and specialty are exposed to the customer |
| S9 | Token storage | Inspect storage after sign-in | Tokens in tab-scoped `sessionStorage` only; cleared on sign-out (documented interim limitation) |
| S10 | Audit trail | Approve/reject a request, restrict an account | Backend records the acting user and timestamp |

## 6. Compatibility

Co-existence and interoperability.

| # | Test | Method | Expected result |
|---|---|---|---|
| C1 | Browsers | Latest Chrome, Safari, Firefox, Edge | Storefront, customer services, and Admin all usable |
| C2 | Mobile browsers | iOS Safari and Android Chrome | Navigation, forms, catalogues, and tables remain usable without horizontal overflow |
| C3 | API contract | Compare every request/response against the backend modules | No endpoint, field, or enum value used that the backend does not define |
| C4 | Origin consistency | Serve the site and configure return URLs on one origin (`127.0.0.1:5173`) | Session and payment handoff survive the external round trip |
| C5 | Co-existence | Run the web app, the mobile app, and the backend against one database | No interference; shared records read consistently |
| C6 | Logo rendering | View header, footer, auth, and Admin branding in each browser | The supplied artwork renders undistorted, on a warm surface, at every size |

---

## Known conditions that will affect evaluation

These are properties of the current build, not defects to be discovered during testing:

- **PayMongo credentials are absent**, so F5, F6, R4, and C4 can only be completed once test keys exist.
- **The seeded catalogue is not the client's catalogue**: only 1 of 10 seeded products is genuinely PVC. Product-level evaluation should wait for the real catalogue.
- **No transparent logo file** was supplied, so the logo's own wood background is part of the artwork.
- **Webhook correlation is unverified against live PayMongo** — treat any
  end-to-end payment confirmation result as provisional until that is fixed.
- **Delivery/courier integration and refunds are not implemented**, and are out of scope for this checklist.
- **Moderator registration has no backend endpoint**, so staff provisioning cannot be tested through the UI.
