# PanelScan — Development Guide

This is the reference for anyone continuing backend development on PanelScan: how the codebase is
organized, how to add a new module without breaking anything, how testing works, how Git/GitHub should
be used, and what "done" means for a feature. Everything here reflects the actual repository as
inspected on 2026-08-08 — see [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) for current status and
[FRONTEND_HANDOFF.md](FRONTEND_HANDOFF.md) for the frontend-facing contract.

For per-endpoint API documentation, see `backend/README.md` §3, which covers all 19 business modules
as of 2026-08-08.

---

## 1. What PanelScan is

PanelScan is the backend for an AR-powered e-commerce and project-management system for **Disenyo
Interior Solution**. It lets customers browse and buy interior panel products, book installation
services, take AR measurements to estimate how many panels a job needs, track projects, chat with
staff, and leave feedback. Staff (OWNER and MODERATOR) run the operational and business side through
the same API with different permissions.

**Roles** (`UserRole` enum — exactly these three, nothing else exists in the schema):
- `OWNER` — business owner: analytics, financials, reports, project management, request approval.
- `MODERATOR` — operational staff: orders, inventory, bookings, installers, projects (as assigned),
  customer communication, requests (as submitter), measurements (view), reports (non-financial).
- `CUSTOMER` — shopping, cart, checkout, payments, bookings, AR measurements, own project viewing,
  chat, notifications, feedback.

Role capabilities per endpoint are enforced in code via `restrictTo(...)` at the route level and,
where narrower rules apply within an allowed role (e.g. "MODERATOR can only edit their *own* assigned
project"), inside the service layer. See §4 for the exact pattern.

---

## 2. Confirmed technology stack

Read directly from `backend/package.json` and the source — **do not assume anything beyond this
list**:

| Concern | Technology | Notes |
|---|---|---|
| Runtime | Node.js + TypeScript 5 (strict mode) | Compiled via `tsc` for production; `tsx` for dev/watch |
| Web framework | Express 4.19 | |
| ORM | Prisma 5.19 (`@prisma/client` 5.19) | |
| Database | CockroachDB (Postgres wire-compatible) | Connection string uses `postgresql://` protocol |
| Validation | Zod 3.23 | `{ body, query, params }` schemas per route |
| Access tokens | `jsonwebtoken` 9.0 | Signed JWT, `JWT_SECRET`/`JWT_EXPIRES_IN` |
| Refresh tokens | Node's built-in `crypto` (no library) | Opaque random token + SHA-256 hash — **not** a JWT |
| Password hashing | `bcrypt` 5.1 (12 salt rounds) | Native module — see README §5 for the Windows build-tools caveat |
| Rate limiting | `express-rate-limit` 8.6 | |
| Security headers / CORS / logging | `helmet` 7.1 / `cors` 2.8 / `morgan` 1.10 | |
| HTTP calls to PayMongo | Native `fetch` | **Not Axios** — Axios is not a dependency anywhere in this repo |
| Testing | Vitest 2.1 + Supertest 7.0 | `@vitest/coverage-v8`, `dotenv-cli` for `.env.test` loading |
| API testing collections | Postman (`backend/postman/*.json`) | One collection per business module (19/19) as of 2026-08-08 |
| Source control | Git + GitHub | Single `main` branch today, remote `origin` |

There is no ORM other than Prisma, no GraphQL, no separate queueing system, and no Redis/caching layer.
GitHub Actions CI (`.github/workflows/backend-ci.yml`) was added 2026-08-08 — see §8.5.

---

## 3. Architecture

### 3.1 Folder structure (as it actually exists)

```
backend/
├── prisma/
│   ├── schema.prisma          # single source of truth for the DB schema — 22 models, 7 enums
│   └── migrations/            # 4 migrations applied so far (see §7)
│
├── src/
│   ├── config/
│   │   ├── env.ts             # Zod-validated process.env, exits the process on invalid config
│   │   └── database.ts        # singleton PrismaClient (reused across tsx watch reloads in dev)
│   │
│   ├── middleware/
│   │   ├── auth.middleware.ts       # `authenticate` — verifies JWT, loads the user, sets req.user
│   │   ├── role.middleware.ts       # `restrictTo(...roles)` — RBAC guard, must run after authenticate
│   │   ├── validate.middleware.ts   # `validate(zodSchema)` — validates & reassigns req.body only
│   │   ├── rateLimit.middleware.ts  # `createRateLimiter()` factory + authRateLimiter/apiRateLimiter
│   │   ├── notFound.middleware.ts   # 404 handler for unmatched routes
│   │   └── error.middleware.ts      # global error handler — must be registered LAST
│   │
│   ├── modules/                # one folder per business domain — see §4 for the pattern
│   │   ├── auth/  users/  category/  product/  inventory/  cart/  order/  payment/
│   │   ├── booking/  installer/  chat/  notifications/  feedback/  project/  request/
│   │   ├── analytics/  reports/  ar/  delivery/
│   │
│   ├── routes/
│   │   └── index.ts           # mounts every module router under /api/<prefix>
│   │
│   ├── types/
│   │   ├── express.d.ts       # augments Express Request with req.user: { id, email, role }
│   │   ├── jwt.types.ts       # JwtPayload (userId, role) — the access token's claims shape
│   │   └── api.types.ts       # ApiSuccessResponse / ApiErrorResponse / ApiValidationIssue
│   │
│   ├── utils/
│   │   ├── AppError.ts        # operational error class carrying an HTTP status code
│   │   ├── catchAsync.ts      # wraps async handlers so thrown errors reach the global handler
│   │   ├── jwt.ts             # signToken / verifyToken (access tokens)
│   │   ├── refreshToken.ts    # generateRefreshToken / hashRefreshToken (refresh tokens)
│   │   ├── password.ts        # hashPassword / comparePassword (bcrypt)
│   │   ├── slugify.ts         # text → URL-safe slug, used by category/product
│   │   └── response.ts        # sendSuccess() — the one place the success envelope is shaped
│   │
│   ├── app.ts                 # Express app: middleware pipeline + route registration (no listen())
│   └── server.ts              # loads env, calls app.listen(), graceful shutdown on SIGTERM/SIGINT
│
├── tests/
│   ├── <module>/<module>.test.ts   # one integration test file per module (20 files today)
│   ├── helpers/
│   │   ├── factories.ts       # direct-Prisma fixture builders (createTestUser, createTestOrder, ...)
│   │   ├── db.ts              # cleanDatabase() — FK-safe truncation run after every test
│   │   └── testApp.ts         # re-exports the real src/app.ts Express app for Supertest
│   ├── setup.ts                # beforeAll DB-reachability check + cleanDatabase, afterEach cleanup
│   └── tsconfig.json            # separate strict tsconfig for the test suite
│
├── postman/                    # per-module Postman collections (one per business module, 19/19)
├── .env.example / .env.test.example   # committed templates; real .env / .env.test are gitignored
├── package.json
└── README.md                   # endpoint-level API reference (partial — see roadmap doc)
```

### 3.2 What each layer is responsible for

- **`routes`** — wires middleware in order (`authenticate` → `restrictTo` → `validate`) and points
  each HTTP method+path at a controller method. Routes contain **no logic** — just composition.
- **`controllers`** — HTTP-only. Read `req`, call exactly one service method, shape the response via
  `sendSuccess()`, and nothing else. A controller never talks to Prisma directly and never contains an
  `if` statement that encodes a business rule.
- **`services`** — where all business logic lives: validation beyond what Zod can express (ownership,
  state transitions, cross-model rules), all Prisma calls, transactions, and triggering notifications.
  Services are plain classes exporting a singleton instance (`export const xService = new XService()`).
  Services never call each other directly for business logic — they reach across model boundaries via
  Prisma directly (e.g. Order's service touches `Inventory` and `Cart` rows itself). The one standing
  exception is `createNotification()` from the notifications module, which is a deliberately shared,
  side-effect-only helper every other service imports directly — not a service-to-service call.
- **`validation`** (`*.validation.ts`) — Zod schemas shaped `{ body, params, query }`, exported both
  as the schema and as an inferred TypeScript type (`z.infer<typeof schema>['body']`) for the service
  layer to consume with full type safety.
- **`types`** (`*.types.ts`, where present) — Prisma `include`/`select` shape constants and the
  TypeScript types derived from them (`Prisma.XGetPayload<{ include: typeof xInclude }>`), plus filter
  and pagination interfaces. Not every module has this file — smaller modules (category, users) keep
  types inline in the service.
- **`middleware`** — cross-cutting concerns that run before a controller: auth, RBAC, validation,
  rate limiting, and (registered last, always) the 404 and global error handlers.
- **Prisma** — the only database access path in this codebase. No raw SQL except where Prisma
  genuinely cannot express something (documented inline where it happens, e.g. low-stock detection
  comparing two columns of the same row).
- **`tests`** — one integration test file per module, run against a real database, not mocks (see §6).
- **`factories`** (`tests/helpers/factories.ts`) — build fixtures directly via Prisma, bypassing the
  real endpoints, so each test file can set up state without depending on other endpoints already
  working.
- **`config`** — anything that reads `process.env` or constructs an external client (Prisma). No
  business logic.
- **`utils`** — small, pure, reusable helpers with no Express request/response coupling, except
  `catchAsync`/`response.ts`, which exist specifically to remove duplication from controllers.

### 3.3 Request flow

```
Client
  ↓
Route (app.ts mounts routes/index.ts under /api, apiRateLimiter applied there)
  ↓
Rate limiting (authRateLimiter on auth-sensitive routes; apiRateLimiter on everything under /api)
  ↓
Authentication middleware (authenticate — verifies the JWT, loads the user, sets req.user)
  ↓
Authorization (restrictTo(...roles) — role check; ownership/assignment checks happen in the service)
  ↓
Validation (validate(zodSchema) — rejects malformed input before it reaches the controller)
  ↓
Controller (parses req, calls exactly one service method, calls sendSuccess())
  ↓
Service (business rules, Prisma calls, transactions, notifications)
  ↓
Prisma → CockroachDB
  ↓
Controller response (via sendSuccess(), or an AppError thrown anywhere above bubbles to
  the global error handler instead)
  ↓
Client
```

### 3.4 Why business logic belongs in services, not controllers

A controller's job is to translate HTTP into a service call and a service result back into HTTP — it
should be readable in one glance and never need a unit test beyond "does it call the right service
method with the right arguments." Putting business logic there instead means:
- It can't be reused if a second entry point ever needs the same logic (a background job, a CLI seed
  script, another route).
- It couples business rules to Express's request/response objects, making them harder to test and
  harder to reason about in isolation.
- It's where this codebase's actual bugs would hide hardest to find, since every controller in this
  repo is thin by convention — a controller with a stray `if` in it is instantly visible as wrong.

---

## 4. Rules for adding a new API (module development pattern)

Follow this exact sequence. Every module already in the repo was built this way — deviating from it
is the fastest way to introduce an inconsistency a future developer has to untangle.

### 4.1 Standard module structure

```
backend/src/modules/<module>/
├── <module>.types.ts        # Prisma include/select shapes + derived types (if the module needs them)
├── <module>.validation.ts   # Zod schemas + inferred input types
├── <module>.service.ts      # business logic, Prisma calls, transactions, notifications
├── <module>.controller.ts   # thin HTTP layer
└── <module>.routes.ts       # route wiring: authenticate → restrictTo → validate → controller
```

```
backend/tests/<module>/
└── <module>.test.ts         # integration tests against the real app + real test database
```

```
backend/postman/
└── PanelScan-<Module>.postman_collection.json
```

### 4.2 The 16-step checklist

1. **Read the module before changing anything nearby** — if you're extending an existing module,
   read its service and tests first. Understand the existing conventions (400 vs 409, 404-not-403 for
   ownership, notification patterns) before adding to them.
2. Create the module folder (`backend/src/modules/<module>/`).
3. Create `<module>.types.ts` if the module needs shared Prisma include/select shapes.
4. Create `<module>.validation.ts` — Zod schemas for every endpoint's body/params/query.
5. Create `<module>.service.ts` — all business logic and Prisma access.
6. Create `<module>.controller.ts` — thin wrappers calling the service and `sendSuccess()`.
7. Create `<module>.routes.ts` — wire `authenticate`/`restrictTo`/`validate` in the right order.
8. Register the router in `backend/src/routes/index.ts` (`router.use('/<prefix>', moduleRoutes)`).
9. Add `tests/<module>/<module>.test.ts` covering the cases in §6 below.
10. Add fixtures to `tests/helpers/factories.ts` if the module needs its own (`createTestX`), following
    the existing pattern: direct-Prisma, bypasses the real endpoint, minimal required fields with
    sensible defaults for the rest.
11. Add a Postman collection under `backend/postman/`.
12. Update `backend/README.md` §3 (endpoint reference) and, if new env vars were added, §4.
13. Update `PROJECT_NOTES.txt` if you're following that project's existing running-log convention.
14. Run `npm run build`, then `npm run test:typecheck`, then `npm test` — **all three, every time**,
    not just the one you think is relevant.
15. Review your `git diff` and `git status` — confirm no `.env`/`.env.test`, no accidental changes to
    unrelated files, nothing that looks like a secret.
16. Commit, push, open a PR (see §8) — don't push straight to `main`.

**Do not skip tests.** A module without its own test file is not done, regardless of how confident the
implementation looks — this codebase's entire safety net for "did I just break something else" is the
full test suite passing.

---

## 5. Database

### 5.1 Models and relationships (from the real `schema.prisma` — 22 models, 7 enums)

```
User (OWNER/MODERATOR/CUSTOMER)
 ├─ Cart (1:1)                → CartItem (N) → Product
 ├─ Order (N, Restrict)        → OrderItem (N, snapshotted) → Product (Restrict)
 │                             → Payment (1:1)  → (PayMongo Checkout Session)
 │                             → Delivery (1:1)
 │                             → Feedback (N, optional link)
 ├─ Booking (N, Cascade)       → Installer (optional, SetNull)
 ├─ Measurement (N, Cascade)   [AR]
 ├─ Feedback (N, Cascade)
 ├─ Project as customer (Restrict) / as owner (SetNull) / as moderator (SetNull)
 ├─ Request as requestedBy (Restrict) / as reviewedBy (SetNull)
 ├─ ChatParticipant (N, Cascade) → ChatRoom (N) → Message (N)
 ├─ Message as sender (Restrict)
 ├─ Notification (N, Restrict)
 └─ RefreshToken (N, Cascade)

Category (1) → Product (N, Restrict) → ProductImage (N, Cascade)
                                       → Inventory (1:1, Cascade)
                                       → CartItem (N, Cascade)
                                       → OrderItem (N, Restrict)
```

### 5.2 Important database rules (verified in the schema and services, not assumed)

- **Soft deletes are inconsistent by design, not by accident** — each model uses whatever fits its own
  need:
  - `Product.deletedAt` (nullable `DateTime`) — a product that's ever been ordered can't be
    hard-deleted (`OrderItem.product` is `onDelete: Restrict`), so discontinuing it sets `deletedAt`
    instead, preserving historical order data.
  - `Category.isActive`, `User.isActive`, `Installer.isActive` — boolean soft-deactivation, not a
    timestamp.
  - `Message`, `Project`, `Request` (when MODERATOR-deleted while never reviewed) — genuinely hard
    deleted. No soft-delete column exists on these models.
- **Historical order snapshots**: `OrderItem.productName` and `OrderItem.unitPrice` are copied at
  order-creation time, not read live from `Product` — so a later product rename/repricing never
  rewrites history. This is why `Order.customer` and `OrderItem.product` both use `onDelete: Restrict`
  — a customer or product with order history can never be hard-deleted.
- **Inventory protection**: `Inventory.quantity` vs `Inventory.reservedQty` are tracked separately.
  Checkout (`order.service.ts`) re-validates every cart line's availability *inside the same
  transaction* that creates the order and decrements inventory — CockroachDB's default SERIALIZABLE
  isolation is what actually prevents two concurrent checkouts from both succeeding against the same
  last unit of stock.
- **Refresh token hashing**: `RefreshToken.tokenHash` stores a SHA-256 hex digest of the opaque token,
  never the plaintext. SHA-256, not bcrypt — deliberate, because the lookup needs a deterministic hash
  to `findUnique({ where: { tokenHash } })`, and the token is already high-entropy random data (unlike
  a human-chosen password), so it doesn't need slow, salted hashing.
- **Role relationships**: `Project` carries three separate optional/required user FKs
  (`customerId` required, `ownerId`/`moderatorId` optional, all validated against the user's actual
  `role` in the service before assignment — you cannot assign a `CUSTOMER` as a project's moderator).
  `Request` similarly separates `requestedById` (always a MODERATOR in practice, enforced at the route
  level) from `reviewedById` (always an OWNER).
- **Notification metadata**: `Notification.metadata` is a nullable `Json` column — a flexible pointer
  to the related record (`{ "orderId": "..." }`, etc.) instead of a nullable FK column per possible
  notification source. `NotificationType` only has 5 values (`ORDER`, `PAYMENT`, `BOOKING`, `CHAT`,
  `SYSTEM`) — domains without a dedicated type (Project, Request, Feedback, Delivery) all use `SYSTEM`
  plus a `metadata.event` string (e.g. `"PROJECT_STATUS_CHANGED"`, `"REQUEST_APPROVED"`,
  `"DELIVERY_MARKED_DELIVERED"`) to stay distinguishable to API consumers.
- **Ownership enforcement is a 404, never a 403**, everywhere a resource belongs to a specific user or
  is scoped to an assignment (a CUSTOMER requesting someone else's order, a MODERATOR requesting a
  project they're not assigned to). This is a deliberate, consistent convention across every module —
  it prevents an attacker from using response codes to enumerate which resource IDs exist versus which
  ones they simply can't access.
- **400 vs 409 convention**: 400 means the *input itself* is invalid (bad shape, missing field, value
  out of range). 409 means the input is well-formed but *conflicts with the resource's current state*
  (approving an already-approved request, creating a second delivery for the same order, deleting a
  delivery that's already marked delivered). This split was established with the Request Approval
  module and is used consistently by every module built after it (Delivery, Refresh Token rotation
  errors, etc.).

### 5.3 Migrations

Four migrations exist under `backend/prisma/migrations/`:
1. `20260801130000_init_full_schema` — the full initial schema.
2. `20260801183803_add_project_notes` — added `Project.notes`.
3. `20260801191503_add_request_cancelled_status` — added `CANCELLED` to `RequestStatus`.
4. `20260802082341_add_refresh_tokens` — added the `RefreshToken` model.

CockroachDB Cloud has two known quirks that affected migration tooling setup (multi-region shadow
database conflicts, and `schema_locked` tables blocking index creation) — both are fully documented
with their fixes in `PROJECT_NOTES.txt` §3E. Read that before touching migration tooling if you hit
similar errors; they are environment quirks, not bugs in this codebase.

---

## 6. Authentication

### 6.1 Access token vs. refresh token

| | Access token | Refresh token |
|---|---|---|
| Format | JWT (`jsonwebtoken`), signed with `JWT_SECRET` | Opaque random hex string (`crypto.randomBytes(40)`) — **not** a JWT |
| Lifetime | `JWT_EXPIRES_IN` (default `7d`) | `REFRESH_TOKEN_EXPIRES_IN_DAYS` (default `7` days) |
| Sent as | `Authorization: Bearer <token>` header, every authenticated request | Request body, only to `/api/auth/refresh` and `/api/auth/logout` |
| Storage on the server | Not stored — verified by signature + expiry only | Stored, but only as a SHA-256 hash (`RefreshToken.tokenHash`) — plaintext is never persisted |
| Revocable before expiry? | **No** — a deactivated user's already-issued access token still works until it naturally expires (only login/refresh checks `isActive`) | **Yes** — via logout (revokes one token) or automatically on every rotation |
| Reuse after use | N/A (stateless) | **Single-use.** Every successful `/refresh` call revokes the presented token and issues a new one (rotation). Reusing an already-rotated token returns 401. |

### 6.2 The flows

- **Login** (`POST /api/auth/login`) — validates credentials, issues both a new access token and a new
  refresh token (a new `RefreshToken` row is created).
- **Register** (`POST /api/auth/register`) — issues **only** an access token, deliberately. Log in
  separately afterward to obtain a refresh token and start a refreshable session.
- **Refresh** (`POST /api/auth/refresh`) — no `Authorization` header needed (that's the point: it must
  work even when the access token has already expired). Validates the presented refresh token exists,
  is unexpired, and is unrevoked; then **rotates**: revokes that token and issues a new access token +
  new refresh token, atomically in one `$transaction`.
- **Logout** (`POST /api/auth/logout`) — requires a valid access token. Revokes **only** the one
  refresh token supplied in the body — other devices/sessions for the same user are untouched, since
  each login creates its own independent `RefreshToken` row.
- **Every protected route** — `authenticate` middleware verifies the access token, loads the user from
  the database (confirms they still exist and `isActive`), and attaches `req.user = { id, email, role }`.

### 6.3 Rate limiting on auth endpoints

`POST /api/auth/register`, `POST /api/auth/login`, and `POST /api/auth/refresh` share **one** counter:
5 requests per 15 minutes per IP (`RATE_LIMIT_AUTH_MAX`/`RATE_LIMIT_AUTH_WINDOW_MS`). Every other
`/api/*` route shares a separate, looser counter: 100 requests per 15 minutes per IP
(`RATE_LIMIT_API_MAX`/`RATE_LIMIT_API_WINDOW_MS`). `/health` is never rate-limited (it's registered
outside `/api`). Both limiters are automatically disabled when `NODE_ENV=test` so the integration test
suite — which shares one Express app instance and one IP across ~530 sequential tests — isn't
throttled; the real numeric behavior is verified separately in `tests/rateLimit/rateLimit.test.ts`
against isolated instances that don't get that exemption.

---

## 7. Testing standard

### 7.1 Philosophy

**Every mutation gets both an HTTP assertion and a direct Prisma database assertion.** This is not
optional style — it's how this test suite catches the class of bug where the API *returns* success but
the database state is wrong (or vice versa).

- **Successful mutation** = HTTP response assertion (status code, response shape) **+** a direct
  `prisma.<model>.findUnique(...)` (or similar) confirming the row actually changed as expected.
- **Rejected mutation** = HTTP error assertion **+** a direct Prisma read confirming **nothing**
  changed — no stray row created, no field silently updated.

### 7.2 What tests cover, per module

- Authentication (401 without a token, 401 for a malformed token)
- Authorization (403 for the wrong role, tested for every role that should be blocked)
- Validation (400 for malformed input, with field-level error messages)
- Ownership (404 — not 403 — when a resource exists but doesn't belong to/isn't assigned to the
  requester)
- Happy paths (the expected successful flow, end to end)
- Failure paths (every documented rejection: bad state transitions, conflicts, missing dependencies)
- Database state (see §7.1)
- Role differences (what an OWNER sees/can do vs. a MODERATOR vs. a CUSTOMER, on the same endpoint)
- Transaction behavior (e.g. checkout: one failing item aborts the whole order, verified by checking
  no partial `Order`/`OrderItem`/decremented `Inventory` rows exist afterward)
- Notification behavior (the right `Notification` row(s), with the right `type`/`metadata`, were
  created as a side effect)
- Edge cases specific to the module (pagination boundaries, expired/revoked/tampered refresh tokens,
  multi-device session independence, etc.)

### 7.3 How tests actually run

- Vitest + Supertest, wrapping the real `app` export from `src/app.ts` directly — no `server.listen()`,
  no port.
- A separate `.env.test` (gitignored; `.env.test.example` is the committed template), loaded via
  `dotenv-cli` at the npm-script level, pointed at a **dedicated test database** — never the same
  database as dev. The test suite truncates every table after every single test; running it against a
  shared database would destroy real data.
- `vitest.config.ts` forces `pool: 'forks', singleFork: true` — the entire suite runs sequentially in
  one process, sharing one CockroachDB connection and one global `afterEach` cleanup. This is
  deliberate, not an oversight: parallel workers would let one file's cleanup wipe another file's
  in-progress fixtures.
- `tests/setup.ts` fails fast with a clear error if the test database isn't reachable (rather than
  every one of ~530 tests timing out individually), and truncates all tables (FK-safe order, via
  `tests/helpers/db.ts`) after every test for isolation.
- `tests/helpers/factories.ts` provides direct-Prisma fixture builders (`createTestUser`,
  `createTestOrder`, `createTestRefreshToken`, etc.) so each test file can set up state without
  depending on other endpoints already working correctly.

### 7.4 Commands (verified against `package.json` — do not invent others)

| Command | What it does |
|---|---|
| `npm run dev` | `tsx watch src/server.ts` — dev server with hot reload |
| `npm run build` | `tsc` — production build |
| `npm start` | `node dist/server.js` — run the built output |
| `npm run typecheck` | `tsc --noEmit` — typecheck `src/` only |
| `npm run test:typecheck` | `tsc --noEmit -p tests/tsconfig.json` — typecheck `tests/` + `src/` together |
| `npm test` | `dotenv -e .env.test -- vitest run` — one-shot full integration suite |
| `npm run test:watch` | same, in watch mode |
| `npm run test:coverage` | same, with `@vitest/coverage-v8` coverage output |
| `npm run test:migrate` | `dotenv -e .env.test -- prisma migrate deploy` — applies migrations to the **test** DB |
| `npm run prisma:generate` | `prisma generate` |
| `npm run prisma:migrate` | `prisma migrate dev` — interactive; against a **dev** DB only |
| `npm run prisma:migrate:deploy` | `prisma migrate deploy` — non-interactive, safe for the dev DB too |
| `npm run prisma:studio` | `prisma studio` |
| `npm run prisma:reset` | `prisma migrate reset` — **destructive**, dev DB only, never run against test/prod without meaning it |
| `npm run prisma:seed` | `prisma db seed` (runs `prisma/seed.ts` via `tsx`) |

**Before merging anything**, run — in this order — `npm run build`, `npm run test:typecheck`, and
`npm test`. All three must pass. This is non-negotiable per this project's existing convention; every
module in the repo was verified this way before being considered complete.

---

## 8. Git / GitHub workflow

### 8.1 Current state

Single branch, `main`, with a remote `origin` on GitHub (`CeeJayRopa/PanelScan`). All work to date has
been committed directly by the person driving backend development, one feature/module (or small batch
of related modules) per commit. **This does not mean direct-to-`main` pushes should continue** once a
team is involved — the workflow below is the recommended go-forward process. As of 2026-08-08, pushes
and pull requests against `main` also run automatically through GitHub Actions CI — see §8.5.

### 8.2 Recommended branch structure

```
main
│
├── feature/auth-ui
├── feature/customer-products
├── feature/customer-cart
├── feature/customer-orders
├── feature/moderator-dashboard
└── feature/owner-dashboard
```

One branch per feature/task, named descriptively (`feature/<area>-<what>`), never a shared "everyone
commits here" branch besides `main` itself.

### 8.3 Recommended per-feature workflow

1. Pull the latest `main`.
2. Create a feature branch off it.
3. Understand the requirement, and check whether the existing API/database behavior already covers it
   before writing any code (§8.6 if the requirement came from the frontend team specifically).
4. Implement the smallest necessary change, following the module pattern in §4.
5. Test locally — run the app, exercise the actual endpoint(s) manually (curl/Postman), not just unit
   assertions.
6. `npm run build`.
7. `npm run test:typecheck`.
8. `npm test` — the full suite, not just your new file. If anything outside your change breaks, you
   changed something you shouldn't have.
9. Update documentation (README §3, the module's Postman collection, this guide if a rule/pattern
   changed).
10. Review your own `git diff` before committing (§8.4 — no secrets, nothing unexpected).
11. Commit, with a message describing *why*, not just *what*.
12. Push the branch.
13. GitHub Actions runs automatically (§8.5) — the same build/typecheck/test gate, on GitHub's
    infrastructure instead of yours. Wait for it to go green before requesting review.
14. Open a pull request against `main`.
15. Code review.
16. Merge — only after review and a green CI run.

**Never push unfinished or unverified work directly to `main`.** Once more than one person is working
in this repository, `main` should always be in a deployable state.

### 8.4 What never gets committed

- `.env`, `.env.test`, or any file containing real secrets/credentials (already gitignored — verify
  `.gitignore` still covers them before adding new env-driven config).
- Generated artifacts (`dist/`, `node_modules/`).
- Anything that would let a `git log` accidentally leak a database password, API key, or JWT secret,
  even in a since-reverted commit — check *before* committing, not after.

### 8.5 Continuous Integration (CI)

`.github/workflows/backend-ci.yml`, added 2026-08-08, is the first CI pipeline in this repository (see
[DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) §8 for the roadmap entry this closes).

**When it runs**: on every `push` to `main` and every `pull_request` targeting `main` (this repo's only
branch today — broaden the workflow's `branches` filters once feature branches are in real use).

**What it checks, in order** — every step reuses an existing `package.json` script, no invented
commands:
1. Checkout the repository.
2. Set up Node.js 20 (this repo's documented supported version — README.md §5 says "Node.js 20+", and
   `@types/node` is pinned to `^20.x`; `package.json` itself declares no `engines` field).
3. `npm ci` (lockfile-safe install — `backend/package-lock.json` exists with `lockfileVersion: 3`).
4. `npm run prisma:generate`.
5. `npm run test:typecheck` (a strict superset of the plainer `npm run typecheck` — it typechecks
   `tests/` *and* `src/` together via `tests/tsconfig.json`, which extends the root `tsconfig.json` and
   additionally includes `../src/**/*.ts`; running both scripts would be a redundant duplicate check).
6. `npm run build`.
7. `npm test` (the full integration suite), after standing up a throwaway CockroachDB instance and
   applying migrations — see below.

**Every step is blocking.** None of them use `continue-on-error`; a failure at any step (dependency
install, Prisma generation, typecheck, build, or tests) fails the whole job. Nothing about test results
is hidden or softened.

**Database / secrets required**: **none currently.** The real dev/test databases for this project live
on CockroachDB Cloud, and that test cluster has exhausted its monthly Request Unit quota (see
`PROJECT_NOTES.txt`) — pointing CI at it would make every run fail on external billing/infrastructure
state, not on this repository's own code. Instead, the workflow starts its own ephemeral, single-node
CockroachDB Docker container (`cockroachdb/cockroach:latest-v24.3`, insecure mode) for the lifetime of
each job, waits for it to accept connections, applies the one documented CockroachDB Cloud/version quirk
this project has hit before (`schema_locked` defaulting to `true` on new tables — §5.3, tolerated as a
no-op if the running CockroachDB build doesn't have that setting at all), creates the `panelscan_test`
database, copies the already-committed `backend/.env.test.example` to `.env.test` **unmodified** (its
`DATABASE_URL` already targets `postgresql://root@localhost:26257/panelscan_test?sslmode=disable`,
exactly matching the container CI just started, and every other value in that file is a documented,
non-sensitive placeholder — see the file's own header comment), then runs `npm run test:migrate` and
`npm test` against it. Because the container is fresh, private, and destroyed at the end of the job,
none of this requires a GitHub Actions Secret today.

If the team later wants CI to validate against real CockroachDB Cloud infrastructure instead (e.g. to
catch Cloud-specific quirks pre-emptively, rather than relying on §5.3's documented workarounds), that
would mean: adding a repository secret (e.g. `CI_DATABASE_URL`) holding a connection string to a
**dedicated CI-only** CockroachDB Cloud database (never the shared dev/test one), removing the
`docker run`/wait/migrate steps above, and pointing `.env.test`'s `DATABASE_URL` at
`${{ secrets.CI_DATABASE_URL }}` instead. Not implemented now, since it isn't needed and would only
reintroduce the same quota/shared-state risk this design deliberately avoids — documented here as the
path to take *if* that tradeoff is ever wanted.

**How to interpret a failed CI run**: click into the failed job and find the first red step — steps run
strictly in the order listed above, so the earliest failure is the real one (later steps didn't run at
all). A failure at "Install dependencies" or "Generate Prisma Client" usually means a real dependency
issue, not code. A failure at "Typecheck" or "Build" means the same thing it means locally — fix the
type error / compile error before merging. A failure at "Run integration tests" means either a genuine
regression (bisect against what changed) or, less commonly, the CockroachDB container itself failing to
start in the runner (rerun the job once before assuming it's code — transient container-start flakiness
on a shared GitHub-hosted runner is possible, a code regression usually is not intermittent). **Never**
respond to a red CI run by adding `continue-on-error`, skipping a test, or loosening a check — fix the
underlying cause, per §9's continuous development rules.

### 8.6 Frontend/backend change boundary

Now that a frontend team is starting work (see [FRONTEND_HANDOFF.md](FRONTEND_HANDOFF.md)), this rule
governs every request that looks like "the backend needs to change to support a screen":

> **Frontend development should consume the existing API. Do not modify backend behavior simply to
> make a frontend screen easier to build.**

The backend's routes, validation, authorization, and response shapes are the contract this whole
project (§6.2 of `FRONTEND_HANDOFF.md`'s "the backend is the source of truth" section) is built on.
"This would be more convenient for my screen" is not, by itself, a reason to change it — a genuine gap
(a workflow the API truly cannot support at all) is.

```
Frontend requirement
  ↓
Check existing API (backend/README.md §3, the relevant Postman collection, or the actual
  <module>.routes.ts / <module>.validation.ts if the README entry doesn't answer it)
  ↓
Does the API already support it?
  ├── YES → Build the frontend screen against the existing endpoint(s). Done.
  └── NO
        ↓
      Document the API gap (what's missing, and why the frontend genuinely cannot proceed
        without it — not just "would be nicer")
        ↓
      Review the backend requirement with whoever owns backend changes — is this really
        necessary, or is there an existing endpoint/field that already covers it?
        ↓
      Make the backend change ONLY if necessary (§4's module pattern; §10.1 if it needs a
        schema change)
        ↓
      Add/update backend tests (§7 — every mutation gets a DB-state assertion, every new
        endpoint gets auth/authz/validation/ownership/happy-path/failure-path coverage)
        ↓
      Verify build / typecheck / full test suite (§7.4) — same gate as any other backend change
        ↓
      Update documentation (README §3, the module's Postman collection, this guide/
        FRONTEND_HANDOFF.md if the contract itself changed)
        ↓
      Frontend consumes the updated API
```

A backend change driven by a frontend requirement goes through the **exact same** PR/review/CI process
as any other backend change (§8.3) — there is no separate, faster path for "the frontend team needs
this quickly." Skipping tests or documentation to unblock a frontend screen sooner is exactly the kind
of shortcut §9 below exists to prevent.

---

## 9. Continuous development rules — how we continue development without breaking the system

1. Never modify a completed module without understanding its tests.
2. Read the module before changing it.
3. Additive changes are preferred over rewrites.
4. Avoid unnecessary schema changes — most features fit into the existing 22-model schema without one.
5. If a schema change is genuinely required, create a proper Prisma migration (see §5.3 for the
   CockroachDB Cloud quirks to expect) — never hand-edit a production database to match code.
6. Never manually edit production (or test) data just to make a test pass. If a test fails, the
   fixture, the assertion, or the code is wrong — find out which.
7. Every new endpoint requires tests.
8. Every mutation requires a direct database-state verification in its test (§7.1).
9. Every new module requires documentation (README §3 entry at minimum).
10. Every new endpoint should have a Postman example.
11. Run the complete test suite (`npm test`) before merging — not just the tests for what you touched.
12. Never disable an existing test just to make a new feature "pass." A failing existing test means
    something broke; fix the cause, not the symptom.
13. Never change existing behavior silently. If a change affects an existing endpoint's response shape,
    status codes, or side effects, call it out explicitly in the PR description.
14. Preserve role-based authorization on every route you touch — don't accidentally widen access.
15. Preserve ownership checks (the 404-not-403 convention, §5.2) — don't accidentally leak resource
    existence to a non-owner.
16. Use transactions (`prisma.$transaction`) for multi-step financial or inventory operations — see
    `order.service.ts`'s checkout flow for the reference pattern.
17. Never store passwords or sensitive tokens in plaintext. Passwords use bcrypt; refresh tokens use
    SHA-256 (see §6) — follow the same principle for anything new in the same category.
18. Never commit `.env` files or secrets (§8.4).
19. Review migration SQL before applying it — especially on CockroachDB Cloud, where the shadow
    database and `schema_locked` quirks in §5.3 can produce confusing errors if you don't already know
    about them.
20. Keep `README.md` and `PROJECT_NOTES.txt` synchronized with actual implementation — this is not
    busywork; it's how the next person (or the next version of you) avoids re-discovering things that
    are already documented, and avoids trusting documentation that's silently gone stale (see the gap
    list in [DEVELOPMENT_ROADMAP.md](DEVELOPMENT_ROADMAP.md) §4 for what happens when this slips).

---

## 10. Developer decision process

### 10.1 "Do I need a schema change?"

```
Developer wants to add a feature
  ↓
Does it need new/changed data at rest?
  ├── NO  → implement the module using the existing schema (§4)
  └── YES
        ↓
      Can an existing field/model already represent it correctly?
        ├── YES → use it; document *why* it fits instead of adding a redundant field
        └── NO  → a migration is required
              ↓
            Write the schema change in prisma/schema.prisma
              ↓
            Generate the migration (see §5.3 for CockroachDB Cloud-specific steps —
              `prisma migrate dev` needs an interactive terminal for a brand-new migration;
              the non-interactive alternative used throughout this project's history is
              `prisma migrate diff --from-schema-datamodel <previous> --to-schema-datamodel
              <current> --script`, written into a manually-named migration folder, then applied
              with `prisma migrate deploy`)
              ↓
            Review the generated SQL — does it do only what you intended?
              ↓
            Apply to the dev database, then the test database (`npm run test:migrate`)
              ↓
            `npx prisma generate` to refresh the typed client
              ↓
            Implement and test against the new schema
```

### 10.2 Feature → merge, end to end

```
Create a feature branch off the latest main
  ↓
Understand the requirement
  ↓
Check existing API/database behavior (§8.6 if the requirement came from the frontend team)
  ↓
Implement the smallest necessary change (§4's module pattern)
  ↓
Write/update tests (§7)
  ↓
Database state verified in tests (§7.1)
  ↓
npm run test:typecheck
  ↓
npm run build
  ↓
npm test (full suite)
  ↓
Postman collection added/updated, manually exercised
  ↓
Documentation updated (README §3, PROJECT_NOTES.txt if following that convention)
  ↓
Review your own changes (git diff — no secrets, nothing unexpected, §8.4)
  ↓
git commit (descriptive, explains why)
  ↓
git push (feature branch)
  ↓
GitHub Actions runs automatically (§8.5) — wait for it to go green
  ↓
Pull request opened
  ↓
Code review
  ↓
Merge to main
```

---

## 11. Definition of Done

Every feature must satisfy all of these before it's considered complete:

- [ ] Requirements understood
- [ ] Existing related module(s) inspected
- [ ] Database impact checked (schema change needed? if so, is it minimal?)
- [ ] Validation added (Zod schema covering every field)
- [ ] Authorization added (`restrictTo` at the route level; ownership checks in the service)
- [ ] Service implemented (business logic, Prisma calls, transactions where needed)
- [ ] Controller implemented (thin, no business logic)
- [ ] Routes registered (in the module's `routes.ts` **and** in `src/routes/index.ts` if it's a new
      module)
- [ ] Tests added (§7.2's coverage list)
- [ ] Database mutation verified in tests (§7.1)
- [ ] Error cases tested (validation failures, ownership violations, state conflicts)
- [ ] Postman collection updated
- [ ] `README.md` updated
- [ ] `PROJECT_NOTES.txt` updated if following that project's convention
- [ ] `npm run build` passes
- [ ] `npm run test:typecheck` passes
- [ ] `npm test` passes (full suite — not just the new tests)
- [ ] `git diff` reviewed line by line
- [ ] No secrets committed
- [ ] Pull request reviewed by someone else

---

## 12. Troubleshooting / development workflow notes

- **"Can't reach the test database"** on `npm test` — check `.env.test` exists (copy from
  `.env.test.example`), points at a *dedicated test* CockroachDB database (never dev/prod), and that
  `npm run test:migrate` has been run against it.
- **CockroachDB Cloud migration errors** (`P3006`, "schema is locked") — these are documented,
  understood quirks, not bugs. See `PROJECT_NOTES.txt` §3E for the exact fix for each.
- **`bcrypt` fails to install** (common on Windows without VS Build Tools) — install the "Desktop
  development with C++" workload, or swap to `bcryptjs` (same API) in `src/utils/password.ts` and
  `package.json` as a documented fallback (see `README.md` §5).
- **A rate limit is unexpectedly blocking local testing** — check `NODE_ENV`. Both rate limiters are
  disabled when `NODE_ENV=test`; they're fully active in `development`/`production`.

---

*Last verified against the repository: 2026-08-08.*
