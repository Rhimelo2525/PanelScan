# PanelScan — Team Onboarding

A complete, beginner-friendly guide for a new teammate joining PanelScan development —
starting from cloning the repository, through daily Git workflow, to their first pull
request. Every command and file path below was verified directly against the actual
repository on 2026-08-08, not assumed.

If anything here ever stops matching reality, trust the repository and fix this
document — see `DEVELOPMENT_GUIDE.md` §9, rule 20.

---

## 1. Clone PanelScan

1. **Install Git**, if you don't already have it: [git-scm.com/downloads](https://git-scm.com/downloads).
2. **Open VS Code** (or your preferred editor — the rest of this guide assumes VS Code
   since that's what the team uses).
3. **Open a terminal** inside VS Code (`` Ctrl+` `` / `` Cmd+` ``, or Terminal → New
   Terminal).
4. **Clone the repository**:
   ```bash
   git clone https://github.com/CeeJayRopa/PanelScan.git
   ```
5. **Enter the project directory**:
   ```bash
   cd PanelScan
   ```
6. **Open the project in VS Code**:
   ```bash
   code .
   ```

**Do not download the project as a ZIP file for normal development.** A ZIP is a
one-time snapshot with no connection back to the repository — you'd have no way to
pull other people's changes, push your own, or use branches at all. `git clone` sets
up a real local repository linked to GitHub, which is what every step after this one
depends on.

---

## 2. Understand the project structure

After cloning, you should see:

```
PanelScan/
├── backend/                  # Express + TypeScript + Prisma API (CockroachDB)
├── frontend/                 # Expo + React Native + TypeScript mobile app
├── .github/
│   └── workflows/
│       └── backend-ci.yml    # GitHub Actions: typecheck/build/test on every push+PR
├── DEVELOPMENT_GUIDE.md       # Backend architecture, module pattern, Git/CI workflow,
│                                Definition of Done — the backend team's reference
├── DEVELOPMENT_ROADMAP.md      # What's built, what's left, priorities (P0-P3)
├── FRONTEND_HANDOFF.md          # The API contract: auth flow, roles, response/error
│                                  format, Postman — required reading before any
│                                  frontend API integration
├── PROJECT_NOTES.txt              # Running development log/history — useful for
│                                    "why was this built this way," not day-to-day work
└── README.md                       # Short top-level index — points to everything above
```

(`.gitignore` and an editor-config folder also exist at the root — neither is
something you need to touch.)

### `backend/`
The API server. See §12 below for its internal architecture.
- `backend/src/` — all application source code
- `backend/tests/` — the integration test suite (Vitest + Supertest), one folder per
  module, run against a real database
- `backend/prisma/` — `schema.prisma` (the database schema) and `migrations/` (every
  applied migration, in order — never edit an old one)

### `frontend/`
The mobile app (Expo/React Native). Currently an **architecture scaffold only** — see
`frontend/README.md`'s "Development status" section for exactly what is and isn't
built yet. See §11 below for its internal structure.
- `frontend/src/` — all application source code

### `.github/`
GitHub Actions CI configuration — one workflow file, `workflows/backend-ci.yml`. See
§19.

---

## 3. Read the documentation first

Before writing any code, read these — in this order:

1. **`README.md`** (repo root) — a short index of everything else; start here to know
   where to look next.
2. **`FRONTEND_HANDOFF.md`** — the API contract: how authentication works, what each
   of the three roles (CUSTOMER/MODERATOR/OWNER) can actually do, the response/error
   envelope every endpoint uses, and per-role frontend build-order checklists. If
   you're building frontend features, this is the single most important document to
   understand before writing an API call.
3. **`DEVELOPMENT_GUIDE.md`** — backend architecture, the module pattern every backend
   feature follows, the Git/GitHub workflow, the frontend/backend change-boundary rule,
   testing philosophy, and the Definition of Done checklist. Required reading before
   any backend change.
4. **`DEVELOPMENT_ROADMAP.md`** — current status, what's completed, what's deliberately
   deferred (email verification, password reset, account lockout, MFA/OAuth, real
   PayMongo production credentials), and priorities.
5. **`backend/README.md`** — the full backend API reference: every endpoint, per-module,
   with request/response shapes, role permissions, and business rules. Your primary
   day-to-day lookup once you know the app-level concepts from `FRONTEND_HANDOFF.md`.
6. **`frontend/README.md`** — the frontend project's own stack, folder structure, and
   "how to add a feature" workflow.

These six documents are this project's source of truth for how development works and
how the API behaves — not tribal knowledge, not what a screenshot or a teammate
remembers. If something in code contradicts one of these documents, that's worth
flagging, not silently working around.

---

## 4. Install the backend

```bash
cd backend
npm install
```

Real scripts available, from `backend/package.json` (don't invent others):

| Script | Purpose |
|---|---|
| `npm run dev` | Start the API with hot-reload (`tsx watch`) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled output (`dist/server.js`) |
| `npm run typecheck` | Type-check `src/` only, no emit |
| `npm run prisma:generate` | Regenerate the Prisma Client |
| `npm run prisma:migrate` | Create + apply a new migration (interactive, dev only) |
| `npm run prisma:migrate:deploy` | Apply already-committed migrations, non-interactively |
| `npm run prisma:studio` | Open Prisma Studio (visual DB browser) |
| `npm run prisma:reset` | **Destructive** — drops the DB and reapplies all migrations (dev only, never on a shared database) |
| `npm run prisma:seed` | Seed 1 OWNER, 1 MODERATOR, 5 categories, 10 products + inventory |
| `npm test` | Run the full integration test suite against `.env.test` |
| `npm run test:watch` | Same, in watch mode |
| `npm run test:coverage` | Same, with coverage output |
| `npm run test:migrate` | Apply migrations to the **test** database |
| `npm run test:typecheck` | Type-check `tests/` + `src/` together (stricter superset of `typecheck`) |

> **Note on `bcrypt`** (a native module used for password hashing): it compiles from
> source on `npm install`. On Windows this requires the Visual Studio Build Tools
> ("Desktop development with C++" workload). If `npm install` fails here, that's almost
> always why — see `backend/README.md` §5 for the fallback (`bcryptjs`) if you'd rather
> avoid native builds.

---

## 5. Backend environment

Two separate environment files, both git-ignored (never committed):

```
backend/.env.example        →  backend/.env         (your local dev config)
backend/.env.test.example   →  backend/.env.test     (your local test config)
```

```bash
cd backend
cp .env.example .env
cp .env.test.example .env.test
```

- **`.env`** is your local development configuration — the database your `npm run dev`
  server actually talks to.
- **`.env.test`** is your local test configuration — a **separate, dedicated test
  database**. The test suite truncates every table after every test; never point it at
  the same database as `.env`.
- **`.env` and `.env.test` must never be committed.** Both are already in
  `backend/.gitignore` — don't override that.
- **Never copy another developer's `.env`/`.env.test`.** Generate your own
  `JWT_SECRET` (the file tells you how: `openssl rand -base64 48`), and use your own
  database connection details.
- **Never commit a real database password, connection string, or API key** — not in
  a `.env*` file, not hardcoded anywhere, not "just for now."

`backend/.env.example` documents every variable the app actually reads (see
`backend/src/config/env.ts`) with real explanations of what each one does and whether
it's required — read the comments in the file itself rather than guessing.

---

## 6. Database

PanelScan uses **CockroachDB** (Postgres wire-compatible) via **Prisma**.

- **Migrations** live in `backend/prisma/migrations/` — one folder per migration,
  applied in order. `backend/prisma/schema.prisma` is the single source of truth for
  the schema; the migrations are its applied history.
- **Prisma Client** is generated from the schema (`npm run prisma:generate`) — this
  is what your TypeScript code actually imports (`import { prisma } from
  './config/database'`), not raw SQL.
- **Development database**: whatever `DATABASE_URL` points to in your local `.env`.
  This is what `npm run dev` uses. Use a database only you write to — either a local
  CockroachDB instance (`cockroach demo` or `cockroach start-single-node --insecure`,
  see `backend/README.md` §5) or your own CockroachDB Cloud database.
- **Test database**: whatever `DATABASE_URL` points to in your local `.env.test` — a
  **separate** database from dev, since the test suite truncates every table after
  every test.
- **CI database**: GitHub Actions does **not** use your local database, and does not
  use the shared team CockroachDB Cloud database either. Every CI run starts its own
  short-lived CockroachDB Docker container, applies migrations to it, runs the tests,
  and throws it away when the job ends. Your local database setup has no effect on CI,
  and CI's database has no effect on you — see §19.

**Never run a destructive Prisma command (`prisma migrate reset`, or any manual
`DROP`/`TRUNCATE`) against a shared or production database.** `prisma:reset` is for
your own local dev database only.

---

## 7. Start the backend

```bash
cd backend
npm run dev
```

Expected output: `🚀 PanelScan API running on port 4000 in development mode`.

**Verify it's running** by hitting the health check endpoint — no authentication
required:

```
GET http://localhost:4000/health
```

Expected response: `{ "status": "ok", "timestamp": "..." }`.

(Port `4000` is the actual default from `backend/.env.example`'s `PORT=4000` — if you
changed `PORT` in your own `.env`, use that value instead.)

---

## 8. Install the frontend

From the project root:

```bash
cd frontend
npm install
```

This is an **Expo SDK 57** project (React Native 0.86, React 19, TypeScript strict —
see `frontend/package.json`). Real scripts available:

| Script | Purpose |
|---|---|
| `npm start` | Start the Expo dev server |
| `npm run android` | Start the dev server and open on Android |
| `npm run ios` | Start the dev server and open on iOS (requires macOS) |
| `npm run web` | Start the dev server for web |
| `npm run typecheck` | Type-check the whole project, no emit |

---

## 9. Frontend environment

```
frontend/.env.example   →   frontend/.env
```

```bash
cd frontend
cp .env.example .env
```

One variable currently: **`EXPO_PUBLIC_API_BASE_URL`** — the backend API's base URL.
Defaults to `http://localhost:4000` (matching the backend's default port from §7).

**This value depends on how you're running the app, and getting it wrong is the most
common "why can't my app reach the backend" problem:**

- **Computer only** (web, or a simulator running on the same machine as the backend):
  `http://localhost:4000` works as-is — `localhost` correctly means "this computer."
- **Android emulator**: the emulator is its own virtual machine — `localhost` inside
  it means the emulator itself, not your development computer. Use your machine's LAN
  IP instead (e.g. `http://192.168.1.23:4000`), or Android's special emulator alias
  `http://10.0.2.2:4000` if using Android Studio's emulator.
- **Physical phone** (via Expo Go, on the same Wi-Fi network as your computer):
  `localhost` on the phone means **the phone itself** — it will never reach your
  development machine. You must use your computer's actual LAN IP address (find it
  with `ipconfig` on Windows or `ifconfig`/`ip addr` on Mac/Linux), e.g.
  `EXPO_PUBLIC_API_BASE_URL=http://192.168.1.23:4000`. Your phone and computer must be
  on the same network for this to work.

No secrets belong in this file — everything prefixed `EXPO_PUBLIC_` is bundled into
the client app and is not private (see the file's own header comment).

---

## 10. Run the frontend

```bash
cd frontend
npm start
```

This starts the Expo dev server and shows a QR code plus a menu of options.

- **Expo Go** (fastest way to see it on a real device): install the
  [Expo Go](https://expo.dev/go) app on your phone, then scan the QR code shown in
  the terminal (or in the browser tab Expo opens).
- **Android emulator**: if you have Android Studio's emulator configured, press `a`
  in the terminal, or run `npm run android` directly.
- **iOS simulator**: macOS only — press `i`, or run `npm run ios`.

**Verify the frontend can reach the backend**: with the backend running (§7) and
`EXPO_PUBLIC_API_BASE_URL` set correctly for how you're running the app (§9), the app
currently launches straight into the Login placeholder screen (no real screens are
implemented yet — see `frontend/README.md`'s "Development status"). Confirming
frontend→backend connectivity end-to-end isn't possible yet since no screen makes a
real API call — that's the first real integration task once `features/auth` is
implemented. For now, "the app launches without a red error screen" is the actual,
honest verification available.

*(This guide does not claim any physical device or emulator testing was performed
while writing it — verify on your own hardware.)*

---

## 11. Understand the frontend structure

```
frontend/src/
├── api/            # one file per backend module — HTTP calls (documented, not yet implemented)
├── components/      # reusable, feature-agnostic UI (common/, forms/, cards/, tables/, modals/, navigation/, feedback/)
├── navigation/       # RootNavigator + one navigator per role (Auth/Customer/Moderator/Owner)
├── screens/           # placeholder screens, one folder per role (auth/, customer/, moderator/, owner/)
├── features/           # one folder per backend module — actual feature logic once built
├── store/               # app-wide client state (not implemented yet — no library chosen)
├── hooks/                # app-wide reusable hooks
├── types/                 # types mirroring the backend's documented wire contract
├── constants/               # static app-wide constants (e.g. role display labels)
├── utils/                    # pure helper functions
├── theme/                     # design tokens (not designed yet)
└── assets/                     # app-specific fonts/images
```

Full explanation of each folder's purpose: `frontend/README.md` §4.

**Before creating a new folder, check whether an existing one already matches the
purpose.** Nineteen `api/`/`features/` folders already exist, one per backend module —
if you're building a products screen, that logic belongs in `features/products/`, not
a new `features/product-stuff/` or similar. If you're building a reusable button,
check `components/common/` before adding a one-off styled `<Text>` inside a screen
file.

---

## 12. Understand the backend structure

```
backend/src/
├── config/         # env loading (env.ts) + the Prisma client singleton (database.ts)
├── middleware/      # authenticate, restrictTo (RBAC), validate, rate limiting, error handling
├── modules/           # one folder per business domain — see the pattern below
├── routes/             # index.ts mounts every module's router under /api
├── types/               # shared TS types (Express Request augmentation, API response shapes)
├── utils/                # small, pure helpers (AppError, catchAsync, jwt, password, response)
├── app.ts                 # Express app: middleware pipeline + route registration
└── server.ts                # loads env, starts the HTTP server
```

**Module pattern** — every module under `src/modules/<name>/` follows this shape
(verified directly; smaller modules like `auth` inline their types instead of a
separate `.types.ts` file, but the other four files are consistent everywhere):

```
module/
├── module.routes.ts       # wires authenticate → restrictTo → validate → controller
├── module.controller.ts   # thin HTTP layer only — no business logic
├── module.service.ts      # all business logic, Prisma calls, transactions
├── module.validation.ts   # Zod schemas + inferred request types
└── module.types.ts        # Prisma include/select shapes + derived types (where needed)
```

Full explanation of what each layer is responsible for and why: `DEVELOPMENT_GUIDE.md`
§3.2 and §4.

---

## 13. Understand the API

Before writing a frontend API call — or assuming an endpoint exists — check, in this
order:

1. **`backend/README.md`** §3 — the endpoint reference: every route, role permissions,
   request/response shapes, business rules. Covers all 19 business modules.
2. **The actual backend route files** (`backend/src/modules/<name>/<name>.routes.ts`)
   if the README doesn't fully answer your question.
3. **The matching Postman collection** (`backend/postman/PanelScan-<Name>.postman_collection.json`)
   — real, runnable example requests.
4. **The validation file** (`<name>.validation.ts`) for the exact required/optional
   fields and their constraints.
5. **The service file** (`<name>.service.ts`) for the exact business rules (what makes
   a request succeed vs. fail with a 400/404/409).

**Never invent an API endpoint or response format.** If you're not sure a field
exists in a response, check the README or the actual code — don't guess based on what
"seems like it should be there."

**If an endpoint genuinely doesn't exist:**
1. Check the backend (routes files) — confirm it's really missing, not just
   undocumented.
2. Check `backend/README.md` and the Postman collection — confirm again.
3. Ask whether the backend actually needs a new endpoint, or an existing one already
   covers the need in a way that isn't obvious yet.
4. If a change is genuinely necessary, follow `DEVELOPMENT_GUIDE.md` §8.6's
   frontend/backend change-boundary process — document the requirement, discuss it,
   then create a backend task/PR for it. Don't work around a missing endpoint with
   invented frontend behavior.

---

## 14. Authentication

High-level flow (see `FRONTEND_HANDOFF.md` §3 for the full detail, including exact
storage/retry guidance):

```
Register (POST /api/auth/register — issues an access token only)
   ↓
Login (POST /api/auth/login — issues an access token AND a refresh token)
   ↓
Access Token + Refresh Token
   ↓
Authenticated API requests (Authorization: Bearer <access token>)
   ↓
Access token expires → 401
   ↓
Refresh (POST /api/auth/refresh — no Authorization header needed; rotates both tokens)
   ↓
Logout (POST /api/auth/logout — revokes the one refresh token used)
```

Refresh tokens are **opaque random strings, not JWTs** — only the access token is a
JWT. Refresh tokens are single-use: every successful refresh revokes the one you sent
and issues a new one (rotation) — reusing an old one returns 401.

**Three roles** — this is the complete list, there is no fourth:

| Role | Summary |
|---|---|
| `CUSTOMER` | Shopping, cart, checkout, payments, own bookings, own AR measurements, own project viewing (read-only), chat, notifications, feedback |
| `MODERATOR` | Orders, inventory, products/categories, bookings, installers, chat, requests (as submitter), projects (assigned only), delivery, non-financial reports |
| `OWNER` | Everything MODERATOR does operationally, plus full analytics/reports (financial figures included), request approval, full project control |

Full per-role capability breakdown, verified against actual route guards (not
assumed): `FRONTEND_HANDOFF.md` §2 and §6.

**Frontend navigation controls what a user sees. Backend authorization is the actual
security boundary.** The app's role-based navigation (`RootNavigator` → per-role
navigator) is a UX convenience — hiding a screen from a CUSTOMER doesn't stop the
backend from independently checking every request's permission, and it must never be
treated as a substitute for that check. **Never bypass or remove backend
authorization just because hiding a frontend screen made a permission check "feel"
redundant.**

---

## 15. Git branch workflow

**Never work directly on `main`.**

Before starting any work:

```bash
git checkout main
git pull origin main
```

Then create a branch:

```bash
git checkout -b feature/<feature-name>
```

Examples:
```
feature/customer-products
feature/customer-cart
feature/customer-orders
feature/moderator-dashboard
feature/owner-dashboard
```

For bug fixes:
```
fix/<bug-name>
```

For documentation-only changes:
```
docs/<name>
```

---

## 16. Daily development workflow

```text
Pull latest main
        ↓
Create/update feature branch
        ↓
Develop
        ↓
Test locally
        ↓
Run typecheck
        ↓
Run build when appropriate
        ↓
Commit
        ↓
Push branch
        ↓
Create Pull Request
        ↓
GitHub Actions
        ↓
Code review
        ↓
Merge into main
```

- **Pull latest main** — always start from the current state of `main`, not a
  days-old local copy.
- **Create/update feature branch** — one branch per logical unit of work (§15).
- **Develop** — following the relevant architecture pattern (§11 frontend / §12
  backend) and the API contract (§13).
- **Test locally** — run the app, exercise the actual feature manually (not just
  "it typechecks").
- **Run typecheck** — `npm run typecheck` (frontend) or `npm run test:typecheck`
  (backend, the stricter superset — see §4).
- **Run build when appropriate** — `npm run build` for backend changes; the frontend
  has no separate build step yet (Expo bundles on demand).
- **Commit** — see §17.
- **Push branch** — `git push -u origin <branch-name>`.
- **Create Pull Request** — see §18.
- **GitHub Actions** — runs automatically on the PR (currently backend-only — see
  §19); wait for it to go green.
- **Code review** — see §18.
- **Merge into main** — only after review and a passing CI run.

---

## 17. Committing

```bash
git status              # see what changed
git add .                # stage it (review first if anything looks unexpected)
git commit -m "feat: ..."
git push -u origin <branch-name>
```

**Good commit messages** describe *what* changed at a glance, using a `type: ` prefix:

```
feat: implement customer product screen
feat: add moderator inventory screen
fix: handle expired access token
fix: correct cart quantity update
docs: update frontend setup
```

**Avoid vague commits** that tell a reviewer (or future-you) nothing:

```
update
changes
fix
asdf
```

---

## 18. Pull Request

Every PR should describe:

### What changed
A concise summary of the actual change.

### Why
The requirement or problem this addresses.

### How it was tested
What you actually ran/checked — typecheck, manual testing, which role(s) you tested
as, etc. Not "should work."

### Known limitations
Anything intentionally left out of scope, or a known edge case not yet handled.

Rules:
- **Don't merge your own PR** if team review is required by your team's process.
- **Don't merge when CI is failing.** A red check must be investigated, not ignored
  (see §19).
- **Keep unrelated changes out of the PR.** A products-screen PR shouldn't also
  reformat an unrelated file or touch backend business logic.

---

## 19. GitHub Actions

`.github/workflows/backend-ci.yml` runs automatically on every push and every pull
request against `main`. Actual pipeline, verified directly against the workflow file:

```
Checkout
  ↓
Node.js 20 setup
  ↓
npm ci
  ↓
Prisma Client generation
  ↓
Typecheck (src + tests)
  ↓
Build
  ↓
Start an ephemeral CockroachDB container (this CI run's own throwaway database)
  ↓
Wait for CockroachDB to accept connections
  ↓
Apply CockroachDB cluster settings this project's migrations need
  ↓
Create the test database
  ↓
Create .env.test for CI
  ↓
Apply database migrations (prisma migrate deploy)
  ↓
Run the full integration test suite
```

Every step is blocking — none of them are configured to continue past a failure.
This pipeline currently only covers the **backend** (`frontend/` has no CI job yet —
see `DEVELOPMENT_ROADMAP.md` for that as a known gap, not something to work around
locally).

**A failing CI check must be investigated before merging** — never disable a test,
add `continue-on-error`, or otherwise route around a red check to unblock a merge.
Full detail on how to read a failed run, and known current CI status, is in
`DEVELOPMENT_GUIDE.md` §8.5.

---

## 20. Keeping the team synchronized

After a teammate merges code into `main`, your local `main` and your feature branch
both fall behind. Before starting new work:

```bash
git checkout main
git pull origin main
```

To bring an **in-progress** feature branch up to date with the latest `main`:

```bash
git checkout feature/<your-branch>
git merge main
```

(Prefer `git merge main` over `git rebase main` for a shared/pushed branch unless
your team has explicitly agreed on rebasing — rebasing a branch others have already
pulled rewrites history out from under them.)

Resolve any conflicts (§21), test again, then push:

```bash
git push
```

Do this **before** opening a PR, not after — surprises are much easier to deal with
on your own branch than inside a PR review.

---

## 21. Merge conflicts

A merge conflict means Git found two changes to the same lines it can't automatically
reconcile — it is not an error, and it does not mean you did anything wrong.

Safe process:

1. **Stop.** Don't panic-resolve.
2. **Read the conflicting files** — Git marks each conflict with
   `<<<<<<<` / `=======` / `>>>>>>>` markers showing both versions.
3. **Understand both changes** — what was each side actually trying to do?
4. **Do not blindly choose "ours" or "theirs."** Either side might contain
   important, unrelated work you'd silently delete.
5. **Resolve carefully** — often the correct resolution is neither side alone, but a
   combination that preserves both changes' intent.
6. **Test** — a conflict resolution that "looks right" can still be functionally
   wrong; verify it actually works.
7. **Commit the resolution.**
8. **Push again.**

**Never delete someone else's work just to make Git stop complaining.** If you're not
sure what a conflicting change was for, ask the person who wrote it before discarding
it.

---

## 22. Frontend/backend responsibility

| Frontend team | Backend team |
|---|---|
| Screens | Database |
| UI | Business rules |
| UX | Server-side validation |
| Navigation | Authentication |
| API integration | Authorization |
| Loading states | Transactions |
| Empty states | API behavior |
| Error presentation | Security |
| Client-side validation (UX only — never the actual security boundary) | |

**When frontend developers should request a backend change**: only after confirming
(§13) that no existing endpoint covers the need, and the requirement is genuine (not
"would save a network round trip" or "would be more convenient"). Follow
`DEVELOPMENT_GUIDE.md` §8.6 exactly — this is a governed process, not a quick ask.

---

## 23. Database rules

**Do not casually modify `backend/prisma/schema.prisma`.**

If a database change is genuinely required:

1. Confirm the need doesn't already exist as a field/model/relation.
2. Discuss the requirement with whoever owns backend changes.
3. Modify the schema.
4. Create a migration using this project's established workflow (see
   `DEVELOPMENT_GUIDE.md` §10.1 — note that `prisma migrate dev` needs an interactive
   terminal for a brand-new migration in this environment; the non-interactive
   alternative already used throughout this project's history is documented there).
5. Apply the migration to your dev database, then your test database
   (`npm run test:migrate`).
6. Regenerate the Prisma Client (`npm run prisma:generate`).
7. Update tests to cover the change.
8. Verify (`npm run build`, `npm run test:typecheck`, `npm test`).
9. Document the change (`backend/README.md`, and `PROJECT_NOTES.txt` if following
   that project's running-log convention).

**Never delete an existing migration file.** Migrations are an append-only history —
removing one desyncs anyone who already applied it from anyone who hasn't.

---

## 24. Testing before a PR

**Frontend:**
- [ ] TypeScript passes (`npm run typecheck`)
- [ ] App starts (`npm start`, no red error screen)
- [ ] Feature works (manually exercised)
- [ ] API integration works (against a real running backend, not a mock, for the
      primary happy path)
- [ ] Loading state works
- [ ] Error state works
- [ ] Empty state works
- [ ] Navigation works

**Backend:**
- [ ] Typecheck passes (`npm run test:typecheck`)
- [ ] Build passes (`npm run build`)
- [ ] Tests pass when a database is available (`npm test`)
- [ ] Database mutation is verified (a test asserts the actual DB state changed, not
      just that the HTTP response looked right — see `DEVELOPMENT_GUIDE.md` §7.1)
- [ ] Authorization is tested (the right roles are blocked, not just the right role
      is allowed)
- [ ] Validation is tested (malformed input actually rejected)

**Then:**
- [ ] Commit
- [ ] Push
- [ ] Create PR
- [ ] Wait for CI
- [ ] Review
- [ ] Merge

---

## 25. What you should never do

- ❌ Push directly to `main`
- ❌ Commit `.env` or `.env.test`
- ❌ Commit passwords
- ❌ Commit API secrets
- ❌ Share database credentials (Slack, email, chat — anywhere outside a proper
     secrets manager)
- ❌ Delete migrations
- ❌ Bypass backend authorization
- ❌ Invent API endpoints
- ❌ Invent API response structures
- ❌ Disable tests
- ❌ Modify tests just to make CI pass
- ❌ Use `any` to hide a TypeScript error instead of fixing it
- ❌ Install unnecessary dependencies "because it might be useful later"
- ❌ Duplicate existing architecture instead of reusing it (check §11/§12 first)
- ❌ Rewrite a completed backend module without a real reason (read it and understand
     its tests first — `DEVELOPMENT_GUIDE.md` §9, rules 1-2)
- ❌ Run a destructive database command (`prisma migrate reset`, manual `DROP`/`TRUNCATE`)
     against a shared or production database

---

## 26. First task for a new team member

```text
1. Clone repository                              (§1)
2. Install dependencies (backend AND frontend)    (§4, §8)
3. Configure environment (backend AND frontend)    (§5, §9)
4. Start backend                                    (§7)
5. Start frontend                                    (§10)
6. Confirm the backend health check responds          (§7)
7. Read FRONTEND_HANDOFF.md                             (§3)
8. Read DEVELOPMENT_GUIDE.md                              (§3)
9. Create a feature branch                                 (§15)
10. Make a small test change (e.g. a comment, or a trivial
    non-functional edit in your own scratch area)            (§16)
11. Run the relevant checks (typecheck at minimum)             (§16, §24)
12. Push the branch                                              (§17)
13. Open a Pull Request                                            (§18)
```

The goal of this first task isn't to ship a feature — it's to **prove your entire
development environment actually works** (clone → install → configure → run →
branch → commit → push → PR) before you start real feature work. If any step here
fails, that's exactly the problem to solve first.

---

*Last verified against the repository: 2026-08-08.*
