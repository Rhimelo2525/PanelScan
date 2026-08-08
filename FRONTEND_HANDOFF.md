# PanelScan — Frontend Handoff

This document is for whoever starts building a frontend (mobile and/or web) against the PanelScan
backend. It covers what the backend actually provides, how to authenticate against it, how responses
and errors are shaped, and a suggested build order per role. Everything here was verified against the
real backend code on 2026-08-08 — see [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) for current
project status and [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) for backend-internal architecture.

**This document does not implement any frontend code — it's a roadmap and contract only.**

---

## 1. What the backend actually gives you

- A REST JSON API under `/api/*`, plus a top-level `GET /health` (not under `/api`, not rate-limited,
  no auth).
- 19 business modules, fully built and tested (see the tree in
  [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) §2) covering the entire customer purchase journey,
  installation booking, AR measurement/panel estimation, project tracking, staff-side approval
  workflows, chat, notifications, feedback, analytics, and reporting.
- JWT-based authentication with rotating refresh tokens (§3).
- Role-based responses — some endpoints return different fields depending on whether the caller is
  OWNER, MODERATOR, or CUSTOMER (documented per-endpoint in `backend/README.md` §3, which now covers
  every one of the 19 business modules — see the note below on one intentional exception).
- **No AR camera/rendering code** — the backend persists measurement data and calculates panel
  estimates from it; the actual AR capture experience is 100% a mobile-app concern.
- **A frontend project scaffold exists** at `frontend/` (Expo + React Native + TypeScript,
  added 2026-08-08) — architecture only, no screens implemented yet. See `frontend/README.md` for its
  folder structure, role/navigation architecture, and how to add features. This document remains the
  API contract that scaffold (and anyone building it out) must follow.

`backend/README.md` §3 (the endpoint reference) previously had no entries for 8 early modules —
Category, Product, Inventory, Cart, Order, Payment, Booking, and Installer. That gap was closed in a
dedicated documentation pass on 2026-08-08 (see [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) §4);
every module now has a full README §3 entry, and every module has a Postman collection (§7). One
real, verified behavioral quirk worth knowing before you build against it: `POST /api/payments/create`
returns **403**, not this API's otherwise-universal 404, when a customer references an order that
belongs to someone else — see README §3's Payment section for the exact detail.

---

## 2. Roles

| Role | Can do |
|---|---|
| **OWNER** | Everything a MODERATOR can operationally, plus: full analytics (including financial figures), full reports (including financial fields), request approval/rejection, project creation and reassignment, full project management. |
| **MODERATOR** | Orders, inventory, bookings, installers, projects (as assigned — narrower field access than OWNER), customer communication (chat), requests (as submitter, not approver), measurements (view only, not create/edit), reports (non-financial fields only), notifications. |
| **CUSTOMER** | Shopping, cart, checkout, payments, own bookings, own AR measurements, own project viewing (read-only), chat (as a participant), notifications, feedback on their own completed orders. |

There is no fourth role and no anonymous-write access anywhere — every mutating endpoint requires
authentication. A handful of read endpoints are public (category listing, product browsing/search) —
see §4.

---

## 3. Authentication — how the frontend should handle it

Quick-reference flow (each step is detailed in §3.1–§3.5 below):

```
Register (POST /api/auth/register — access token only, no refresh token)
   ↓
Login (POST /api/auth/login)
   ↓
Access Token + Refresh Token issued
   ↓
Use Access Token (Authorization: Bearer <token>) for every protected API request
   ↓
Access Token expires → request comes back 401
   ↓
POST /api/auth/refresh (with the stored refresh token — no Authorization header needed)
   ↓
New Access Token + rotated Refresh Token (the old refresh token is now revoked - store both new values)
   ↓
Logout (POST /api/auth/logout, with the current refresh token)
   ↓
That one Refresh Token is revoked (other devices/sessions are unaffected)
```

### 3.1 Login

`POST /api/auth/login` with `{ email, password }` returns:
```json
{
  "success": true,
  "message": "Login successful.",
  "data": {
    "user": { "id": "...", "firstName": "...", "email": "...", "role": "CUSTOMER", "...": "..." },
    "token": "<JWT access token>",
    "refreshToken": "<opaque refresh token>"
  }
}
```
Store both `token` and `refreshToken` securely (secure storage on mobile — Keychain/Keystore-backed;
`httpOnly` cookie or equivalent secure storage on web — **never** `localStorage` for the refresh token
if you can avoid it, since it's a long-lived credential).

### 3.2 Every subsequent authenticated request

Send `Authorization: Bearer <token>` (the **access** token, not the refresh token) on every request
to a protected endpoint.

### 3.3 Access token expiry — refreshing

Access tokens expire (`JWT_EXPIRES_IN`, currently defaults to `7d`, but treat this as opaque — don't
hardcode an assumed lifetime into frontend logic). When a request comes back `401`, the frontend
should:
1. Call `POST /api/auth/refresh` with `{ refreshToken: <the stored refresh token> }` (**no**
   `Authorization` header needed for this call).
2. On success, you get **both** a new `token` and a new `refreshToken` — **replace both stored
   values**. The old refresh token is now revoked (single-use, rotating) and will 401 if reused.
3. Retry the original request with the new access token.
4. If the refresh call itself fails (401 — expired, revoked, or unknown token), the session is over:
   clear stored tokens and route the user to login. Do not retry-loop on a failed refresh.

### 3.4 Logout

`POST /api/auth/logout` (requires a valid access token) with `{ refreshToken: <the stored refresh
token> }` revokes that one session. Clear local token storage after this call regardless of its
result. This only ends the current device's session — other logged-in devices for the same user are
unaffected (each login/refresh issues its own independent refresh token).

### 3.5 Registration

`POST /api/auth/register` returns only an access token (`data.token`), **not** a refresh token. After
registering, call `POST /api/auth/login` to obtain a refresh token and start a normal refreshable
session — don't assume registration alone leaves the user in a refreshable state.

### 3.6 What the frontend must never do

- Never store the raw password anywhere beyond the login form's transient state.
- Never decode the access token client-side to make authorization decisions (e.g. "hide this button
  because the JWT says role X") as a substitute for the backend's own checks — treat client-side role
  checks as UX convenience only, since the backend is the actual source of truth and will 403/404
  regardless of what the UI shows.
- Never attempt to construct or guess a refresh token — it's an opaque, cryptographically random value
  the backend generates; there is nothing to derive it from.

---

## 4. API response format and error handling

Every response is JSON with this exact envelope shape — there is no other response format anywhere in
this API:

**Success:**
```json
{ "success": true, "message": "Human-readable message.", "data": { /* present on most, not all, endpoints */ } }
```

**Error:**
```json
{ "success": false, "message": "Human-readable message.", "errors": [ { "path": "email", "message": "..." } ] }
```
`errors` is only present on validation failures (400 from a Zod schema rejection); every other error
status has `message` only, no `errors` array.

### 4.1 Status codes actually used by this API (verified against the global error handler)

| Code | Meaning here | Frontend handling |
|---|---|---|
| **200** | Success (read, update, or an action with no created resource) | Render the response |
| **201** | Success, resource created | Render the response; you now have the new resource's `id` |
| **400** | Validation failure (malformed input) **or** a business-rule violation on well-formed input (e.g. "cart is empty", "insufficient stock") | Show the message (and, if `errors` is present, field-level messages) inline on the form/action |
| **401** | Not authenticated, or the access token is invalid/expired | Attempt a silent refresh (§3.3); if that also fails, route to login |
| **403** | Authenticated, but the role/permission doesn't allow this action | Show a permission-denied message; this should rarely surface if the UI correctly hides actions the user's role can't perform, but must always be handled since the backend is authoritative |
| **404** | Resource not found — **including** when a resource exists but doesn't belong to/isn't assigned to the requester (this API deliberately never uses 403 for "it exists but isn't yours," to avoid confirming existence to someone not entitled to it) | Treat as "not found," don't imply the item exists elsewhere |
| **409** | The request conflicts with the resource's *current state* (e.g. approving an already-approved request, double-creating a delivery for one order) — distinct from 400, which means the input itself was invalid | Show the message; typically means "refresh your view, this changed underneath you" |
| **429** | Rate limited — too many requests from this IP in the current window | Back off; show a "too many attempts, try again shortly" message. Standard `RateLimit-*` response headers are present to compute a retry delay if desired |
| **500** | Unhandled server error | Generic "something went wrong" message; not something the frontend can recover from programmatically |

**Note: this API does not use 422 anywhere** — validation failures are 400, not 422. Don't special-case
422 handling; it will never be sent by this backend.

### 4.2 Rules for frontend developers (the backend is the source of truth)

The backend owns: API routes, request validation, authentication, authorization, response structures,
and database state. The frontend must **not**:
- Directly access CockroachDB from client code, ever, under any circumstance.
- Duplicate backend business logic (e.g. re-implementing checkout total calculation, stock validation,
  or booking status transition rules client-side) — call the API and trust its response.
- Manually calculate authoritative totals (order totals, inventory availability, panel estimates) —
  these are computed server-side and returned in the response; recompute for display formatting only,
  never as a source of truth that could diverge from what the server actually persisted.
- Bypass authorization by, e.g., calling an endpoint the UI hides for a given role — the backend
  enforces this regardless, but don't build UI that assumes client-side hiding is sufficient security.
- Assume an API call succeeded just because the UI *state* changed optimistically — always confirm
  against the actual response, and roll back optimistic UI on error.
- Hardcode database IDs (category IDs, product IDs, user IDs) anywhere in frontend code — always fetch
  them from the API. Seeded/demo IDs from a dev database are not stable across environments.

---

## 5. Major business workflows (frontend-relevant summary)

Full backend-side detail (state machines, transaction boundaries, notification triggers) is in
[DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) §5. The frontend-relevant summary:

- **Purchase**: browse (public) → add to cart (CUSTOMER auth required) → checkout (creates an Order
  as an atomic snapshot of cart contents and current prices/stock) → pay (PayMongo Checkout Session —
  the frontend redirects the user to `checkoutUrl` from the payment-creation response; PayMongo itself
  handles the payment UI) → delivery tracking → feedback once delivered.
- **Booking**: CUSTOMER creates a booking request → staff approves → staff assigns an installer
  (this is what moves it to `SCHEDULED`, not a direct status update) → staff marks complete.
  CUSTOMER can only cancel their own booking while it's still `PENDING`.
- **AR / Panel Estimate**: CUSTOMER's mobile app does the actual AR scanning and produces a
  width/height (and optionally a reference photo/scan data URL); the app calls
  `POST /api/ar/measurements` to persist it, then `POST /api/ar/estimate` (referencing that saved
  measurement, or passing raw width/height) against a chosen product to get a required-panel-count and
  cost estimate back. **The AR rendering itself is not a backend concern at all.**
- **Chat**: CUSTOMER starts a conversation; staff (MODERATOR) replies and auto-joins; OWNER can view
  every conversation read-only. Viewing a conversation's messages auto-marks the other party's
  messages read.
- **Projects**: visible to CUSTOMER (their own, read-only) and MODERATOR (only if assigned, and only
  able to edit schedule/notes); OWNER has full control including creation and reassignment.
- **Requests** (MODERATOR → OWNER approval): this is an internal staff workflow — no CUSTOMER-facing
  UI is needed for it at all.

---

## 6. Frontend module checklists (roadmap only — nothing here is built)

### CUSTOMER (mobile app)

```
├── Authentication         (login, register, logout, silent refresh — see §3)
├── Home
├── Categories              (GET /api/categories — public)
├── Products                 (GET /api/products, /search, /featured — public)
├── Product Details           (GET /api/products/:id — public)
├── Cart                       (GET/POST/PATCH/DELETE /api/cart* — auth required)
├── Checkout                    (POST /api/orders)
├── Payments                     (POST /api/payments/create → redirect to PayMongo checkoutUrl)
├── Orders                        (GET /api/orders, /:id, PATCH /:id/cancel)
├── Delivery                       (GET /api/delivery — tracking view for the customer's own orders)
├── Booking                         (GET/POST/PATCH /api/bookings*)
├── AR Measurement                   (POST /api/ar/measurements — mobile AR SDK does the scanning)
├── Panel Estimate                    (POST /api/ar/estimate)
├── Projects                           (GET /api/projects — read-only view of own projects)
├── Chat                                (POST/GET /api/chat*)
├── Notifications                        (GET /api/notifications*, unread count/badge)
├── Feedback                              (POST/GET/PATCH/DELETE /api/feedback* — own, DELIVERED orders only)
└── Profile                                (GET/PATCH /api/users/:id — own profile)
```

### MODERATOR (web/admin panel)

```
├── Login
├── Dashboard                (GET /api/analytics/dashboard — operational subset, no financial fields)
├── Products                  (full CRUD on /api/products, /api/categories)
├── Inventory                  (GET/PATCH /api/inventory* — add/reduce/reserve/release, low-stock report)
├── Orders                      (GET /api/orders (all), PATCH /:id/status)
├── Bookings                     (GET /api/bookings/all, approve/assign-installer/status updates —
│                                  note: PATCH /:id/status and /:id/assign-installer are
│                                  MODERATOR-only; OWNER can view via GET /all but not approve/assign)
├── Delivery                      (full CRUD: POST /api/delivery, PATCH /:id, PATCH /:id/delivered,
│                                  DELETE /:id — OWNER has read-only access to this same data)
├── Installers                    (full CRUD on /api/installers — MODERATOR-only; OWNER has NO
│                                  access at all to this module, not even read)
├── Measurements                   (GET /api/ar/measurements — view-only, every customer's)
├── Projects                        (view/update assigned projects only — schedule/notes fields)
├── Requests                         (POST /api/requests, view/edit/cancel/delete own — cannot
│                                     approve/reject; OWNER-reviewed requests become read-only)
├── Feedback                          (GET /api/feedback*, /product/:productId, /order/:orderId —
│                                      view-only oversight; no write access for staff)
├── Chat                                (staff side of /api/chat*)
├── Notifications                       (GET /api/notifications*)
└── Reports                              (GET /api/reports* — non-financial fields only)
```

### OWNER (web/admin panel)

```
├── Login
├── Dashboard              (GET /api/analytics/dashboard — includes totalRevenue/averageOrderValue)
├── Analytics                (GET /api/analytics/sales, /products, /customers, /projects — full fields)
├── Sales                     (financial figures from /api/analytics/sales and /api/reports/sales)
├── Products                   (same catalog management access as MODERATOR)
├── Inventory                   (same access as MODERATOR)
├── Orders                       (same access as MODERATOR)
├── Bookings                      (view-only oversight: GET /api/bookings/all, GET /:id — cannot
│                                  approve or assign an installer, that's MODERATOR-only)
├── Delivery                       (view-only oversight: GET /api/delivery, GET /:id — cannot
│                                   create/update/mark-delivered/delete, that's MODERATOR-only)
├── Projects                      (full CRUD: create, assign/reassign, status, delete)
├── Requests                       (GET /api/requests (all), PATCH /:id/approve or /reject, DELETE
│                                   any request regardless of status)
├── Feedback                        (GET /api/feedback* — view-only oversight, same as MODERATOR)
├── Reports                         (GET /api/reports* — full fields including financial figures)
└── Notifications                    (GET /api/notifications*)
```

Note: OWNER has **zero** access to the Installer module (not even read) — every route in
`installer.routes.ts` is restricted to `MODERATOR` specifically, so an OWNER-facing screen for
installers should not be built at all; that management surface belongs entirely to MODERATOR.

**None of the above is built.** These are checklists for planning frontend work, derived directly from
what the backend's routes and role restrictions actually support today — not aspirational.

---

## 7. Frontend handoff checklist

Before frontend work begins, the receiving team should have:

- [x] Access to the backend repository (this repo)
- [x] `backend/README.md` (endpoint reference — now covers all 19 business modules, closed 2026-08-08)
- [x] This document and [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md)
- [x] Postman collections from `backend/postman/` — now covers all 19 business modules, plus Refresh
      Token rotation/logout and a manual Rate Limiting verification request inside `PanelScan-Auth`
      (closed 2026-08-08; see [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) §4).
- [x] Environment setup instructions (`backend/README.md` §5 — clone, `npm install`, CockroachDB setup,
      `.env` from `.env.example`, migrate, seed, run)
- [x] Seeded/demo account credentials, if the team wants to develop against a pre-populated dev
      database rather than registering fresh accounts. Verified directly against
      `backend/prisma/seed.ts` (run via `npm run prisma:seed`): one OWNER
      (`owner@panelscan.com` / `Owner@12345`), one MODERATOR (`moderator@panelscan.com` /
      `Moderator@12345`), 5 categories (Wall/Ceiling/Flooring/Partition/Cladding Panels), and 10
      products with inventory (qty 100 each, reorder level 15). There is no seeded CUSTOMER account —
      register one via `POST /api/auth/register` (registration always assigns `CUSTOMER`, it cannot
      be overridden by the client). **Treat these as local/dev-only credentials — never reuse them in
      a shared or production environment.**
- [x] The API base URL for whichever environment they're pointed at (local dev defaults to
      `http://localhost:4000`, configurable via `PORT`)
- [x] Role information (§2 of this document)
- [x] Authentication instructions (§3 of this document)

---

## 8. Testing expectations for frontend integration

- Treat every backend response as untrusted until validated against §4's envelope shape — don't assume
  `data` is always present (it's omitted on some 200/201 responses with no payload to return, e.g.
  logout).
- Build against the real error codes in §4.1, not assumptions — in particular, remember 404 is used
  for ownership violations (not just "truly doesn't exist"), and 409 means "conflicts with current
  state" (not a generic error).
- When integration-testing frontend flows manually, prefer hitting a real local backend (per
  `backend/README.md` §5) over mocking responses, at least for the primary happy paths — the backend's
  own test suite (530 passing integration tests as of this handoff) is the authority on exact response
  shapes; mocks drift from reality if the backend changes and the mock isn't updated in lockstep.
- Rate limiting is live in `development`/`production` (not just `production`) — repeated rapid manual
  testing of login/register/refresh during frontend development can trip the 5-per-15-minutes limit;
  this is expected behavior, not a bug to work around by disabling the limiter.

---

*Last verified against the repository: 2026-08-08.*
