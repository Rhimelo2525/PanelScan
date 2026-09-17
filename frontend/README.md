# PanelScan — Frontend

React Native (Expo) mobile app for **PanelScan** — the AR-powered e-commerce and
installation-management app for Disenyo Interior Solution. This app is the client for
the [PanelScan backend](../backend); see [`FRONTEND_HANDOFF.md`](../FRONTEND_HANDOFF.md)
at the repo root for the full API contract before writing any feature code.

**Current status: architecture scaffold only.** No screens are actually implemented yet
— every screen in `src/screens/` is a placeholder. See "Development status" below.

---

## 1. Technology stack

| Layer | Technology |
|---|---|
| Framework | [Expo](https://expo.dev) (managed workflow) — SDK 57 |
| UI runtime | React Native 0.86, React 19 |
| Language | TypeScript (strict mode, extends `expo/tsconfig.base`) |
| Navigation | [React Navigation](https://reactnavigation.org) (`@react-navigation/native` + `@react-navigation/native-stack`) |
| HTTP | Native `fetch` (no HTTP client library installed — matches the backend's own choice of native `fetch` over Axios) |
| State management | **Not chosen yet** — deliberately not installed until `features/auth` needs real session state (see `src/store/README.md`) |

Nothing beyond this list is installed. Per this project's scaffolding task, dependencies
are added only when a concrete need exists — not speculatively "because they might be
useful later."

---

## 2. Install & run

### Prerequisites
- Node.js 20+ (matches the backend's own requirement — see `backend/README.md` §5)
- The [Expo Go](https://expo.dev/go) app on a physical device, or an Android/iOS
  simulator, to actually view the app
- A running PanelScan backend (`cd ../backend && npm run dev`) if you want screens to
  eventually talk to a real API — see the backend's own README for its setup

### Commands

```bash
cd frontend

# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# edit .env if your backend isn't at the default http://localhost:4000

# 3. Start the Expo dev server
npm start
# then press 'a' (Android), 'i' (iOS), or 'w' (web) — or scan the QR code with Expo Go

# Platform-specific shortcuts
npm run android
npm run ios     # requires macOS
npm run web
```

### Verification commands

```bash
npx tsc --noEmit   # typecheck the whole project — no build step exists yet (no bundler config beyond Expo's default)
npx expo-doctor    # validates the Expo project/config itself
```

---

## 3. Environment configuration

See `.env.example` for the full, current list — copy it to `.env` and adjust. Currently
just one variable:

| Variable | Purpose | Default |
|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | Backend API base URL | `http://localhost:4000` |

Uses Expo's native `EXPO_PUBLIC_*` env var support (no extra package required). **Never**
put a secret in this file — everything prefixed `EXPO_PUBLIC_` is bundled into the
client app and is not private. Backend secrets (JWT secret, database credentials,
PayMongo keys) belong only in `backend/.env`, never here.

If testing on a physical device, `localhost` won't resolve to your dev machine —
point `EXPO_PUBLIC_API_BASE_URL` at your machine's LAN IP instead.

---

## 4. Folder structure

```
frontend/
├── App.tsx                 # entry point — renders RootNavigator
├── index.ts                 # Expo's registerRootComponent entry (template default)
├── app.json                  # Expo config (name, icons, splash, platform settings)
├── .env.example
├── src/
│   ├── api/                  # one file per backend module — HTTP calls (see §6)
│   ├── components/            # reusable, feature-agnostic UI building blocks
│   │   ├── common/             # buttons, inputs, PlaceholderScreen, etc.
│   │   ├── forms/               # form primitives
│   │   ├── cards/                 # list-item card primitives
│   │   ├── tables/                 # paginated-list primitives (MODERATOR/OWNER screens)
│   │   ├── modals/                  # dialog/bottom-sheet primitives
│   │   ├── navigation/                # small nav-adjacent UI (icons, header buttons)
│   │   └── feedback/                   # toasts, inline validation/error states
│   ├── navigation/            # RootNavigator + one navigator per role (see §5)
│   ├── screens/                # one folder per role — see §5
│   │   ├── auth/
│   │   ├── customer/
│   │   ├── moderator/
│   │   └── owner/
│   ├── features/               # one folder per backend module — feature logic (see §7)
│   ├── store/                   # app-wide client state (not implemented yet)
│   ├── hooks/                    # app-wide reusable hooks
│   ├── types/                     # types mirroring the backend's documented wire
│   │                                contract (never the Prisma schema — see §6)
│   ├── constants/                  # static app-wide constants (e.g. role labels)
│   ├── utils/                       # pure helper functions
│   ├── theme/                        # design tokens (not designed yet)
│   └── assets/                        # app-specific fonts/images (see its own README
│                                         for how this differs from the root `assets/`)
└── assets/                    # Expo's own required app icon/splash files (app.json)
```

**No `app/` directory.** This project uses classic React Navigation (hand-written
`RootNavigator`/`AuthNavigator`/`CustomerNavigator`/`ModeratorNavigator`/`OwnerNavigator`
components in `src/navigation/`), not Expo Router's file-based routing — the two are
different navigation architectures, and creating an empty, unused `app/` folder for a
routing system this project doesn't use would be exactly the kind of "folder Expo
doesn't need" this project's scaffolding task said to avoid. If this project ever
migrates to Expo Router instead, `app/` would replace `src/navigation/`, not sit
alongside it unused.

### Why `src/` instead of flat root files

Everything importable lives under `src/`, separate from Expo/config files at the
project root (`App.tsx`, `app.json`, `.env.example`) — keeps app source and tooling
config visually distinct as the project grows.

---

## 5. Role structure

The backend has exactly three roles — `OWNER`, `MODERATOR`, `CUSTOMER` — see
`src/types/roles.ts` (matches `backend/prisma/schema.prisma`'s `UserRole` enum exactly)
and `FRONTEND_HANDOFF.md` §2 for what each role can actually do.

```
RootNavigator                    (src/navigation/RootNavigator.tsx)
├── AuthNavigator                (no session — Login, Register)
├── CustomerNavigator            (role === 'CUSTOMER')
├── ModeratorNavigator           (role === 'MODERATOR')
└── OwnerNavigator               (role === 'OWNER')
```

`RootNavigator` branches on the authenticated user's actual role (`user.role` from
`POST /api/auth/login`'s response — **never** decode the JWT client-side to get this,
see `FRONTEND_HANDOFF.md` §3.6). This branching is a UX convenience only — **the
backend is the final authority on every permission**, and re-enforces it on every
request regardless of what this app's navigation shows (`FRONTEND_HANDOFF.md` §4.2).
Do not duplicate backend authorization logic here beyond deciding which screens to
show; every actual write/read still goes through the backend's own role/ownership
checks.

Each role navigator's screen list was verified directly against the backend's actual
route guards (`backend/src/modules/*/​*.routes.ts`), not assumed from a spec — see the
comments in `src/navigation/ModeratorNavigator.tsx` and `OwnerNavigator.tsx` for the
two places this scaffold corrected the originally-requested screen list after that
verification (MODERATOR also manages Products/Categories; OWNER also has read-only
Delivery and Chat access).

---

## 6. API architecture

One file per backend module in `src/api/`, matching `backend/src/routes/index.ts`
exactly (19 modules, verified against that file — nothing invented, nothing renamed):

`auth`, `users`, `categories`, `products`, `inventory`, `cart`, `orders`, `payments`,
`bookings`, `installers`, `chat`, `notifications`, `feedback`, `projects`, `requests`,
`analytics`, `reports`, `ar`, `delivery`.

Every module file currently just documents its backend base route and links to the
relevant `backend/README.md` §3 section and Postman collection — **no requests are
implemented yet**. When implementing a module:

1. Route every call through `src/api/client.ts`'s `apiRequest()` — never call `fetch`
   directly from a feature or screen.
2. Type responses using `src/types/api.ts`'s `ApiResponse<T>` envelope — add the `T`
   for each endpoint only once you've confirmed its real shape against
   `backend/README.md` §3 or the matching Postman collection. Never guess ahead of the
   documented contract, and never copy the backend's Prisma schema into this project —
   the two shapes aren't the same thing (Prisma models are the database; API responses
   are the documented, curated wire contract — the backend can and does redact/reshape
   fields between the two, e.g. role-based field hiding in Analytics/Reports).
3. `src/api/client.ts` does not yet attach an `Authorization` header or handle
   token refresh — that's the first real piece of work `features/auth` needs to add
   (follow `FRONTEND_HANDOFF.md` §3 exactly).

---

## 7. Where each feature belongs

`src/features/<name>/` holds the actual business logic for one backend module —
hooks, feature-specific components, feature-specific types, feature-specific utils.
It's where a screen's *behavior* lives; `src/screens/` is just the routable container
that renders it.

Each feature folder currently has only a `README.md` explaining its scope and backend
mapping — the `components/ hooks/ types/ utils/` breakdown shown in
`src/features/products/README.md` is the pattern to apply "where useful" as a feature
is actually built, not something pre-created empty for all 19 modules (creating ~76
empty folders up front was explicitly out of scope for this scaffolding pass).

---

## 8. Adding a new feature

```
New frontend feature
        ↓
Check FRONTEND_HANDOFF.md (auth flow, roles, response/error format, workflows)
        ↓
Check backend API documentation (backend/README.md §3, the matching Postman
  collection, or the actual <module>.routes.ts if those don't answer it)
        ↓
Identify the required endpoint(s)
        ↓
Build the API integration (src/api/<module>.api.ts, routed through api/client.ts)
        ↓
Build feature logic (src/features/<module>/)
        ↓
Build the UI (src/screens/<role>/, using src/components/ primitives)
        ↓
Test against a real running backend (not mocks, for the primary happy paths —
  FRONTEND_HANDOFF.md §8)
        ↓
Test role/ownership behavior (log in as each relevant role; confirm 403/404
  behavior matches FRONTEND_HANDOFF.md §4.1 — don't just test the happy path)
        ↓
Run TypeScript checks (npx tsc --noEmit)
        ↓
Commit
        ↓
Push
        ↓
GitHub Actions / review
```

This mirrors the backend's own `DEVELOPMENT_GUIDE.md` §8.3/§10.2 workflow — same
discipline, same review/CI gate, just for this project instead.

---

## 9. When an API is missing

**Do not invent fake frontend behavior to work around a missing endpoint** (e.g.
computing a total client-side because the backend doesn't return one, or hardcoding
data because an endpoint doesn't exist yet). Follow this instead — it mirrors
`DEVELOPMENT_GUIDE.md` §8.6's "frontend/backend change boundary" rule exactly, from the
frontend side:

```
Missing API
    ↓
Document the requirement (what's missing, and why the frontend genuinely
  cannot proceed without it — not just "would be more convenient")
    ↓
Do NOT invent fake frontend behavior to paper over the gap
    ↓
Discuss the backend change with whoever owns backend changes — is this really
  necessary, or does an existing endpoint/field already cover it?
    ↓
Backend adds the endpoint, with its own tests, docs, and Postman collection
  update — only if the change is actually approved and necessary
    ↓
Frontend integrates the new/updated endpoint
```

> **Frontend development should consume the existing API. Do not modify backend
> behavior simply to make a frontend screen easier to build.** — `DEVELOPMENT_GUIDE.md` §8.6

---

## 10. Development status

Everything in this repository today is **scaffolding, not features**:

- [x] Expo + React Native + TypeScript project shell
- [x] Full folder structure (`api/`, `components/`, `navigation/`, `screens/`,
      `features/`, `store/`, `hooks/`, `types/`, `constants/`, `utils/`, `theme/`, `assets/`)
- [x] Role-based navigation architecture (`RootNavigator` → per-role navigators →
      placeholder screens), verified renderable end to end
- [x] API module files documenting every backend route, none implemented
- [ ] Real authentication (`features/auth`, `api/client.ts`'s token/refresh handling)
- [ ] Any actual screen UI
- [ ] Any actual API integration
- [ ] State management library selection

The next task on this project is expected to pick one vertical slice (most likely
`features/auth`, since everything else depends on it) and actually implement it,
starting from this foundation.

---

*Last verified against the repository: 2026-08-08.*
