# PanelScan — Backend (Phase 1: Foundation)

AR-powered e-commerce and project management system for **Disenyo Interior Solution**.

This is **Phase 1** of the backend: the foundational Express + TypeScript + Prisma (CockroachDB) API,
with authentication (register/login/me), role-based access control, and a `users` module. Feature
modules for inventory, orders, projects, installers, etc. will be added in later phases on top of
this foundation.

---

## 1. Tech Stack

| Layer          | Technology                        |
|----------------|------------------------------------|
| Runtime        | Node.js + TypeScript (strict mode) |
| Framework      | Express                            |
| Database       | CockroachDB                        |
| ORM            | Prisma                             |
| Auth           | JWT (jsonwebtoken) + bcrypt        |
| Validation     | Zod                                |
| Security       | Helmet, CORS                       |
| Logging        | Morgan                             |
| Dev runner     | tsx (watch mode)                   |

---

## 2. Folder Structure

```
backend/
├── prisma/
│   └── schema.prisma          # Database schema (CockroachDB datasource, User model, UserRole enum)
├── src/
│   ├── config/
│   │   ├── env.ts             # Loads & validates process.env with Zod, exports typed `env`
│   │   └── database.ts        # Singleton PrismaClient instance
│   │
│   ├── middleware/
│   │   ├── auth.middleware.ts     # `authenticate` — verifies JWT, attaches req.user
│   │   ├── role.middleware.ts     # `restrictTo(...roles)` — RBAC guard
│   │   ├── validate.middleware.ts # `validate(zodSchema)` — validates body/params/query
│   │   ├── notFound.middleware.ts # 404 handler for unmatched routes
│   │   └── error.middleware.ts    # Global error handler (last middleware in the chain)
│   │
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── auth.routes.ts      # /api/auth/* route definitions
│   │   │   ├── auth.controller.ts  # HTTP layer — request/response only
│   │   │   ├── auth.service.ts     # Business logic — register, login, getCurrentUser
│   │   │   └── auth.validation.ts  # Zod schemas: registerSchema, loginSchema
│   │   │
│   │   └── users/
│   │       ├── users.routes.ts     # /api/users/* route definitions
│   │       ├── users.controller.ts # HTTP layer
│   │       └── users.service.ts    # Business logic — list/get/update/deactivate users
│   │
│   ├── routes/
│   │   └── index.ts           # Mounts all module routers under /api
│   │
│   ├── types/
│   │   ├── express.d.ts       # Augments Express `Request` with `req.user`
│   │   ├── jwt.types.ts       # JwtPayload interface
│   │   └── api.types.ts       # ApiResponse / ApiErrorResponse contracts
│   │
│   ├── utils/
│   │   ├── AppError.ts        # Operational error class carrying an HTTP status code
│   │   ├── catchAsync.ts      # Wraps async route handlers to forward errors to next()
│   │   ├── jwt.ts             # signToken / verifyToken
│   │   ├── password.ts        # hashPassword / comparePassword (bcrypt)
│   │   └── response.ts        # sendSuccess() — standardized success envelope
│   │
│   ├── app.ts                 # Express app: middleware pipeline + route registration
│   └── server.ts              # Loads env, starts HTTP server, graceful shutdown
│
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

### What each folder is responsible for

- **`prisma/`** — the single source of truth for the database schema. Running `prisma migrate dev`
  reads this file and generates/applies SQL migrations against CockroachDB.
- **`config/`** — anything that reads the environment or wires up an external client (DB, future
  services like S3/email). Nothing here should contain business logic.
- **`middleware/`** — cross-cutting Express concerns that run *before* or *around* route handlers:
  authentication, authorization, request validation, and error formatting.
- **`modules/`** — one folder per business domain (`auth`, `users`, and later `inventory`,
  `orders`, `projects`, etc.). Each module is self-contained with its own routes → controller →
  service layering, so features can be added without touching unrelated code.
- **`routes/`** — the composition root that mounts every module's router under `/api`.
- **`types/`** — shared TypeScript types and ambient declarations (e.g. augmenting Express's
  `Request` type) used across modules.
- **`utils/`** — small, pure, reusable helpers with no Express-specific request/response coupling
  (except `catchAsync`/`response.ts`, which exist specifically to remove duplication from
  controllers).

### Architecture / request flow

```
Request
  → middleware (helmet, cors, morgan, json parser)
  → routes/index.ts → modules/<name>/<name>.routes.ts
      → middleware/validate.middleware.ts   (Zod validation)
      → middleware/auth.middleware.ts       (JWT authentication, if protected)
      → middleware/role.middleware.ts       (RBAC, if restricted)
      → <name>.controller.ts                (HTTP-only: parse req, call service, format res)
          → <name>.service.ts               (business logic, Prisma calls, throws AppError)
  → middleware/error.middleware.ts (on any thrown/forwarded error)
```

Controllers are implemented as classes whose service dependency is injected via the constructor
(`new AuthController(authService)`), keeping the controller decoupled from how the service is
constructed and easy to unit test with a mock service.

---

## 3. API Reference

Base URL: `http://localhost:4000/api`

All responses follow a standard envelope:

```jsonc
// Success
{ "success": true, "message": "...", "data": { ... } }

// Error
{ "success": false, "message": "...", "errors": [ { "path": "email", "message": "..." } ] }
```

### Auth — `/api/auth`

| Method | Endpoint    | Auth required | Description                                  |
|--------|-------------|:---:|-----------------------------------------------------|
| POST   | `/register` | No  | Creates a new `CUSTOMER` account, returns user + access token |
| POST   | `/login`    | No  | Validates credentials, returns user + access token + refresh token |
| GET    | `/me`       | Yes | Returns the authenticated user's profile             |
| POST   | `/refresh`  | No  | Exchanges a valid refresh token for a new access token + a new (rotated) refresh token |
| POST   | `/logout`   | Yes | Revokes the one refresh token supplied in the body    |

**POST `/api/auth/register`**
Body:
```json
{
  "firstName": "Juan",
  "lastName": "Dela Cruz",
  "email": "juan@example.com",
  "password": "Passw0rd123",
  "phone": "+63 912 345 6789"
}
```
- `firstName`/`lastName`: 2–50 chars
- `email`: valid email, lower-cased automatically
- `password`: 8–72 chars, must contain an uppercase letter, a lowercase letter, and a number
- `phone`: optional
- Role is **always** forced to `CUSTOMER` server-side — it cannot be set by the client.
- `409` if the email is already registered.
- Only issues an access token (`data.token`), not a refresh token — log in separately to start a refreshable session.

**POST `/api/auth/login`**
Body: `{ "email": "juan@example.com", "password": "Passw0rd123" }`
- `401` on invalid credentials, `403` if the account has been deactivated.
- Response: `{ "user": {...}, "token": "<JWT access token>", "refreshToken": "<opaque refresh token>" }`.

**GET `/api/auth/me`**
Header: `Authorization: Bearer <token>`
- Returns the current authenticated user (password never included in any response).

**POST `/api/auth/refresh`**
Body: `{ "refreshToken": "<opaque refresh token>" }` — no `Authorization` header needed (that's the point: it works even after the access token has expired).
- Validates the token exists, is unexpired, and is unrevoked (its stored hash must match).
- **Rotates on every successful call**: the presented token is revoked and a brand-new refresh token is issued in the same database transaction, alongside a new access token. The old refresh token can never be redeemed again (replay protection) — reusing it returns `401`.
- `401` if the token is unknown/tampered, expired, or already revoked. `403` if the token's owner account has since been deactivated.
- Response: `{ "token": "<new JWT access token>", "refreshToken": "<new opaque refresh token>" }`.

**POST `/api/auth/logout`**
Header: `Authorization: Bearer <token>` (a still-valid access token).
Body: `{ "refreshToken": "<opaque refresh token>" }`
- Revokes **only** that one refresh token — other active sessions/devices for the same user are untouched.
- `404` if the token doesn't exist or doesn't belong to the authenticated caller (never `403`, so a caller can't use the response to probe whether a token exists for someone else).

### Users — `/api/users`

All routes require `Authorization: Bearer <token>`.

| Method | Endpoint | Required role                | Description                                 |
|--------|----------|-------------------------------|----------------------------------------------|
| GET    | `/`      | `OWNER`                       | List all users                                |
| GET    | `/:id`   | Self, `OWNER`, or `MODERATOR` | Get a single user by id                       |
| PATCH  | `/:id`   | Self or `OWNER`                | Update `firstName` / `lastName` / `phone`    |
| DELETE | `/:id`   | `OWNER`                       | Soft-delete (sets `isActive: false`)          |

- `:id` must be a valid UUID (`400` otherwise).
- A `CUSTOMER` may only view/update their own record; `OWNER` can act on anyone.

### Category — `/api/categories`

Product catalog categories. `GET` routes are public (no `Authorization` header required); write routes require `Authorization: Bearer <token>`.

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET    | `/`      | Public | List every active category, sorted by name |
| GET    | `/:id`   | Public | Get a single **active** category by id |
| POST   | `/`      | `OWNER`, `MODERATOR` | Create a category |
| PATCH  | `/:id`   | `OWNER`, `MODERATOR` | Update a category |
| DELETE | `/:id`   | `OWNER`, `MODERATOR` | Soft-delete (sets `isActive: false`) |

- `name`: 2–100 characters. `slug`: optional — defaults to a slugified version of `name` if omitted; must match `^[a-z0-9]+(-[a-z0-9]+)*$` if supplied. `description`: optional, up to 1000 characters. `imageUrl`: optional, must be a valid URL.
- `name` and `slug` must both be unique — a conflict on either returns `409`.
- `GET /` and `GET /:id` only ever return **active** categories — once soft-deleted, a category is no longer reachable through any read endpoint in this module (there is no "show inactive" query flag). `PATCH` can still target a soft-deleted category by id if you already have it (it isn't re-filtered by `isActive`), but you cannot look it back up afterward through this API.
- `:id` must be a valid UUID (`400` otherwise); a well-formed but nonexistent/inactive id returns `404`.
- Response shape: `{ "category": {...} }` for single-record endpoints; `{ "categories": [...] }` for the list (no pagination — `GET /` returns every active category in one response).

**POST `/api/categories`**
Body: `{ "name": "Wall Panels", "description": "Decorative and acoustic wall panels.", "imageUrl": "https://example.com/wall-panels.jpg" }`

**PATCH `/api/categories/:id`**
Body (any subset, at least one field required): `{ "name": "Wall Panels (Updated)", "isActive": false }`

### Product — `/api/products`

Catalog products, including the panel `width`/`height`/`thickness` dimensions used by the AR Support module's panel estimator. `GET` routes are public; write routes require `Authorization: Bearer <token>`.

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET    | `/`      | Public | List products. Supports `?page=`, `?limit=`, `?search=`, `?categoryId=`, `?isFeatured=true\|false`, `?minPrice=`, `?maxPrice=`, `?sortBy=price\|name\|createdAt`, `?sortOrder=asc\|desc` |
| GET    | `/search`| Public | Same as `GET /`, but `?search=` is required |
| GET    | `/featured` | Public | Featured products only (`isFeatured: true`); `?limit=` optional, defaults to 8 |
| GET    | `/category/:categoryId` | Public | Products in a category (`404` if the category doesn't exist); same query filters as `GET /` |
| GET    | `/:id`   | Public | A single active, non-deleted product, with category/images/inventory relations |
| POST   | `/`      | `OWNER`, `MODERATOR` | Create a product |
| PATCH  | `/:id`   | `OWNER`, `MODERATOR` | Update a product |
| DELETE | `/:id`   | `OWNER`, `MODERATOR` | Soft-delete (`deletedAt` + `isActive: false`) |

- `categoryId`: must reference an existing category (`404` otherwise). `name`: 2–150 characters. `slug`: optional, defaults to a slugified `name`, same regex as Category. `sku`: 2–50 characters, must be unique. `price`/`width`/`height`/`thickness`: positive numbers, all optional except `price`. `unit`: optional, max 20 characters (defaults to `"piece"` at the schema level). `material`: optional, max 100 characters. `isFeatured`: optional boolean. `images`: optional array, max 10, each `{ url (required, valid URL), altText?, isPrimary?, sortOrder? }`.
- `slug` and `sku` must both be unique across all products — a conflict on either returns `409`.
- All public read endpoints (`GET /`, `/search`, `/featured`, `/category/:categoryId`, `/:id`) only ever return products where `deletedAt IS NULL AND isActive = true` — a soft-deleted or deactivated product disappears from every public read, permanently (there is no way to un-delete through this API; `deletedAt` is never cleared once set).
- `PATCH` with an `images` array **replaces** every existing image for that product (deletes all, then creates the new set) inside a transaction — it does not merge or append.
- **Important, verified gap**: creating a product does **not** create an `Inventory` row for it. There is no `POST` endpoint in the Inventory module either (see below) — a brand-new product has zero inventory until a row is created for it directly via Prisma (e.g. a seed script or a future admin tool). Until then, `GET /api/inventory/:productId` returns `404`, and the Cart/Order modules treat "no inventory row" as 0 available stock (`"This product is out of stock."`). This is documented here as an accurate description of current behavior, not a bug to be silently patched — flagged for the roadmap instead.
- Response shape: `{ "product": {...} }` / `{ "products": [...], "pagination": {...} }`. A product's `inventory` field is `null` if no inventory record exists for it yet (see the gap above).

**POST `/api/products`**
Body:
```json
{
  "categoryId": "<uuid>",
  "name": "Oak Veneer Wall Panel",
  "sku": "WP-OAK-001",
  "price": 1850.00,
  "width": 60,
  "height": 240,
  "thickness": 1.2,
  "material": "Oak Veneer",
  "isFeatured": true
}
```

**PATCH `/api/products/:id`**
Body (any subset, at least one field required): `{ "price": 1900.00, "isFeatured": false }`

### Inventory — `/api/inventory`

Stock tracking, one row per product (`Inventory.productId` is unique). A back-office-only module — every route requires `Authorization: Bearer <token>` **and** `OWNER` or `MODERATOR` (unlike Category/Product, nothing here is public).

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET    | `/`      | `OWNER`, `MODERATOR` | List every inventory record. `?page=`, `?limit=` (default limit 50) |
| GET    | `/low-stock` | `OWNER`, `MODERATOR` | Every record where `quantity <= reorderLevel` (not paginated) |
| GET    | `/:productId` | `OWNER`, `MODERATOR` | Inventory for one product (`404` if no record exists) |
| PATCH  | `/:productId/add` | `OWNER`, `MODERATOR` | Increase `quantity`; stamps `lastRestockedAt` |
| PATCH  | `/:productId/reduce` | `OWNER`, `MODERATOR` | Decrease `quantity` |
| PATCH  | `/:productId/reserve` | `OWNER`, `MODERATOR` | Increase `reservedQty` (stock held for pending carts/orders) |
| PATCH  | `/:productId/release` | `OWNER`, `MODERATOR` | Decrease `reservedQty` |

- Every `add`/`reduce`/`reserve`/`release` body is the same shape: `{ "quantity": <positive integer> }`.
- `reduce`: rejected with `400` if `quantity` exceeds the current `quantity` on hand.
- `reserve`: rejected with `400` if `quantity` exceeds **available** stock (`quantity - reservedQty`), not raw `quantity` — you cannot reserve stock that's already reserved for something else.
- `release`: rejected with `400` if `quantity` exceeds the currently reserved amount.
- Low-stock detection (`quantity <= reorderLevel`) is computed in application code, not a database query — Prisma cannot compare two columns of the same row in a `where` clause without a raw query, so `GET /low-stock` fetches every record and filters in memory. Fine at this data scale; worth knowing if the product catalog grows very large.
- **There is no `POST /api/inventory` (create) endpoint anywhere in this module.** Inventory rows are only ever created outside the running API today (the seed script, or direct Prisma access) — see the Product section's gap note above for the downstream effect on checkout.
- Response shape: `{ "inventory": {...} }` for single-record endpoints (including the mutation endpoints, which return the updated record); `{ "inventory": [...], "pagination": {...} }` for the paginated list; `{ "inventory": [...] }` (no pagination) for `/low-stock`.

**PATCH `/api/inventory/:productId/add`**
Body: `{ "quantity": 50 }`

### Cart — `/api/cart`

The authenticated customer's own shopping cart — always "my cart," never addressed by a cart id in the URL. Every route requires `Authorization: Bearer <token>` and the `CUSTOMER` role (`403` for `OWNER`/`MODERATOR`).

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/`      | Get (or auto-create, if none exists yet) the current customer's cart |
| POST   | `/items` | Add a product to the cart, or increase its quantity if already present |
| PATCH  | `/items/:productId` | Set a cart line's quantity to an exact value |
| DELETE | `/items/:productId` | Remove one product line from the cart |
| DELETE | `/`      | Remove every item, keeping the (now-empty) cart itself |

- `POST /items` body: `{ "productId": "<uuid>", "quantity": <positive integer> }`. `PATCH /items/:productId` body: `{ "quantity": <positive integer> }`.
- A product must exist and not be soft-deleted (`404`), and must be `isActive` (`400`, "This product is currently unavailable.") to be added or kept in the cart.
- Availability is always checked against `quantity - reservedQty`, never raw `quantity`: `400` ("out of stock" / "Only N unit(s) ... are available.") if the requested total would exceed what's actually available. A product with no `Inventory` row at all is treated as 0 available (see the Product/Inventory gap notes above).
- Adding a product already in the cart **combines** the quantities (existing + new), re-validated against availability as a whole — it does not create a second line for the same product (`CartItem` has a `@@unique([cartId, productId])` constraint).
- `DELETE /items/:productId` / `PATCH /items/:productId` on a product not currently in the cart returns `404`.
- Response shape: `{ "cart": { ..., "items": [ { ..., "product": { id, name, slug, sku, price, unit, isActive, deletedAt, images: [primary image only], inventory: { quantity, reservedQty } } } ] } }` on every endpoint in this module.

**POST `/api/cart/items`**
Body: `{ "productId": "<uuid>", "quantity": 2 }`

### Order — `/api/orders`

Checkout and order lifecycle. All routes require `Authorization: Bearer <token>`.

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET    | `/`      | any  | `CUSTOMER`: own orders only. `MODERATOR`/`OWNER`: every order. `?page=`, `?limit=`, `?status=` |
| GET    | `/:id`   | any  | Order details + line items. `CUSTOMER`: own only (`404` otherwise) |
| POST   | `/`      | `CUSTOMER` | Check out the customer's **current cart** into a new order |
| PATCH  | `/:id/cancel` | `CUSTOMER` | Cancel your own order, only while it's `PENDING` |
| PATCH  | `/:id/status` | `OWNER`, `MODERATOR` | Advance/change an order's status |

- `POST /` body: `{ "shippingAddress": "<10–500 chars>", "notes": "<optional, up to 1000 chars>" }`. There is **no line-item input** — the order is built entirely from whatever is currently in the customer's cart; an empty cart returns `400` ("Your cart is empty.").
- Checkout is one database transaction: every cart line is re-validated against live inventory and product status (an inactive/soft-deleted/insufficient-stock item aborts the **entire** order — nothing partial is ever created), `OrderItem.productName`/`unitPrice` are snapshotted from the product at that moment (later product renames/repricing never rewrite historical orders), `Inventory.quantity` is decremented per line, and the cart is cleared.
- `shippingFee` is currently **always `0`** — there is no shipping-cost calculation implemented in this codebase yet. `totalAmount = subtotal + shippingFee` (i.e. `totalAmount` currently always equals `subtotal`).
- `orderNumber` format: `PS-YYYYMMDD-<6-char random suffix>`.
- Status values: `PENDING → PROCESSING → SHIPPED → DELIVERED`, or `→ CANCELLED` from a non-terminal state. `DELIVERED` and `CANCELLED` are both terminal — any further `PATCH /:id/status` on either returns `400`.
- Cancelling (either the customer's own `PENDING`-only cancel, or a staff status change to `CANCELLED`) restocks every line item's `Inventory.quantity` identically, via the same shared logic either way.
- Triggers `ORDER`-type notifications to the customer on both order placement and every subsequent status change (including cancellation).
- Response shape: `{ "order": { ..., "items": [...], "customer": { id, firstName, lastName, email, phone } } }` / `{ "orders": [...], "pagination": {...} }`.

**POST `/api/orders`**
Body: `{ "shippingAddress": "123 Rizal Street, Quezon City, Metro Manila, 1100", "notes": "Please call on arrival." }`

**PATCH `/api/orders/:id/status`**
Body: `{ "status": "SHIPPED" }`

### Payment — `/api/payments`

PayMongo Checkout Sessions integration. Most routes require `Authorization: Bearer <token>`; the webhook route deliberately does not.

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST   | `/webhook` | None (PayMongo calls this directly) | Receives PayMongo payment events |
| GET    | `/`      | any  | `CUSTOMER`: own payments only. `MODERATOR`/`OWNER`: every payment. `?page=`, `?limit=` |
| GET    | `/:id`   | any  | A single payment. `CUSTOMER`: own only. |
| POST   | `/create`| `CUSTOMER` | Create a PayMongo Checkout Session for one of the customer's own orders |

- `POST /create` body: `{ "orderId": "<uuid>" }`. The order must exist (`404` otherwise); if it exists but belongs to a **different** customer, this endpoint returns **`403`, not `404`** — this is the one exception to this API's otherwise-universal 404-for-ownership-violations convention, verified directly in `payment.service.ts`. An order that's `CANCELLED`, or already has a `PAID`/`REFUNDED` payment, returns `400`.
- Requires `PAYMONGO_SECRET_KEY` to be configured; without it, `POST /create` fails with `500` ("Payment provider is not configured.").
- `POST /create` response shape is deliberately narrow — **not** a full payment object: `{ "paymentId": "...", "status": "PENDING", "checkoutUrl": "https://..." }`. Redirect the customer's browser/webview to `checkoutUrl` to complete payment on PayMongo's hosted page.
- `POST /webhook` verifies the `Paymongo-Signature` header (HMAC-SHA256, timing-safe comparison) against `PAYMONGO_WEBHOOK_SECRET` **only if that env var is set** — if it's left unconfigured, incoming webhook payloads are accepted **without signature verification**. Never leave this unset in a real deployment. On a verified `payment.paid` event: marks the matching `Payment` row `PAID`, advances the linked `Order` from `PENDING` to `PROCESSING` if it was still pending, and sends a `PAYMENT` notification. On `payment.failed`: only downgrades a still-`PENDING` payment to `FAILED` (never overwrites an already-resolved payment). Any other event type, or one that can't be correlated to a known payment, is acknowledged with `200` and ignored (so PayMongo doesn't retry indefinitely for something this integration doesn't act on).
- `GET /:id` returns a narrower, explicit field set (`id`, `orderId`, `status`, `amount`, `method`, `transactionRef`, `paidAt`, `createdAt`) rather than the full payment-with-order-relation shape used by `GET /` — by design, verified in `payment.controller.ts`.

**POST `/api/payments/create`**
Body: `{ "orderId": "<uuid>" }`

### Booking — `/api/bookings`

Installation-service booking lifecycle. All routes require `Authorization: Bearer <token>`.

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| GET    | `/all`   | `MODERATOR`, `OWNER` | Every booking (registered before `/:id` so `"all"` is never parsed as a booking id) |
| GET    | `/`      | `CUSTOMER` | The customer's own bookings |
| GET    | `/:id`   | any  | Booking details. `CUSTOMER`: own only (`404` otherwise) |
| POST   | `/`      | `CUSTOMER` | Create a booking request |
| PATCH  | `/:id/cancel` | `CUSTOMER` | Cancel your own booking, only while `PENDING` |
| PATCH  | `/:id/status` | `MODERATOR` | Change a booking's status (not `OWNER` — see below) |
| PATCH  | `/:id/assign-installer` | `MODERATOR` | Assign an installer to an `APPROVED` booking |

- `POST /` body: `{ "scheduledDate": "<ISO date, must be in the future>", "address": "<10–500 chars>", "notes": "<optional, up to 1000 chars>" }`.
- Status machine: `PENDING → APPROVED → SCHEDULED → COMPLETED`, or `→ CANCELLED` from `PENDING`/`APPROVED`/`SCHEDULED`. `SCHEDULED` is **not** directly reachable via `PATCH /:id/status` — attempting `APPROVED → SCHEDULED` there returns `400` ("Assign an installer to move this booking to SCHEDULED."). It's only reached as a side effect of `PATCH /:id/assign-installer` on an `APPROVED` booking.
- `PATCH /:id/status` and `PATCH /:id/assign-installer` are **`MODERATOR`-only** — `OWNER` gets `403` on both, even though `OWNER` can read every booking via `GET /all`. This matches the same "OWNER has read-only oversight" pattern used in Chat.
- `assign-installer` body: `{ "installerId": "<uuid>" }`. The booking must be `APPROVED` (`400` otherwise); the installer must exist (`404`) and be active (`400`, "Cannot assign an inactive installer.").
- Completing a booking (`PATCH /:id/status` → `COMPLETED`) has a documented side effect: it syncs a `Project` record for that customer (completes their most recent `IN_PROGRESS` project, or creates a new `COMPLETED` one if none exists). There is no direct `Booking`↔`Project` foreign key — this is a best-effort correlation by `customerId` only, so a customer with multiple simultaneous `IN_PROGRESS` projects is an edge case this can't fully disambiguate.
- Triggers `BOOKING`-type notifications on creation, approval, and cancellation.
- Response shape: `{ "booking": { ..., "customer": {...}, "installer": {...} | null } }` / `{ "bookings": [...], "pagination": {...} }`.

**POST `/api/bookings`**
Body: `{ "scheduledDate": "2027-02-01", "address": "123 Rizal Street, Quezon City, Metro Manila, 1100", "notes": "Second floor unit." }`

**PATCH `/api/bookings/:id/assign-installer`**
Body: `{ "installerId": "<uuid>" }`

### Installer — `/api/installers`

The installer roster. Every route requires `Authorization: Bearer <token>` **and** the `MODERATOR` role specifically — not `OWNER` (per this module's explicit "installer management is MODERATOR-only" rule; `OWNER`'s stated capability is to monitor bookings/projects, which doesn't include managing installers).

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/`      | List **active** installers only. `?page=`, `?limit=` |
| GET    | `/:id`   | A single installer by id — **not** filtered by `isActive`, so a deactivated installer is still viewable here even though it's hidden from the list |
| POST   | `/`      | Create an installer |
| PATCH  | `/:id`   | Update an installer's fields |
| PATCH  | `/:id/deactivate` | Set `isActive: false` |

- `POST /` body: `{ "firstName", "lastName", "email"? (unique if provided), "phone" (required), "specialty"? }`.
- `email` is optional but must be unique if supplied (`409` on conflict); installers with no email are allowed (multiple installers can have no email simultaneously — `null` doesn't collide with `@unique`).
- `PATCH /:id` accepts any subset of `firstName`/`lastName`/`phone`/`specialty`/`isActive` (at least one field required). **There is no dedicated "reactivate" endpoint**, but `isActive` is a valid `PATCH /:id` field — setting `{ "isActive": true }` through the generic update endpoint does reactivate a previously deactivated installer.
- `GET /` only ever lists active installers; a deactivated installer disappears from the list but remains reachable directly via `GET /:id`.
- Response shape: `{ "installer": {...} }` / `{ "installers": [...], "pagination": {...} }`.

**POST `/api/installers`**
Body: `{ "firstName": "Juan", "lastName": "Dela Cruz", "phone": "09171234567", "specialty": "Wall panel installation" }`

### Chat — `/api/chat`

Customer-support-style conversations between a `CUSTOMER` and staff. All routes require `Authorization: Bearer <token>`.

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST   | `/`      | `CUSTOMER` | Create a new conversation (creator is added as the first participant) |
| GET    | `/`      | any  | `CUSTOMER`: own conversations only. `MODERATOR`/`OWNER`: every conversation. Supports `?search=`, `?page=`, `?limit=` |
| GET    | `/:id`   | any  | Conversation details + participants. `CUSTOMER`: own only (`404` otherwise) |
| POST   | `/:id/messages` | `CUSTOMER`, `MODERATOR` | Send a message. A `MODERATOR` replying to a room they haven't joined yet is auto-added as a participant |
| GET    | `/:id/messages` | any | Message history. `?sort=desc` (default, newest first) or `?sort=asc`. Viewing marks the other party's unread messages as read |
| PATCH  | `/messages/:id/read` | `CUSTOMER`, `MODERATOR` | Mark a specific message as read (the recipient only — you cannot mark your own sent message as read) |
| DELETE | `/messages/:id` | `CUSTOMER`, `MODERATOR` | Delete your own message (hard delete — `Message` has no soft-delete column) |
| GET    | `/unread/count` | any | Total unread message count across your conversations |

- `OWNER` has read-only access (`GET` routes only) — matches this project's existing `OWNER`-is-read-only-for-support-style-domains policy (see the Booking module). `OWNER` gets `403` on every write route above.
- A `CUSTOMER` can never reach another customer's conversation or messages — every ownership check returns `404`, not `403`, so a stranger's conversation ID can't be distinguished from one that doesn't exist.
- `content` for a message: 1–2000 characters after trimming; empty or whitespace-only is rejected with `400`.

**POST `/api/chat`**
Body: `{ "subject": "Order help" }` (optional)

**POST `/api/chat/:id/messages`**
Body: `{ "content": "Hello, I need help with my order." }`

### Notifications — `/api/notifications`

Every role (`CUSTOMER`, `MODERATOR`, `OWNER`) only ever sees their own notifications — there is no "view all" mode for this module. All routes require `Authorization: Bearer <token>`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET    | `/`      | List your own notifications. Supports `?isRead=true\|false`, `?type=ORDER\|PAYMENT\|BOOKING\|CHAT\|SYSTEM`, `?search=`, `?sort=asc\|desc` (default `desc`), `?page=`, `?limit=` |
| GET    | `/unread/count` | Your unread notification count |
| PATCH  | `/:id/read` | Mark a single notification as read |
| PATCH  | `/read-all` | Mark every one of your unread notifications as read; returns `{ count }` |
| DELETE | `/:id`   | Delete a notification |

- `:id` must be a valid UUID (`400` otherwise). A notification that exists but belongs to someone else returns `404` (not `403`), so notification IDs can't be enumerated.
- Notifications are created automatically as a side effect of other modules' actions — there is no endpoint to create one directly:

  | Trigger | Type | Recipient |
  |---------|------|-----------|
  | Order placed | `ORDER` | The ordering customer |
  | Order status changed (including cancel) | `ORDER` | The order's customer |
  | Payment initiated | `PAYMENT` | The paying customer |
  | Payment successful (`payment.paid` webhook) | `PAYMENT` | The order's customer |
  | Booking created | `BOOKING` | The booking's customer |
  | Booking approved / cancelled | `BOOKING` | The booking's customer |
  | Booking completed → project synced | `SYSTEM` | The project's customer |
  | Chat message sent | `CHAT` | Every other participant in the conversation |

  Two notes on scope: `NotificationType` has no dedicated `PROJECT` value (only `ORDER`/`PAYMENT`/`BOOKING`/`CHAT`/`SYSTEM` exist in the schema), so the booking-completion → project-sync notification uses `SYSTEM`, disambiguated via `metadata: { event: "PROJECT_UPDATED" }`. "Request approved/rejected" from the original feature list has no automatic trigger yet — no `Request` module/service exists in this codebase (only the Prisma `Request` model does), so there is nothing to hook a trigger into; this is a known gap, not an oversight.

### Feedback — `/api/feedback`

Customer reviews of their own completed (`DELIVERED`) orders. All routes require `Authorization: Bearer <token>`.

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST   | `/`      | `CUSTOMER` | Submit feedback for your own `DELIVERED` order. One feedback per customer per order. |
| GET    | `/`      | any  | `CUSTOMER`: own feedback only. `MODERATOR`/`OWNER`: every entry, with search/filter (including by `customerId`). Supports `?rating=1-5`, `?customerId=`, `?orderId=`, `?productId=`, `?dateFrom=YYYY-MM-DD`, `?dateTo=YYYY-MM-DD`, `?search=` (comment text), `?sort=asc\|desc` (default `desc`), `?page=`, `?limit=` |
| GET    | `/:id`   | any  | Single feedback entry. `CUSTOMER`: own only (`404` otherwise). `MODERATOR`/`OWNER`: any. |
| PATCH  | `/:id`   | `CUSTOMER` | Update your own feedback's `rating`/`comment`. |
| DELETE | `/:id`   | `CUSTOMER` | Delete your own feedback. |
| GET    | `/product/:productId` | any | Every feedback entry left on an order that contained this product — see note below. |
| GET    | `/order/:orderId` | any | Feedback for a specific order. `CUSTOMER`: own order only (`404` otherwise). `MODERATOR`/`OWNER`: any order. |

- `rating`: integer 1–5. `comment`: optional, 3–1000 characters after trimming if provided.
- Feedback can only be submitted for an order in `DELIVERED` status (`400` otherwise) that belongs to the requesting customer (`404` on someone else's order, same ID-enumeration-prevention policy as every other module). A second feedback for the same order is rejected with `400`.
- The `Feedback` model has no `productId` column (only `customerId` and an optional `orderId`), so `GET /api/feedback/product/:productId` is implemented as a join through `Order → OrderItem.productId` rather than a schema change — it returns feedback for every order that contained the given product.
- Submitting feedback automatically notifies every active `MODERATOR` and `OWNER` via the existing Notification module (`type: SYSTEM`, since `NotificationType` has no dedicated `FEEDBACK` value — same `metadata.event` disambiguation pattern used for the Project-updated notification above; here `event: "FEEDBACK_SUBMITTED"`).
- "Owner analytics access" is served by the same `GET /api/feedback` endpoint (unrestricted for `OWNER`) rather than a separate analytics endpoint — no aggregate-stats route was in this module's endpoint list.

**POST `/api/feedback`**
Body: `{ "orderId": "<uuid>", "rating": 5, "comment": "Excellent installation work." }`

### Projects — `/api/projects`

Interior design projects: created by `OWNER`, assigned to a `MODERATOR`, monitored by their `CUSTOMER`. All routes require `Authorization: Bearer <token>`.

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST   | `/`      | `OWNER` | Create a project for a customer. Creator becomes the project's `owner`. Optionally assigns a `moderatorId` at creation. |
| GET    | `/`      | any  | `OWNER`: every project. `MODERATOR`: assigned projects only. `CUSTOMER`: own projects only. Supports `?status=`, `?customerId=`, `?moderatorId=`, `?ownerId=`, `?dateFrom=YYYY-MM-DD`, `?dateTo=YYYY-MM-DD` (filters `createdAt`), `?search=` (project name), `?sortBy=name\|createdAt\|startDate\|endDate` (default `createdAt`), `?sortOrder=asc\|desc` (default `desc`), `?page=`, `?limit=` |
| GET    | `/:id`   | any  | Single project. `OWNER`: any. `MODERATOR`: only if assigned (`404` otherwise). `CUSTOMER`: only their own (`404` otherwise). |
| PATCH  | `/:id`   | `OWNER`, `MODERATOR` | `OWNER`: update `name`/`description`/`budget`/`startDate`/`endDate`/`notes`. `MODERATOR` (assigned project only): `startDate`/`endDate`/`notes` only — `name`/`description`/`budget` return `403`. `CUSTOMER` cannot call this route at all (`403`). |
| PATCH  | `/:id/status` | `OWNER`, `MODERATOR` | Change project status along the allowed workflow (see below). `MODERATOR` limited to their assigned project. |
| PATCH  | `/:id/assign` | `OWNER` | Reassign any combination of `customerId`/`moderatorId`/`ownerId` in one call. |
| DELETE | `/:id`   | `OWNER` | Delete a project (hard delete — no soft-delete column, and nothing else references a project via foreign key). |

**Status workflow** (`ProjectStatus`): `PENDING → IN_PROGRESS → COMPLETED`, with `CANCELLED` reachable from `PENDING` or `IN_PROGRESS`. `COMPLETED` and `CANCELLED` are both terminal — `COMPLETED → PENDING`, `COMPLETED → IN_PROGRESS`, and `CANCELLED → IN_PROGRESS` all return `400`.

**Assignment rules** (enforced on both `POST /` and `PATCH /:id/assign`):
- `customerId`: must exist and have the `CUSTOMER` role.
- `moderatorId`: must exist, have the `MODERATOR` role, and be `isActive`.
- `ownerId`: must exist and have the `OWNER` role.
- Any violation returns `404` (user doesn't exist) or `400` (wrong role / inactive moderator).

- `name`: 3–150 characters. `description`/`notes`: optional, up to 2000 characters each. `budget`: optional, must be greater than 0. `endDate` cannot be before `startDate` (checked against the incoming value merged with whatever's already stored, so a `PATCH` that only sets `endDate` is still checked against the existing `startDate`).
- `description` (`OWNER`-owned project overview) and `notes` (`MODERATOR`-writable running work log) are two separate columns specifically so neither role's edits can overwrite the other's — see `prisma/migrations/20260801183803_add_project_notes/`.
- Submitting a project automatically notifies the customer (`Project created`). Assigning a moderator (at creation or via `/assign`) notifies that moderator (`Moderator assigned`); assigning a different owner via `/assign` notifies that owner (`Owner assigned`). Every status transition notifies the customer (`Project started` / `Project completed` / `Project cancelled`). All via the existing Notification module, `type: SYSTEM` (no dedicated `PROJECT` value exists — see the Notifications section above), `metadata: { projectId, event, status? }`.
- Note: `booking.service.ts`'s existing booking-completion → project-sync logic (documented in the Booking section, unchanged by this module) writes `Project` rows through its own code path, independent of this module's `POST /api/projects` — both simply operate on the same `Project` table, consistent with this codebase's "services reach across model boundaries directly via Prisma" pattern.

**POST `/api/projects`**
Body:
```json
{
  "customerId": "<uuid>",
  "moderatorId": "<uuid>",
  "name": "Living Room Renovation",
  "description": "Full panel installation for the living room.",
  "budget": 50000,
  "startDate": "2027-01-15",
  "endDate": "2027-02-28"
}
```
Response (`201`):
```json
{
  "success": true,
  "message": "Project created successfully.",
  "data": {
    "project": {
      "id": "...",
      "customerId": "...",
      "ownerId": "...",
      "moderatorId": "...",
      "name": "Living Room Renovation",
      "description": "Full panel installation for the living room.",
      "notes": null,
      "status": "PENDING",
      "budget": "50000",
      "startDate": "2027-01-15T00:00:00.000Z",
      "endDate": "2027-02-28T00:00:00.000Z",
      "createdAt": "...",
      "updatedAt": "...",
      "customer": { "id": "...", "firstName": "...", "lastName": "...", "email": "...", "phone": null },
      "owner": { "id": "...", "firstName": "...", "lastName": "...", "email": "..." },
      "moderator": { "id": "...", "firstName": "...", "lastName": "...", "email": "..." }
    }
  }
}
```

**PATCH `/api/projects/:id/status`**
Body: `{ "status": "IN_PROGRESS" }`

**PATCH `/api/projects/:id/assign`**
Body: `{ "moderatorId": "<uuid>" }` (any subset of `customerId`/`moderatorId`/`ownerId`)

### Request Approval — `/api/requests`

Internal approval workflow: a `MODERATOR` submits a request (inventory restock, refund, discount approval, project budget change, or other), and an `OWNER` reviews it. All routes require `Authorization: Bearer <token>`.

**Role permissions**

| Role | Can | Cannot |
|------|-----|--------|
| `CUSTOMER` | Nothing | Every endpoint in this module returns `403` — customers never have any access here. |
| `MODERATOR` | Create requests; view/edit/cancel **their own** requests (edit and cancel only while `PENDING`); delete their own `PENDING`/`CANCELLED` requests | Approve, reject, view or act on another moderator's request, delete a request that's already been reviewed (`APPROVED`/`REJECTED`) |
| `OWNER` | View every request (with full filtering); approve; reject; delete any request regardless of status | Create a request (submission is `MODERATOR`-only) |

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST   | `/`      | `MODERATOR` | Submit a request. Always starts `PENDING`. |
| GET    | `/`      | `OWNER`, `MODERATOR` | `OWNER`: every request. `MODERATOR`: own requests only. Supports `?status=`, `?type=`, `?requestedById=`, `?reviewedById=`, `?dateFrom=YYYY-MM-DD`, `?dateTo=YYYY-MM-DD` (filters `createdAt`), `?search=` (title), `?sortBy=title\|createdAt\|reviewedAt` (default `createdAt`), `?sortOrder=asc\|desc` (default `desc`), `?page=`, `?limit=` |
| GET    | `/:id`   | `OWNER`, `MODERATOR` | Single request. `MODERATOR`: own only (`404` otherwise). `OWNER`: any. |
| PATCH  | `/:id`   | `MODERATOR` | Edit `type`/`title`/`description` on your own request — only while it's still `PENDING` (`409` once reviewed or cancelled). |
| PATCH  | `/:id/approve` | `OWNER` | Approve a `PENDING` request. Optional `reviewNote`. |
| PATCH  | `/:id/reject`  | `OWNER` | Reject a `PENDING` request. Optional `reviewNote`. |
| PATCH  | `/:id/cancel`  | `MODERATOR` | Withdraw your own `PENDING` request. Never touches `reviewedById`/`reviewedAt` — a cancelled request was never reviewed by an `OWNER`. |
| DELETE | `/:id`   | `OWNER`, `MODERATOR` | `OWNER`: any request, any status. `MODERATOR`: own request, only if `PENDING` or `CANCELLED` (`409` if `APPROVED`/`REJECTED` — reviewed requests are a preserved audit trail). |

**Status workflow** (`RequestStatus`): `PENDING → APPROVED`, `PENDING → REJECTED`, or `PENDING → CANCELLED`. `APPROVED`, `REJECTED`, and `CANCELLED` are all terminal — approving/rejecting/cancelling a request that isn't `PENDING` returns `409` (a conflict with the resource's current state, not a validation error, hence `409` rather than `400`) — this covers double-approval, double-rejection, and cancelling an already-approved/rejected/cancelled request.

- `title`: 3–150 characters. `description`: optional, up to 2000 characters. `reviewNote` (on approve/reject): optional, 3–1000 characters if provided.
- `type` supports every `RequestType` value: `INVENTORY_RESTOCK`, `REFUND`, `DISCOUNT_APPROVAL`, `PROJECT_BUDGET_CHANGE`, `OTHER`.
- `RequestStatus` did not previously have a `CANCELLED` value (only `PENDING`/`APPROVED`/`REJECTED`) — added via `prisma/migrations/20260801191503_add_request_cancelled_status/` specifically so an `OWNER`'s `REJECTED` decision and a `MODERATOR`'s own withdrawal stay distinguishable in the data, rather than conflating two different real-world events under one status.
- Submitting a request notifies every active `OWNER` (`New request submitted`). Approving/rejecting notifies the requesting `MODERATOR`. Cancelling notifies every active `OWNER` again. All via the existing Notification module, `type: SYSTEM` (no dedicated `REQUEST` value exists), `metadata: { requestId, event, status, requestType }`.

**POST `/api/requests`**
Body:
```json
{ "type": "INVENTORY_RESTOCK", "title": "Restock cladding panels", "description": "Down to 3 units in the Quezon City warehouse." }
```
Response (`201`):
```json
{
  "success": true,
  "message": "Request submitted successfully.",
  "data": {
    "request": {
      "id": "...",
      "requestedById": "...",
      "reviewedById": null,
      "type": "INVENTORY_RESTOCK",
      "status": "PENDING",
      "title": "Restock cladding panels",
      "description": "Down to 3 units in the Quezon City warehouse.",
      "reviewNote": null,
      "reviewedAt": null,
      "createdAt": "...",
      "updatedAt": "...",
      "requestedBy": { "id": "...", "firstName": "...", "lastName": "...", "email": "...", "role": "MODERATOR" },
      "reviewedBy": null
    }
  }
}
```

**PATCH `/api/requests/:id/approve`**
Body: `{ "reviewNote": "Approved - budget confirmed." }`
Response (`200`): same shape as above, with `status: "APPROVED"`, `reviewedById` set to the approving owner, `reviewedAt` timestamped.

**PATCH `/api/requests/:id/cancel`**
No body required. Response has `status: "CANCELLED"`, `reviewedById`/`reviewedAt` still `null`.

**Example conflict response (`409`) — approving twice**
```json
{ "success": false, "message": "Cannot approve a request that is already approved." }
```

### Analytics Dashboard — `/api/analytics`

Read-only reporting over existing data - no new tables, purely Prisma aggregation (`count`/`groupBy`/`aggregate`, plus a handful of in-app-code aggregations where Prisma can't express the query - see notes below). All routes require `Authorization: Bearer <token>`.

**Role permissions**

| Role | Access |
|------|--------|
| `CUSTOMER` | None - every endpoint returns `403`. |
| `MODERATOR` | "Operational statistics only" - every endpoint below, but financial fields (`totalRevenue`, `averageOrderValue`, `revenue`, `revenueByStatus`, `totalInventoryValue`, `topCustomers`, `totalBudget`, `averageBudget`) are **omitted entirely** from the response (not zeroed - a MODERATOR response is never mistaken for "$0"). |
| `OWNER` | Full access - every field, on every endpoint. |

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/dashboard` | Live snapshot: customer/product/order/booking/project counts and status breakdowns, low-stock count, pending request count, average feedback rating. OWNER also gets `totalRevenue`/`averageOrderValue`. No date filter - always "right now." |
| GET | `/sales` | Order counts by status (`?dateFrom=`/`?dateTo=`, filters `createdAt`). OWNER also gets `totalRevenue`/`averageOrderValue` (from PAID payments, filtered by `paidAt`) and `revenueByStatus` (order value by status). |
| GET | `/products` | Paginated top-selling products by units sold (`?dateFrom=`/`?dateTo=` filters which orders count, `?page=`/`?limit=`), plus `totalActiveProducts`/`lowStockCount`. OWNER also gets `revenue` per product and `totalInventoryValue`. |
| GET | `/customers` | `totalCustomers`/`activeCustomers`/`repeatCustomers` (customers with >1 order), `newCustomers` (signups in `?dateFrom=`/`?dateTo=`). OWNER also gets a paginated `topCustomers` list ranked by lifetime PAID spend (not date-filtered - a lifetime ranking, deliberately different scope from `newCustomers`). |
| GET | `/projects` | Status breakdown, `unassignedProjects`, `averageDurationDays` (from COMPLETED projects with both dates set), and a paginated `moderatorWorkload` list (current `IN_PROGRESS` counts per moderator - never date-filtered, since workload is a present-state staffing question). `?dateFrom=`/`?dateTo=` filters everything else by `createdAt`. OWNER also gets `totalBudget`/`averageBudget`. |

Notes on how a few numbers are actually computed:
- **Low stock** (`lowStockCount` on `/dashboard` and `/products`) is computed in application code, not a Prisma `where` clause - Prisma can't compare two columns of the same row (`quantity <= reorderLevel`) without a raw query, the same limitation already documented on `inventory.service.ts`'s `getLowStockReport()`.
- **`topCustomers`' spend** is summed in application code from every PAID `Payment`, because `Payment` has no `customerId` column (it lives on the related `Order`) - Prisma's `groupBy` can only group by a model's own scalar fields, not a related model's.
- All money figures in analytics responses are plain JSON numbers (not Decimal strings like `Order.totalAmount` elsewhere in this API) - they're computed/derived reporting values, not raw model fields.

**GET `/api/analytics/dashboard`** (OWNER)
Response:
```json
{
  "success": true,
  "message": "Dashboard analytics retrieved successfully.",
  "data": {
    "totalCustomers": 42,
    "totalActiveProducts": 18,
    "lowStockCount": 2,
    "totalOrders": 130,
    "ordersByStatus": [{ "status": "DELIVERED", "count": 90 }, { "status": "PENDING", "count": 10 }],
    "totalBookings": 25,
    "bookingsByStatus": [{ "status": "COMPLETED", "count": 20 }],
    "totalProjects": 12,
    "projectsByStatus": [{ "status": "IN_PROGRESS", "count": 5 }],
    "pendingRequests": 3,
    "averageFeedbackRating": 4.6,
    "totalRevenue": 458200,
    "averageOrderValue": 3527.69
  }
}
```

**GET `/api/analytics/sales?dateFrom=2027-01-01&dateTo=2027-01-31`** (MODERATOR - note the missing financial fields)
```json
{
  "success": true,
  "message": "Sales analytics retrieved successfully.",
  "data": {
    "totalOrders": 40,
    "ordersByStatus": [{ "status": "DELIVERED", "count": 30 }, { "status": "PROCESSING", "count": 10 }]
  }
}
```

### Reports — `/api/reports`

Detailed, paginated, exportable record listings - complementary to the Analytics module above rather than a duplicate of it: Analytics answers "what are the KPIs right now," Reports answers "show me the actual rows behind that number." Every report returns `{ summary, <rows>, pagination }`. Same permission model as Analytics: `CUSTOMER` gets `403` everywhere; `OWNER` gets every field; `MODERATOR` gets the same reports with financial fields omitted entirely (not zeroed).

| Method | Endpoint | Rows | Notes |
|--------|----------|------|-------|
| GET | `/sales` | Orders (`?dateFrom=`/`?dateTo=`, `?page=`/`?limit=`) | Financial view - OWNER-only `summary.totalRevenue`/`averageOrderValue` (from PAID payments) and per-row `totalAmount`. |
| GET | `/inventory` | Every inventory record (`?dateFrom=`/`?dateTo=` filters `lastRestockedAt`, `?page=`/`?limit=`) | OWNER-only per-row `unitPrice` and `summary.totalInventoryValue`. |
| GET | `/orders` | Orders (`?status=`, `?dateFrom=`/`?dateTo=`, `?page=`/`?limit=`) | Operational fulfillment-pipeline view - `summary` is status counts only, no revenue figure at all (that's what `/sales` is for). Per-row `totalAmount` still OWNER-only. |
| GET | `/bookings` | Bookings (`?status=`, `?dateFrom=`/`?dateTo=`, `?page=`/`?limit=`) | Booking has no financial columns at all, so this report is byte-for-byte identical for OWNER and MODERATOR. |
| GET | `/projects` | Projects (`?status=`, `?dateFrom=`/`?dateTo=`, `?page=`/`?limit=`) | OWNER-only per-row `budget` and `summary.totalBudget`/`averageBudget`. |

**GET `/api/reports/sales`** (OWNER)
Response:
```json
{
  "success": true,
  "message": "Sales report retrieved successfully.",
  "data": {
    "summary": {
      "totalOrders": 3,
      "ordersByStatus": [{ "status": "DELIVERED", "count": 1 }, { "status": "PENDING", "count": 1 }, { "status": "PROCESSING", "count": 1 }],
      "totalRevenue": 300,
      "averageOrderValue": 150
    },
    "orders": [
      { "id": "...", "orderNumber": "PS-...", "customerId": "...", "customerName": "Juan Dela Cruz", "status": "DELIVERED", "itemCount": 1, "createdAt": "...", "totalAmount": 200 }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 3, "totalPages": 1 }
  }
}
```

**GET `/api/reports/inventory`** (MODERATOR - note `unitPrice` and `totalInventoryValue` are both absent)
```json
{
  "success": true,
  "message": "Inventory report retrieved successfully.",
  "data": {
    "summary": { "totalItems": 2, "lowStockCount": 1 },
    "inventory": [
      { "productId": "...", "productName": "Product B", "sku": "...", "quantity": 5, "reservedQty": 0, "available": 5, "reorderLevel": 10, "isLowStock": true, "lastRestockedAt": null }
    ],
    "pagination": { "page": 1, "limit": 20, "total": 2, "totalPages": 1 }
  }
}
```

### AR Support — `/api/ar`

**Not an AR rendering engine.** The Expo React Native app owns the camera and ARCore/ARKit scanning entirely; this module only stores the resulting width/height/depth measurements and turns them into a panel-count + cost estimate. All routes require `Authorization: Bearer <token>`.

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST   | `/measurements` | `CUSTOMER` | Save an AR scan result (`width`/`height` required, `depth` optional). |
| GET    | `/measurements` | any  | `CUSTOMER`: own measurements only. `MODERATOR`/`OWNER`: every measurement (`?customerId=` to narrow). Supports `?search=` (label), `?dateFrom=`/`?dateTo=` (YYYY-MM-DD), `?page=`/`?limit=`. |
| GET    | `/measurements/:id` | any | Single measurement. `CUSTOMER`: own only (`404` otherwise). `MODERATOR`/`OWNER`: any. |
| PATCH  | `/measurements/:id` | `CUSTOMER` | Update your own measurement. |
| DELETE | `/measurements/:id` | `CUSTOMER` | Delete your own measurement. |
| POST   | `/estimate` | any | Panel count + cost estimate (see below) - a pure calculation, writes nothing to the database. |

- `width`/`height`/`depth`: positive numbers, capped at 1000 to reject obviously-garbage input (`400` on zero, negative, or over the cap). `unit` defaults to `"m"`.
- Reuses the existing `Measurement` and `Product` Prisma models exactly as they already were (`Product.width`/`height`/`price` were already there specifically for this feature, per the schema's own comment) - **no schema changes were needed for this module.**

**POST `/api/ar/estimate`**
Body — either a saved measurement:
```json
{ "productId": "<uuid>", "measurementId": "<uuid>" }
```
or raw dimensions from the app's current AR session, with nothing saved:
```json
{ "productId": "<uuid>", "width": 4, "height": 3 }
```
Calculation: `wallArea = width × height`, `panelArea = product.width × product.height`, `requiredPanels = ceil(wallArea / panelArea)`, `estimatedCost = requiredPanels × product.price`. Returns `404` if the product has no `width`/`height` configured (nothing to estimate against) or the referenced product/measurement doesn't exist; a `CUSTOMER` referencing another customer's `measurementId` gets `404` (not `403`), same ID-enumeration-prevention policy as every other module.

Response:
```json
{
  "success": true,
  "message": "Panel estimate calculated successfully.",
  "data": {
    "measurementId": "...",
    "productId": "...",
    "productName": "Cladding Panel A",
    "width": 4,
    "height": 3,
    "wallArea": 12,
    "panelArea": 2,
    "requiredPanels": 6,
    "unitPrice": 150,
    "estimatedCost": 900
  }
}
```

### Delivery — `/api/delivery`

Shipment tracking for an order once it's on its way. 1:1 with `Order` (`Delivery.orderId` is unique). All routes require `Authorization: Bearer <token>`.

**Role permissions**

| Role | Can | Cannot |
|------|-----|--------|
| `CUSTOMER` | View deliveries for their own orders (status, tracking info) | Create, update, delete, mark delivered |
| `MODERATOR` | Full delivery management — create, update courier/tracking/address/schedule, mark delivered, view every delivery, delete (only while not yet delivered) | — |
| `OWNER` | View every delivery (read-only — same philosophy as Booking/Chat) | Create, update, delete, mark delivered |

| Method | Endpoint | Role | Description |
|--------|----------|------|-------------|
| POST   | `/`      | `MODERATOR` | Create a delivery for an order. `scheduledDate` required and must be in the future. |
| GET    | `/`      | any  | `CUSTOMER`: deliveries for their own orders only. `MODERATOR`/`OWNER`: every delivery. Supports `?status=scheduled\|delivered`, `?search=` (tracking number / courier / address), `?sortBy=scheduledDate\|createdAt` (default `createdAt`), `?sortOrder=asc\|desc` (default `desc`), `?page=`/`?limit=`. |
| GET    | `/:id`   | any  | Single delivery. `CUSTOMER`: own order only (`404` otherwise). `MODERATOR`/`OWNER`: any. |
| PATCH  | `/:id`   | `MODERATOR` | Update `courierName`/`trackingNumber`/`address`/`scheduledDate`. `orderId` can never be changed (not accepted by this endpoint at all). |
| PATCH  | `/:id/delivered` | `MODERATOR` | Sets `deliveredAt` to now. `409` if already delivered. |
| DELETE | `/:id`   | `MODERATOR` | Delete a delivery — only while `deliveredAt` is still `null` (`409` once delivered; a delivered record is a completed shipment, not erasable). |

- Creating a delivery requires the order to exist (`404` otherwise), not already have a delivery (`409` — one delivery per order), and not be `CANCELLED` (`409`). Both are state-conflict errors, not validation errors, hence `409` rather than `400` — the same 400-vs-409 split already established by the Request Approval module.
- `address`: 10–500 characters. `courierName`/`trackingNumber`: 2–150 / 2–100 characters if provided. `scheduledDate` on create must be a future date; on update it just needs to be a valid date (no future-only constraint on reschedules).
- Submitting a delivery, updating its tracking number, (re)scheduling it, and marking it delivered all notify the order's customer via the existing Notification module (`type: SYSTEM`, `metadata: { deliveryId, orderId, event }`). A single `PATCH` that includes both `trackingNumber` and `scheduledDate` fires both notifications.
- Marking a delivery delivered only sets `Delivery.deliveredAt` — it deliberately does **not** also flip `Order.status` to `DELIVERED`, since that wasn't part of this module's spec and doing so would mean reaching into Order's own status-transition logic from outside it.

**POST `/api/delivery`**
Body:
```json
{ "orderId": "<uuid>", "address": "123 Rizal Street, Quezon City, Metro Manila, 1100", "scheduledDate": "2027-02-01", "courierName": "LBC Express", "trackingNumber": "TRK-001" }
```

**PATCH `/api/delivery/:id/delivered`**
No body required. Response has `deliveredAt` set to the current timestamp.

### Rate Limiting

Applies across the whole API, not to one module — brute-force and general abuse protection via [`express-rate-limit`](https://www.npmjs.com/package/express-rate-limit), implemented in `src/middleware/rateLimit.middleware.ts`.

| Scope | Window | Limit | Applies to |
|-------|--------|-------|------------|
| Authentication | 15 minutes | 5 requests per IP | `POST /api/auth/register` + `POST /api/auth/login` + `POST /api/auth/refresh` **combined** (one shared counter). Reuse `authRateLimiter` on Forgot Password routes too, when that's built. |
| General API | 15 minutes | 100 requests per IP | Every route under `/api/*`. |
| `/health` | — | Unlimited | Not under `/api`, so it's never touched by either limiter. |

- Exceeding a limit returns `429` through the same global error handler as every other error in this API — `{ "success": false, "message": "Too many requests. Please try again later." }` (or the auth-specific message), no `errors` array.
- Responses carry modern `RateLimit-Limit` / `RateLimit-Remaining` / `RateLimit-Reset` headers (plus `Retry-After` on a `429`). Legacy `X-RateLimit-*` headers are disabled — nothing extra for a client to fingerprint.
- Both limiters are configurable via env vars (see below) and default to the numbers in the table above if unset.
- **Automated tests**: both limiters skip enforcement whenever `NODE_ENV=test`, since the 500+ integration tests share one Express app instance and one IP across a single run — enforcing the real limits there would throttle unrelated tests with unrelated `429`s. The real configured behavior (5/window, 100/window, headers, reset) is verified directly in `tests/rateLimit/rateLimit.test.ts` using isolated middleware instances that don't skip.

### Refresh Token Authentication

Short-lived JWT access tokens (`JWT_EXPIRES_IN`) paired with longer-lived, rotating refresh tokens, so a client can silently obtain a new access token without forcing the user to log in again — and a compromised access token stops working quickly on its own.

- **Access token**: unchanged JWT mechanism (`src/utils/jwt.ts`), still returned by both `/register` and `/login` as `data.token`.
- **Refresh token**: a cryptographically random 40-byte value (`src/utils/refreshToken.ts`, `crypto.randomBytes`) — opaque to the client, never a JWT. Only its SHA-256 hash is stored (`RefreshToken.tokenHash`, `@unique`) — the plaintext is returned exactly once, at issuance, and never persisted anywhere. SHA-256 (not bcrypt) is deliberate: the token is already high-entropy random data, not a human-chosen secret, and the lookup (`findUnique({ where: { tokenHash } })`) needs a deterministic digest — bcrypt's per-call random salt would make that impossible.
- **Rotation**: every successful `POST /api/auth/refresh` revokes the presented token and issues a brand-new one in the same database transaction. A refresh token can be redeemed exactly once — replaying an already-used (or already-revoked) token returns `401`.
- **Logout**: `POST /api/auth/logout` revokes only the one refresh token supplied in the body. Logging out on one device never touches another device's session — each login issues its own independent refresh token row.
- Expiration defaults to 7 days (`REFRESH_TOKEN_EXPIRES_IN_DAYS`, see below), checked against `RefreshToken.expiresAt` on every refresh.

---

## 4. Environment Variables

Copy `.env.example` to `.env` and fill in real values:

```bash
cp .env.example .env
```

| Variable         | Description                                              | Default (dev) |
|------------------|-----------------------------------------------------------|----------------|
| `NODE_ENV`       | `development` \| `production` \| `test`                   | `development`  |
| `PORT`           | HTTP port                                                  | `4000`         |
| `DATABASE_URL`   | CockroachDB connection string                              | —              |
| `JWT_SECRET`     | Secret used to sign JWTs (min 32 chars)                    | —              |
| `JWT_EXPIRES_IN` | Access token (JWT) lifetime (e.g. `7d`, `1h`, `15m`)        | `7d`           |
| `REFRESH_TOKEN_EXPIRES_IN_DAYS` | Refresh token lifetime, in days               | `7`            |
| `CORS_ORIGIN`    | Allowed origin for the frontend                             | `*`            |
| `RATE_LIMIT_AUTH_WINDOW_MS` | Auth rate-limit window (ms)                       | `900000` (15 min) |
| `RATE_LIMIT_AUTH_MAX`       | Max register+login requests per IP per window     | `5`            |
| `RATE_LIMIT_API_WINDOW_MS`  | General API rate-limit window (ms)                | `900000` (15 min) |
| `RATE_LIMIT_API_MAX`        | Max `/api/*` requests per IP per window            | `100`          |

`src/config/env.ts` validates all of these at startup with Zod — the process exits immediately
with a clear error message if anything required is missing or malformed.

---

## 5. Install & Run

### Prerequisites
- Node.js 20+
- A running CockroachDB instance — either:
  - **Local (single node, insecure — quickest for dev):**
    ```bash
    cockroach demo --no-example-database
    # or
    cockroach start-single-node --insecure --listen-addr=localhost:26257
    ```
  - **CockroachDB Cloud** (recommended for anything beyond local dev): create a free cluster at
    cockroachlabs.cloud and use the connection string it gives you.

> **Note on `bcrypt` (native module):** it compiles from source on `npm install`. On Windows this
> requires the Visual Studio Build Tools (`npm install --global windows-build-tools` or the
> "Desktop development with C++" workload). If you'd rather avoid native builds, swap `bcrypt` for
> `bcryptjs` (drop-in API) in `src/utils/password.ts` and `package.json`.

### Commands

```bash
cd backend

# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# edit .env with your DATABASE_URL and a strong JWT_SECRET

# 3. Generate the Prisma client
npm run prisma:generate

# 4. Run database migrations (creates the `users` table)
npm run prisma:migrate
# you'll be prompted for a migration name, e.g. "init"

# 5. Start the dev server (auto-restarts on file changes)
npm run dev
# → 🚀 PanelScan API running on port 4000 in development mode

# Production build
npm run build
npm start
```

### All available scripts

| Script                        | Purpose                                              |
|-------------------------------|-------------------------------------------------------|
| `npm run dev`                 | Start the API with hot-reload via `tsx watch`         |
| `npm run build`                | Compile TypeScript to `dist/`                        |
| `npm start`                   | Run the compiled JS (`dist/server.js`)                 |
| `npm run typecheck`           | Type-check without emitting output                    |
| `npm run prisma:generate`     | Regenerate the Prisma client                           |
| `npm run prisma:migrate`      | Create + apply a new migration (dev)                   |
| `npm run prisma:migrate:deploy` | Apply pending migrations (production/CI)              |
| `npm run prisma:studio`       | Open Prisma Studio (visual DB browser)                 |
| `npm run prisma:reset`        | Drop the DB, reapply all migrations (dev only)          |

---

## 6. Database Migrations

Prisma migration workflow against CockroachDB:

```bash
# Create a new migration after editing prisma/schema.prisma
npx prisma migrate dev --name <migration_name>

# Example: after adding the User model for the first time
npx prisma migrate dev --name init

# Inspect the database visually
npx prisma studio

# Apply already-generated migrations in CI/production (no prompts, no schema drift checks)
npx prisma migrate deploy

# Regenerate the Prisma Client after any schema change (also runs automatically on `migrate dev`)
npx prisma generate
```

Migrations are written to `prisma/migrations/` and should be committed to version control.

---

## 7. Postman / API Testing Examples

Import these as raw requests, or recreate them in Postman. Base URL assumes `PORT=4000`.

### Health check
```
GET http://localhost:4000/health
```

### Register
```
POST http://localhost:4000/api/auth/register
Content-Type: application/json

{
  "firstName": "Juan",
  "lastName": "Dela Cruz",
  "email": "juan@example.com",
  "password": "Passw0rd123",
  "phone": "+63 912 345 6789"
}
```
Expected `201`:
```json
{
  "success": true,
  "message": "User registered successfully.",
  "data": {
    "user": { "id": "…", "firstName": "Juan", "...": "...", "role": "CUSTOMER" },
    "token": "eyJhbGciOi..."
  }
}
```

### Login
```
POST http://localhost:4000/api/auth/login
Content-Type: application/json

{
  "email": "juan@example.com",
  "password": "Passw0rd123"
}
```
Expected `200` with `data.token` and `data.refreshToken`. Save both as Postman **collection
variables** (`{{token}}`, `{{refreshToken}}`) using the Postman **Tests** tab:
```js
const body = pm.response.json();
pm.collectionVariables.set('token', body.data.token);
pm.collectionVariables.set('refreshToken', body.data.refreshToken);
```

### Get current user
```
GET http://localhost:4000/api/auth/me
Authorization: Bearer {{token}}
```

### Refresh the access token
```
POST http://localhost:4000/api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "{{refreshToken}}"
}
```
Expected `200`, with both `data.token` and `data.refreshToken` replaced by new values (rotation) —
update the saved `{{refreshToken}}` collection variable to the new one, since the old one is now
revoked and cannot be reused.

### Logout (revoke a refresh token)
```
POST http://localhost:4000/api/auth/logout
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "refreshToken": "{{refreshToken}}"
}
```
Expected `200`. A subsequent `/api/auth/refresh` with the same `refreshToken` now returns `401`.

### List users (requires an OWNER account)
```
GET http://localhost:4000/api/users
Authorization: Bearer {{token}}
```
> To test this, seed or promote a user to `OWNER` directly via Prisma Studio
> (`npm run prisma:studio`) since public registration always creates `CUSTOMER` accounts.

### Get a single user
```
GET http://localhost:4000/api/users/<uuid>
Authorization: Bearer {{token}}
```

### Update a user
```
PATCH http://localhost:4000/api/users/<uuid>
Authorization: Bearer {{token}}
Content-Type: application/json

{
  "firstName": "Juanito",
  "phone": "+63 917 000 1111"
}
```

### Deactivate a user (OWNER only)
```
DELETE http://localhost:4000/api/users/<uuid>
Authorization: Bearer {{token}}
```

### Chat: create a conversation (CUSTOMER)
```
POST http://localhost:4000/api/chat
Authorization: Bearer {{token}}
Content-Type: application/json

{ "subject": "Order help" }
```
Save the returned id as a collection variable (`pm.collectionVariables.set('chatId', pm.response.json().data.conversation.id)`).

### Chat: send a message
```
POST http://localhost:4000/api/chat/{{chatId}}/messages
Authorization: Bearer {{token}}
Content-Type: application/json

{ "content": "Hello, I need help with my order." }
```

### Chat: list conversations (search + pagination)
```
GET http://localhost:4000/api/chat?search=order&page=1&limit=10
Authorization: Bearer {{token}}
```
Each entry includes `latestMessage` and `unreadCount` for a conversation-list UI.

### Chat: view messages (newest first by default)
```
GET http://localhost:4000/api/chat/{{chatId}}/messages?sort=desc
Authorization: Bearer {{token}}
```
> Viewing marks the other party's unread messages as read — call this as
> the *other* party (e.g. a moderator token) to see `isRead` flip to `true`.

### Chat: mark a message read / delete your own message
```
PATCH http://localhost:4000/api/chat/messages/<messageId>/read
Authorization: Bearer {{token}}

DELETE http://localhost:4000/api/chat/messages/<messageId>
Authorization: Bearer {{token}}
```

### Chat: unread count
```
GET http://localhost:4000/api/chat/unread/count
Authorization: Bearer {{token}}
```

### Notifications: list (filter + search + pagination)
```
GET http://localhost:4000/api/notifications?isRead=false&type=ORDER&search=order&page=1&limit=10
Authorization: Bearer {{token}}
```

### Notifications: unread count
```
GET http://localhost:4000/api/notifications/unread/count
Authorization: Bearer {{token}}
```

### Notifications: mark one read / mark all read / delete
```
PATCH http://localhost:4000/api/notifications/<notificationId>/read
Authorization: Bearer {{token}}

PATCH http://localhost:4000/api/notifications/read-all
Authorization: Bearer {{token}}

DELETE http://localhost:4000/api/notifications/<notificationId>
Authorization: Bearer {{token}}
```
> Notifications aren't created directly — place an order, pay for it, create/approve/cancel a booking, or send a chat message as the other party, then list notifications for the recipient to see them appear.

### Feedback: submit feedback for a completed order (CUSTOMER)
```
POST http://localhost:4000/api/feedback
Authorization: Bearer {{token}}
Content-Type: application/json

{ "orderId": "<uuid of a DELIVERED order you own>", "rating": 5, "comment": "Excellent installation work." }
```

### Feedback: list (filter + search + pagination)
```
GET http://localhost:4000/api/feedback?rating=5&search=excellent&page=1&limit=10
Authorization: Bearer {{token}}
```

### Feedback: update / delete your own feedback
```
PATCH http://localhost:4000/api/feedback/<feedbackId>
Authorization: Bearer {{token}}
Content-Type: application/json

{ "rating": 4, "comment": "Updating my review after a follow-up visit." }

DELETE http://localhost:4000/api/feedback/<feedbackId>
Authorization: Bearer {{token}}
```

### Feedback: product reviews / order feedback
```
GET http://localhost:4000/api/feedback/product/<productId>
Authorization: Bearer {{token}}

GET http://localhost:4000/api/feedback/order/<orderId>
Authorization: Bearer {{token}}
```

### Projects: create a project (OWNER)
```
POST http://localhost:4000/api/projects
Authorization: Bearer {{ownerToken}}
Content-Type: application/json

{
  "customerId": "<uuid of a CUSTOMER>",
  "moderatorId": "<uuid of an active MODERATOR>",
  "name": "Living Room Renovation",
  "description": "Full panel installation for the living room.",
  "budget": 50000,
  "startDate": "2027-01-15",
  "endDate": "2027-02-28"
}
```
Response:
```json
{
  "success": true,
  "message": "Project created successfully.",
  "data": { "project": { "id": "...", "status": "PENDING", "name": "Living Room Renovation", "...": "..." } }
}
```

### Projects: list (filter + search + pagination + sorting)
```
GET http://localhost:4000/api/projects?status=IN_PROGRESS&search=renovation&sortBy=startDate&sortOrder=asc&page=1&limit=10
Authorization: Bearer {{token}}
```

### Projects: update your assigned project's schedule/notes (MODERATOR)
```
PATCH http://localhost:4000/api/projects/<projectId>
Authorization: Bearer {{moderatorToken}}
Content-Type: application/json

{ "notes": "Panels delayed until Friday due to a supplier issue.", "endDate": "2027-03-10" }
```

### Projects: change status
```
PATCH http://localhost:4000/api/projects/<projectId>/status
Authorization: Bearer {{token}}
Content-Type: application/json

{ "status": "IN_PROGRESS" }
```

### Projects: reassign moderator/owner/customer (OWNER)
```
PATCH http://localhost:4000/api/projects/<projectId>/assign
Authorization: Bearer {{ownerToken}}
Content-Type: application/json

{ "moderatorId": "<uuid of a different active MODERATOR>" }
```

### Projects: delete (OWNER)
```
DELETE http://localhost:4000/api/projects/<projectId>
Authorization: Bearer {{ownerToken}}
```

### Requests: submit a request (MODERATOR)
```
POST http://localhost:4000/api/requests
Authorization: Bearer {{moderatorToken}}
Content-Type: application/json

{ "type": "INVENTORY_RESTOCK", "title": "Restock cladding panels", "description": "Down to 3 units in the Quezon City warehouse." }
```

### Requests: list (filter + search + pagination + sorting)
```
GET http://localhost:4000/api/requests?status=PENDING&type=REFUND&search=panel&sortBy=createdAt&sortOrder=desc&page=1&limit=10
Authorization: Bearer {{token}}
```

### Requests: edit your own pending request (MODERATOR)
```
PATCH http://localhost:4000/api/requests/<requestId>
Authorization: Bearer {{moderatorToken}}
Content-Type: application/json

{ "title": "Restock cladding + partition panels" }
```

### Requests: approve / reject (OWNER)
```
PATCH http://localhost:4000/api/requests/<requestId>/approve
Authorization: Bearer {{ownerToken}}
Content-Type: application/json

{ "reviewNote": "Approved - budget confirmed." }

PATCH http://localhost:4000/api/requests/<requestId>/reject
Authorization: Bearer {{ownerToken}}
Content-Type: application/json

{ "reviewNote": "Budget not available this quarter." }
```

### Requests: cancel your own pending request (MODERATOR)
```
PATCH http://localhost:4000/api/requests/<requestId>/cancel
Authorization: Bearer {{moderatorToken}}
```

### Requests: delete
```
DELETE http://localhost:4000/api/requests/<requestId>
Authorization: Bearer {{token}}
```

### Analytics: dashboard snapshot
```
GET http://localhost:4000/api/analytics/dashboard
Authorization: Bearer {{token}}
```

### Analytics: sales (date range)
```
GET http://localhost:4000/api/analytics/sales?dateFrom=2027-01-01&dateTo=2027-01-31
Authorization: Bearer {{token}}
```

### Analytics: top-selling products (paginated)
```
GET http://localhost:4000/api/analytics/products?page=1&limit=10
Authorization: Bearer {{token}}
```

### Analytics: customers (top spenders are OWNER-only)
```
GET http://localhost:4000/api/analytics/customers?dateFrom=2027-01-01&page=1&limit=10
Authorization: Bearer {{ownerToken}}
```

### Analytics: projects (moderator workload, paginated)
```
GET http://localhost:4000/api/analytics/projects?page=1&limit=10
Authorization: Bearer {{token}}
```

### Reports: sales (date range, paginated)
```
GET http://localhost:4000/api/reports/sales?dateFrom=2027-01-01&dateTo=2027-01-31&page=1&limit=20
Authorization: Bearer {{token}}
```

### Reports: inventory (paginated)
```
GET http://localhost:4000/api/reports/inventory?page=1&limit=20
Authorization: Bearer {{token}}
```

### Reports: orders (status filter)
```
GET http://localhost:4000/api/reports/orders?status=PROCESSING&page=1&limit=20
Authorization: Bearer {{token}}
```

### Reports: bookings (status + date range)
```
GET http://localhost:4000/api/reports/bookings?status=APPROVED&dateFrom=2027-01-01&page=1&limit=20
Authorization: Bearer {{token}}
```

### Reports: projects (status filter)
```
GET http://localhost:4000/api/reports/projects?status=IN_PROGRESS&page=1&limit=20
Authorization: Bearer {{token}}
```

### AR: save a measurement (CUSTOMER)
```
POST http://localhost:4000/api/ar/measurements
Authorization: Bearer {{token}}
Content-Type: application/json

{ "label": "Living room wall", "width": 4, "height": 2.5, "depth": 0.1, "unit": "m" }
```

### AR: list / view / update / delete your measurements
```
GET http://localhost:4000/api/ar/measurements?page=1&limit=20
Authorization: Bearer {{token}}

GET http://localhost:4000/api/ar/measurements/<measurementId>
Authorization: Bearer {{token}}

PATCH http://localhost:4000/api/ar/measurements/<measurementId>
Authorization: Bearer {{token}}
Content-Type: application/json

{ "width": 5 }

DELETE http://localhost:4000/api/ar/measurements/<measurementId>
Authorization: Bearer {{token}}
```

### AR: panel estimate (from a saved measurement, or raw width/height)
```
POST http://localhost:4000/api/ar/estimate
Authorization: Bearer {{token}}
Content-Type: application/json

{ "productId": "<uuid of a product with width/height configured>", "measurementId": "<measurementId>" }
```

### Delivery: create (MODERATOR)
```
POST http://localhost:4000/api/delivery
Authorization: Bearer {{moderatorToken}}
Content-Type: application/json

{ "orderId": "<uuid>", "address": "123 Rizal Street, Quezon City, Metro Manila, 1100", "scheduledDate": "2027-02-01", "courierName": "LBC Express", "trackingNumber": "TRK-001" }
```

### Delivery: list (filter + search + pagination + sorting)
```
GET http://localhost:4000/api/delivery?status=scheduled&search=LBC&sortBy=scheduledDate&sortOrder=asc&page=1&limit=20
Authorization: Bearer {{token}}
```

### Delivery: update tracking / reschedule (MODERATOR)
```
PATCH http://localhost:4000/api/delivery/<deliveryId>
Authorization: Bearer {{moderatorToken}}
Content-Type: application/json

{ "trackingNumber": "TRK-999", "scheduledDate": "2027-02-05" }
```

### Delivery: mark delivered / delete (MODERATOR)
```
PATCH http://localhost:4000/api/delivery/<deliveryId>/delivered
Authorization: Bearer {{moderatorToken}}

DELETE http://localhost:4000/api/delivery/<deliveryId>
Authorization: Bearer {{moderatorToken}}
```

### Example validation error response (`400`)
```json
{
  "success": false,
  "message": "Validation failed.",
  "errors": [
    { "path": "email", "message": "Please provide a valid email address." },
    { "path": "password", "message": "Password must contain at least one uppercase letter." }
  ]
}
```

### Example rate-limit error response (`429`)
```json
{
  "success": false,
  "message": "Too many authentication attempts. Please try again later."
}
```

---

## 8. What's next

This section previously described Phase 1 (auth + users only) as the current state, with everything
below listed as future work. That's stale — every module below has since been built, tested, and
documented. This is the corrected, verified-against-the-repository status as of the P0 documentation
cleanup (see `DEVELOPMENT_ROADMAP.md` at the repo root for the full breakdown, workflow trees, and
discovered documentation gaps).

**COMPLETED** — built, tested (530/530 passing), and documented in this README:
- Auth (register/login/me, Refresh Tokens, Logout)
- Users
- Category
- Product
- Inventory
- Cart
- Order
- Payment (PayMongo Checkout Sessions + webhook)
- Booking
- Installer
- Chat
- Notifications
- Feedback
- Project
- Request Approval
- Analytics
- Reports
- AR Support
- Delivery
- Rate Limiting (cross-cutting)

**NEXT**
- GitHub Actions / CI — no workflow exists yet in this repository (`.github/workflows/` is absent);
  this is greenfield setup, not a fix.
- Frontend development — the React Native/Expo mobile app and the web (moderator/owner) dashboard.
  See `FRONTEND_HANDOFF.md` at the repo root for the API contract and per-role task trees.

**LATER**
- Email verification on registration
- Forgot password / reset password flow
- Account lockout after repeated failed login attempts
- Other optional security hardening (e.g. shortening `JWT_EXPIRES_IN` now that refresh tokens exist to
  renew access silently, or configuring `app.set('trust proxy', ...)` once a real deployment topology
  with a reverse proxy/load balancer exists)

**DEFERRED**
- Real PayMongo production/live-key integration. The integration code is complete and tested against a
  stubbed webhook signature — going live only requires real `PAYMONGO_SECRET_KEY` /
  `PAYMONGO_WEBHOOK_SECRET` values and registering the webhook URL in the PayMongo dashboard, but this
  is explicitly out of scope until the business is ready to accept real payments.
