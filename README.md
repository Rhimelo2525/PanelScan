# PanelScan

PanelScan provides an interior-panel storefront and business-workflow demonstrations for **Disenyo Interior Solution**.

## Development Credits

Custom-order developer: **`anxndd_`**  
Development company: **GreyStudio**

These credits identify the developer and company supplied for this handoff; they do not assign or transfer client or third-party intellectual-property rights.

## Overview

The website lives in `web/`. Production: **[panelscan-one.vercel.app](https://panelscan-one.vercel.app/)**. This address matches the existing deployment documentation; live availability and the deployed commit are not verified by repository inspection.

Repository: [Grey Studio / panelscan](https://gitlab.com/grey-studio/panelscan).

## Current Scope

**The web delivery is frontend-only; its Vercel configuration deploys no production backend.** This repository also contains a separate existing backend and Expo mobile project. Their presence does not establish a live website integration.

Public browsing and explicit previews work without an API. Preview changes are in-memory demonstrations, not database writes, real accounts, transactions, approvals, uploads, or multi-user messaging. Shared stores survive client-side navigation within one document and reset on reload/new tab. Moderator-management records also reset when their component unmounts.

Login, registration, cart, checkout, real orders, payments, customer services, and authenticated Admin interfaces require a separately configured API. Both customer project-result routes currently return fixtures, not synchronized mobile results.

## Features

- Searchable wall/ceiling panel catalogue, category filters, sorting, product details, stock presentation, galleries, and related products.
- Moderator product creation/editing, Active/Draft visibility, and local JPEG/PNG/WebP image previews.
- Owner/Moderator inventory and installer add/edit/search/filter/delete demonstrations.
- Orders & sales updates and linked project status, surface, and notes updates.
- Customer/Moderator support conversation and status previews.
- Delivered/completed fictional-purchase reviews, 1–5 stars, duplicate prevention, and shared product summaries.
- Owner-only moderator-record management and Change Request decisions.
- Responsive navigation, mobile table cards, reduced-motion handling, About, Terms, and Privacy pages.

See [features](docs/FEATURES.md), including the distinction between implemented interfaces and operational services.

## Roles

| Role | Preview capabilities |
| --- | --- |
| Customer | Browse, inspect fictional orders/projects, message support, rate eligible purchases. |
| Moderator | Products, business operations, support, reviews, and Change Request status viewing; no approvals or moderator management. |
| Owner/Admin (`OWNER`) | Business operations, read-only Products, moderator-record management, and request decisions; no Support workspace. |

Neither staff preview has a Customers directory. **Moderator preview has no new-request submission control**; submission exists in API-dependent `/admin/requests`. The API-dependent Owner Team screen still includes customer filtering. These differences are documented, not changed: [roles and permissions](docs/ROLES_AND_PERMISSIONS.md).

## Technology Stack

Declared web dependencies include React/React DOM `^19.2.8`, React Router DOM `^7.18.2`, Radix UI `^1.6.7`, shadcn `^4.18.0`, Lucide React `^1.31.0`, Sonner `^2.0.8`, Geist Variable `^5.3.0`, class-variance-authority, clsx, tailwind-merge, and tw-animate-css.

Development dependencies include TypeScript `~6.0.2`, Vite `^8.2.0`, React plugin `^6.0.4`, Tailwind CSS/Vite plugin `^4.3.3`, Oxlint `^1.75.0`, and Node/React type packages. These are manifest ranges, not locally verified installations. The npm lockfile pins resolutions. Tests use Node's built-in test runner; state uses React context, component state, and `useSyncExternalStore`.

## Project Structure

```text
panelscan/
├── web/
│   ├── public/brand/          # Existing logos/icons
│   ├── public/images/        # Representative imagery
│   ├── src/
│   │   ├── admin/ api/ auth/ cart/
│   │   ├── components/ data/ hooks/ lib/
│   │   ├── pages/ preview/ types/
│   │   ├── orders/ payments/ products/ projects/
│   │   ├── App.tsx
│   │   └── index.css
│   ├── tests/preview.test.mjs
│   ├── docs/research-preview.md
│   ├── package.json
│   ├── package-lock.json
│   └── vercel.json
├── backend/                  # Separate Express/Prisma API
├── frontend/                 # Separate Expo/React Native app
├── .github/workflows/        # Backend GitHub workflow
└── docs/                     # Current web documentation
```

There is no root package/lockfile. See [structure](docs/PROJECT_STRUCTURE.md).

## Development

Use npm and Node compatible with locked Vite's engine range: `^20.19.0 || >=22.12.0`. No exact web Node/npm version is pinned.

```sh
cd web
npm ci
npm run dev
```

## Testing

From `web/`:

```sh
npm run typecheck
npm run lint
npm run test:preview
npm run build
npm run preview
```

Preview tests cover policies/stores, not browser end-to-end behavior. These commands were inspected, **not executed during this documentation pass**. See [testing](docs/TESTING.md).

## Environment Variables

No variables are required for API-free browsing and explicit previews. Optional `VITE_API_BASE_URL` is read by `src/api/client.ts`. Copying `web/.env.example` unchanged selects a local API; a configured API failure does not fall back silently. Frontend configuration is public, not secret storage.

## Production

`web/vercel.json` sets `npm ci`, `npm run build`, output `dist`, and a catch-all rewrite to `/index.html`. Existing documentation specifies Vercel Root Directory `web`; that dashboard setting is not encoded in the JSON. See [deployment](docs/DEPLOYMENT.md). No web GitLab pipeline or automatic deployment trigger is established by checked-in files.

## Limitations

Preview inventory rows and product inventory are separate. Admin sales and customer preview purchases are separate fixtures. Dashboard/request metrics are illustrative. Preview approvals update status only. No browser AR, interactive 3D renderer, or mobile synchronization exists. Representative images are not verified client photography; legal-page text needs business/legal review.

## Documentation

[Architecture](docs/ARCHITECTURE.md) · [Development](docs/DEVELOPMENT.md) · [Deployment](docs/DEPLOYMENT.md) · [Features](docs/FEATURES.md) · [Roles](docs/ROLES_AND_PERMISSIONS.md) · [Structure](docs/PROJECT_STRUCTURE.md) · [Design system](docs/DESIGN_SYSTEM.md) · [Testing](docs/TESTING.md) · [Contributing](CONTRIBUTING.md)

Existing [backend](backend/README.md), [mobile](frontend/README.md), and root handoff/onboarding/roadmap documents concern separate projects or historical snapshots. Their old GitHub instructions and test counts do not establish current web status.

## License

[LICENSE](LICENSE) reserves rights in original project material without overriding existing licenses. The legal rights holder remains explicitly unconfirmed. The existing [Expo MIT notice](frontend/LICENSE) is preserved, not generalized to original PanelScan web code.
