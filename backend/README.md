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
| POST   | `/register` | No  | Creates a new `CUSTOMER` account, returns user + JWT |
| POST   | `/login`    | No  | Validates credentials, returns user + JWT            |
| GET    | `/me`       | Yes | Returns the authenticated user's profile             |

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

**POST `/api/auth/login`**
Body: `{ "email": "juan@example.com", "password": "Passw0rd123" }`
- `401` on invalid credentials, `403` if the account has been deactivated.

**GET `/api/auth/me`**
Header: `Authorization: Bearer <token>`
- Returns the current authenticated user (password never included in any response).

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
| `JWT_EXPIRES_IN` | JWT lifetime (e.g. `7d`, `1h`)                              | `7d`           |
| `CORS_ORIGIN`    | Allowed origin for the frontend                             | `*`            |

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
Expected `200` with `data.token`. Save this token as a Postman **collection variable**
(e.g. `{{token}}`) using the Postman **Tests** tab:
```js
const body = pm.response.json();
pm.collectionVariables.set('token', body.data.token);
```

### Get current user
```
GET http://localhost:4000/api/auth/me
Authorization: Bearer {{token}}
```

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

---

## 8. What's next (later phases)

Phase 1 only builds the auth + users foundation. Subsequent phases will add, on top of this same
`modules/` pattern: inventory management, product management, orders, installer management,
project tracking/monitoring, feedback management, moderator management, and request approval —
plus the React Native/Expo mobile app and the web dashboard.
