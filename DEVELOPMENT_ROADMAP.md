# PanelScan — Development Roadmap

Status snapshot and forward plan for the PanelScan backend, written for the team taking over
development. Everything in this document was verified against the actual repository (package.json,
`prisma/schema.prisma`, every route/service file, `tests/`, `postman/`) on **2026-08-08**, not assumed
from a spec. Where the real codebase differs from what a spec document might imply, that's called out
explicitly.

See also: [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) (architecture, how to add a module safely,
testing/Git rules) and [FRONTEND_HANDOFF.md](FRONTEND_HANDOFF.md) (what a frontend team needs to
start building against this API).

---

## 1. Progress at a glance

- **19 business/API modules** built, tested, and committed (see the tree in §2).
- **530/530 integration tests passing**, across 20 test files, run against a real CockroachDB Cloud
  test database (not mocks) — see [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) for how.
- `npm run build` and `npm run test:typecheck` both pass clean.
- 4 Prisma migrations applied to both the dev and test databases.
- Two cross-cutting security features are in: rate limiting and refresh-token authentication.
- **GitHub Actions CI is live** (`.github/workflows/backend-ci.yml`, added 2026-08-08) — build,
  typecheck, and the full test suite run on every push/PR against `main`. See §8.
- **Postman coverage is complete** — one collection per business module (19/19), added 2026-08-08.
  See §4.

---

## 2. Completed modules (verified against the repository)

```
backend/src/modules/
├── auth               ✅  register, login, /me, refresh, logout (JWT + rotating refresh tokens)
├── users              ✅  list (OWNER), get, update, deactivate (soft, via isActive)
├── category           ✅  catalog categories (soft delete via isActive)
├── product             ✅  catalog products (soft delete via deletedAt), panel dimensions for AR
├── inventory           ✅  stock levels, add/reduce/reserve/release, low-stock report
├── cart                ✅  customer's own cart (add/update/remove/clear)
├── order                ✅  checkout from cart, status lifecycle, cancellation, inventory restock
├── payment              ✅  PayMongo Checkout Sessions + signed webhook handling
├── booking              ✅  installation booking lifecycle + installer assignment
├── installer            ✅  installer roster (MODERATOR-managed)
├── chat                 ✅  customer/staff conversations, unread counts, read state
├── notifications        ✅  in-app notifications, shared by every other module
├── feedback              ✅  post-delivery ratings/comments, product & order views
├── project                ✅  project tracking (PENDING → IN_PROGRESS → COMPLETED/CANCELLED)
├── request                ✅  MODERATOR → OWNER approval workflow
├── analytics              ✅  live dashboard + sales/products/customers/projects, role-filtered
├── reports                 ✅  paginated sales/inventory/orders/bookings/projects reports
├── ar                       ✅  AR measurement persistence + panel-quantity estimation
└── delivery                 ✅  shipment tracking, 1:1 with Order

Cross-cutting (not modules, no dedicated route prefix):
├── Rate Limiting            ✅  express-rate-limit, auth + general API buckets
└── Refresh Token Auth       ✅  rotating, hashed refresh tokens; part of the auth module above
```

Every module above has: a Prisma-backed service, Zod-validated routes, role-based authorization,
and a dedicated Vitest+Supertest integration test file under `backend/tests/<module>/`. Endpoint-level
detail (routes, role permissions, request/response shape) is documented per-module in
`backend/README.md` §3 — **but not every module has a §3 entry** (see §4 below).

### What's explicitly NOT built (confirmed absent from the codebase)

- Forgot password / reset password flow
- Email verification on registration
- Account lockout after repeated failed logins
- MFA
- OAuth / social login
- Real PayMongo production credentials (the integration code exists and is tested against a stubbed
  `fetch`, but no live `sk_live_...` key has been configured — see §6, P3)
- CI/CD (no `.github/workflows/`)
- Any frontend (mobile or web) — this is a backend-only repository today

---

## 3. Architecture in one paragraph

Express + TypeScript (strict mode) on Node.js, Prisma ORM against CockroachDB (Postgres wire-compatible),
Zod for request validation, JWT (`jsonwebtoken`) for short-lived access tokens paired with rotating,
hashed refresh tokens for session renewal, `bcrypt` for password hashing, `express-rate-limit` for abuse
protection, and a layered `routes → controller → service → Prisma` pattern per module. Full detail —
folder responsibilities, the request lifecycle, and the exact pattern to follow for a new module — lives
in [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md).

---

## 4. Documentation & tooling gaps

The three gaps below were discovered during the initial backend-handoff audit (2026-08-08) and were
**closed in a dedicated P0 documentation-cleanup pass** the same day — kept here as a record of what
was found and fixed, not as open items. The remaining two rows are informational notes, not gaps.

| Gap | Detail | Status |
|-----|--------|----------|
| `backend/README.md` §3 (API Reference) skipped 8 early modules | Category, Product, Inventory, Cart, Order, Payment, Booking, and Installer had no endpoint documentation in README §3 — it jumped from Users straight to Chat. The endpoints existed and were fully tested the whole time; only the write-up was missing. | ✅ **Resolved** — all 8 modules now have full README §3 entries (base route, auth/role requirements, every endpoint, request/response shapes, business rules, ownership rules, status/workflow rules). |
| Postman collections existed for only 9 of 19 modules | `backend/postman/` had collections for Chat, Notifications, Feedback, Projects, Requests, Analytics, Reports, AR, and Delivery only. | ✅ **Resolved** — 10 new collections added: `PanelScan-Auth`, `PanelScan-Users`, `PanelScan-Categories`, `PanelScan-Products`, `PanelScan-Inventory`, `PanelScan-Cart`, `PanelScan-Orders`, `PanelScan-Payments`, `PanelScan-Bookings`, `PanelScan-Installers`. Refresh Token rotation/logout is covered inside `PanelScan-Auth`; a manual Rate Limiting verification request is included there too (rate limiting isn't itself a set of "requests" to collect — it's cross-cutting behavior on the existing auth endpoints, verified in `tests/rateLimit/rateLimit.test.ts` for the automated suite). All 19 business modules now have Postman coverage. |
| `backend/README.md` §8 ("What's next") was stale | It still listed inventory, orders, installers, project tracking, feedback, and request approval as future work — all of those were already built. | ✅ **Resolved** — §8 now shows a verified COMPLETED / NEXT / LATER / DEFERRED breakdown matching this document's §6. |
| Prompt assumed Axios; the codebase uses native `fetch` | The PayMongo integration (`payment.service.ts`) calls the PayMongo API with Node's built-in `fetch`, not Axios. Axios is not in `package.json` at all. | Informational — documented correctly as `fetch` throughout this handoff; don't reintroduce Axios without a reason. |
| Refresh tokens are not JWTs | Worth stating plainly since it's easy to assume otherwise: refresh tokens are opaque `crypto.randomBytes(40)` hex strings, hashed with SHA-256 before storage. Only the access token is a JWT. | Informational — see [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) and [FRONTEND_HANDOFF.md](FRONTEND_HANDOFF.md). |

One additional, narrower gap surfaced *while writing* the new Payment module documentation, not present
in the original audit: `payment.service.ts`'s ownership check on `POST /api/payments/create` returns
**403** for a customer paying for someone else's order, not the 404-for-ownership-violations convention
used almost everywhere else in this codebase (confirmed by reading the code directly, not assumed). This
is now documented accurately in README §3's Payment section as an intentional discrepancy to be aware
of — it is **not** a documentation gap and was left as-is, since this cleanup pass was documentation-only
and explicitly barred from touching application logic.

---

## 5. System workflow trees (verified against service code)

### Customer purchase journey
```
Register/Login → Access Token + Refresh Token issued
  → Browse Products (public, GET /api/products, /api/products/:id, /search, /featured)
  → Add to Cart (POST /api/cart/items — rejects out-of-stock / inactive / soft-deleted products)
  → Checkout (POST /api/orders — one $transaction: re-validates every cart line against live
      inventory, creates Order + OrderItems as a price/name SNAPSHOT, decrements Inventory.quantity,
      clears the cart; any single unavailable item aborts the whole order, nothing partial commits)
  → Pay (POST /api/payments/create — creates a PayMongo Checkout Session, upserts a Payment row)
  → PayMongo webhook (POST /api/payments/webhook, HMAC-verified) marks Payment PAID and,
      if the Order was still PENDING, advances it to PROCESSING
  → Delivery created/tracked (MODERATOR, POST/PATCH /api/delivery) → marked delivered
  → Order status set to DELIVERED by staff (PATCH /api/orders/:id/status)
  → Feedback (POST /api/feedback — only allowed once the order is DELIVERED, one feedback per order)
```
Order cancellation (`PATCH /api/orders/:id/cancel`, CUSTOMER, only while `PENDING`) and staff-driven
cancellation (`PATCH /api/orders/:id/status` → `CANCELLED`) both restock inventory identically via a
shared `restockOrderItems` helper. `DELIVERED` and `CANCELLED` are terminal — no further status change
is accepted.

### Booking workflow
```
PENDING --(MODERATOR/OWNER approve)--> APPROVED --(assign installer)--> SCHEDULED --(complete)--> COMPLETED
   |                                        |
   +---------------(cancel)-----------------+----------------(cancel)------------> CANCELLED
```
- CUSTOMER can only cancel their **own** booking, and only while it's `PENDING`.
- MODERATOR/OWNER can cancel from `PENDING`, `APPROVED`, or `SCHEDULED`.
- `SCHEDULED` is **only** reachable via `PATCH /api/bookings/:id/assign-installer` on an `APPROVED`
  booking — you cannot set status directly to `SCHEDULED`.
- Completing a booking (`PATCH /api/bookings/:id/status` → `COMPLETED`) has a side effect: it syncs
  a Project record for that customer (completes their most recent `IN_PROGRESS` project, or creates a
  new `COMPLETED` one if none exists) — there's no direct Booking↔Project foreign key, so this is a
  best-effort correlation by `customerId`, documented as a known limitation in the service code.

### Project workflow
```
PENDING --(OWNER starts)--> IN_PROGRESS --(OWNER/assigned MODERATOR completes)--> COMPLETED
   |                              |
   +----------(cancel)------------+---------------(cancel)-----------------------> CANCELLED
```
`COMPLETED` and `CANCELLED` are both terminal. OWNER can update any field on any project; an assigned
MODERATOR may only update `startDate`/`endDate`/`notes` on their **own assigned** project (403 on any
other field, 404 if not assigned to it). Only OWNER can reassign customer/moderator/owner
(`PATCH /:id/assign`) or delete a project.

### Request Approval workflow
```
MODERATOR creates request (PENDING) → notifies every active OWNER
  → OWNER approves (APPROVED) or rejects (REJECTED) — terminal either way, reviewer + note recorded
  → OR the submitting MODERATOR cancels their own still-PENDING request (CANCELLED) → notifies OWNERs
```
CANCELLED is deliberately distinct from REJECTED (self-withdrawal vs. an OWNER's decision) — this is
why `RequestStatus` has both. A MODERATOR can edit or delete their own request only while PENDING;
OWNER-reviewed (`APPROVED`/`REJECTED`) requests are an untouchable audit trail for MODERATOR, though
OWNER can still delete any request regardless of status.

### Chat workflow
```
CUSTOMER creates a ChatRoom (auto-joins as the first participant)
  → CUSTOMER or MODERATOR sends a Message (MODERATOR auto-joins the room on first reply)
  → every OTHER participant gets a CHAT notification
  → viewing a conversation (GET /:id/messages) auto-marks the other party's unread messages read
    and bumps the viewer's ChatParticipant.lastReadAt
  → sender can delete their own message; CUSTOMER/MODERATOR can mark a message read explicitly too
```
OWNER can read every conversation (for oversight) but cannot send messages or mark messages read —
enforced at the route level via `restrictTo`.

### AR measurement / panel estimation workflow
```
CUSTOMER creates a Measurement (width/height/depth, optional photo/AR-scan URLs)
  → POST /api/ar/estimate — either against a saved measurementId or raw width/height —
    looks up a Product's panel width/height (must be configured on the product),
    computes wallArea / panelArea = requiredPanels (rounded up), times unitPrice = estimatedCost
```
**Important for the frontend/mobile team:** the actual AR camera capture, scanning, and rendering
experience is entirely a mobile-app (frontend) responsibility. The backend only *persists* measurement
data the mobile app already captured and *calculates* a panel estimate from it — there is no AR/camera
code in this backend, and none is planned here.

---

## 6. Prioritized roadmap

### P0 — Required before frontend handoff
- [x] Fill the 8 missing module entries in `backend/README.md` §3 (Category, Product, Inventory, Cart,
      Order, Payment, Booking, Installer) — done 2026-08-08, see §4.
- [x] Create the missing Postman collections for the same 8 modules plus Auth, Users, Rate Limiting
      behavior, and Refresh Token Auth — done 2026-08-08, see §4.
- [x] Refresh `backend/README.md` §8 ("What's next") so it reflects reality instead of Phase 1 status
      — done 2026-08-08, see §4.
- [ ] Confirm `.env.example` / `.env.test.example` are current for whoever sets up a fresh environment
      (they were verified accurate as of this audit — re-check before handoff if the schema changes
      again).
- [ ] Walk a new developer through: clone → `npm install` → CockroachDB setup → `.env` → migrate →
      seed → `npm test` → `npm run dev`, end to end, once, before declaring handoff done.

### P1 — Important next
- [x] Stand up GitHub Actions CI — done 2026-08-08, see §8.
- [ ] Begin frontend development against the documented API (see
      [FRONTEND_HANDOFF.md](FRONTEND_HANDOFF.md) for the per-role task trees).

### P2 — Later
- [ ] Email verification on registration.
- [ ] Forgot password / reset password flow.
- [ ] Account lockout after repeated failed login attempts.
- [ ] Consider shortening `JWT_EXPIRES_IN` (currently defaults to `7d`) now that refresh tokens exist
      to renew access silently — this is a pure env var change, no code required, deliberately left at
      the existing default when refresh tokens were built to avoid changing existing behavior
      unasked. Revisit as a real decision, not a default flip.
- [ ] Consider `app.set('trust proxy', ...)` **only if and when** this is deployed behind a reverse
      proxy/load balancer — deliberately unset today (see `PROJECT_NOTES.txt` for the reasoning: an
      unconfigured deployment topology makes trusting `X-Forwarded-For` a spoofing risk, not a safety
      improvement).

### P3 — Deferred (do not implement without an explicit go-ahead)
- [ ] Real PayMongo production/live-key integration. The code path is complete and tested against a
      stubbed webhook signature; going live only requires real `PAYMONGO_SECRET_KEY` /
      `PAYMONGO_WEBHOOK_SECRET` values and registering the webhook URL in the PayMongo dashboard — but
      this is explicitly **out of scope** until the business is ready to accept real payments.

---

## 7. Security roadmap (current state → future work)

| Feature | Status |
|---|---|
| Password hashing (bcrypt, 12 rounds) | ✅ Done |
| JWT access tokens | ✅ Done |
| Refresh tokens (rotating, SHA-256-hashed, single-token revocation on logout) | ✅ Done |
| Rate limiting (auth: 5/15min/IP; general API: 100/15min/IP) | ✅ Done |
| Role-based authorization (`restrictTo`) + ownership checks (404-not-403 everywhere) | ✅ Done |
| Webhook signature verification (PayMongo HMAC, timing-safe compare) | ✅ Done |
| Email verification | ❌ Not built (P2) |
| Forgot / reset password | ❌ Not built (P2) |
| Account lockout | ❌ Not built (P2) |
| MFA / OAuth | ❌ Not built, not currently planned |
| `trust proxy` configuration | ⏸ Deliberately deferred until a real deployment topology exists |

## 8. CI/CD

**Done 2026-08-08**: `.github/workflows/backend-ci.yml` — on every push and pull request against
`main`, checkout → Node 20 setup → `npm ci` → `npm run prisma:generate` → `npm run test:typecheck` →
`npm run build` → start an ephemeral CockroachDB container → `npm run test:migrate` → `npm test`. Every
step is blocking (no `continue-on-error` anywhere); the earliest failing step is authoritative. Full
detail — exact step order, why an ephemeral per-run CockroachDB container instead of the (currently
quota-exhausted) shared Cloud test cluster, what a GitHub Secret would be needed for if that ever
changes, and how to read a failed run — is in
[DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md) §8.5, not duplicated here.

Not yet done, worth considering later, not scheduled: a coverage-reporting step (`npm run test:coverage`
already exists and produces `lcov`, but nothing currently uploads or gates on it), and a separate
lint/format check if a linter is ever added to this project (none exists today — this codebase's quality
gate today is `tsc` strict mode + the test suite, not ESLint/Prettier).

---

*Last verified against the repository: 2026-08-08. If you find this document drifting from the actual
code, trust the code and update this file — see [DEVELOPMENT_GUIDE.md](DEVELOPMENT_GUIDE.md)'s
"Continuous Development Rules" §16, "Keep README and PROJECT_NOTES synchronized with actual
implementation," which applies equally here.*
