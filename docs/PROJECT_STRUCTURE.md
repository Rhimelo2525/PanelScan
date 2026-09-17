# Project structure

The repository contains three independent npm projects, not a root workspace. There is no root `package.json`, root lockfile, or root Vercel configuration.

| Location | Purpose |
| --- | --- |
| `web/` | React/Vite website and frontend-only previews |
| `backend/` | Existing Express/TypeScript/Prisma API, migrations, Postman collections and Vitest tests; separate from web deployment |
| `frontend/` | Existing Expo/React Native mobile project, own package/lockfile and Expo license; unchanged by web documentation |
| `.github/workflows/backend-ci.yml` | Backend GitHub Actions definition, not web or GitLab CI |
| `docs/` | Current web architecture, feature, role, design, setup, deployment and testing references |
| Root handoff/onboarding/roadmap/notes | Earlier backend/platform context; not current web validation evidence |

## Web sources

| Under `web/` | Responsibility |
| --- | --- |
| `src/main.tsx`, `src/App.tsx` | React entry point, providers and complete route tree |
| `src/pages/`, `src/pages/admin/` | Route-level screens |
| `src/components/` | Admin, auth, cart, checkout, home, layout, legal, orders, payments, products, support and UI components |
| `src/admin/` | Navigation, layout, route guard, preview capabilities, validation, resource loading |
| `src/api/` | Native-fetch client and auth/catalogue/cart/order/payment/support/Admin adapters |
| `src/auth/`, `src/cart/` | Context, session, guards, cart orchestration and helpers |
| `src/preview/` | Product/business/support/rating stores and policies |
| `src/data/` | Catalogue, Admin, customer order/project and imagery fixtures |
| `src/products/`, `src/projects/` | Panel taxonomy and sample project-result boundary |
| `src/orders/`, `src/payments/` | Formatting/errors and payment handoff/confirmation hooks |
| `src/hooks/`, `src/lib/`, `src/types/` | Shared hooks, utilities/money formatting and contracts |
| `src/index.css` | Theme and responsive/motion styling |
| `public/brand/`, `public/images/` | Existing brand assets and representative WebP imagery |
| `tests/preview.test.mjs` | Node policy/store tests |
| `docs/research-preview.md` | Existing demonstration walkthrough |
| `TESTING_CHECKLIST.md` | Manual evaluation checklist, not completed results |
| `package.json`, `package-lock.json` | Scripts, dependencies and reproducible resolutions |
| `.env.example`, `.gitignore` | Optional API example and local-file exclusions |
| `vite.config.ts`, `vercel.json` | Bundling and static deployment |
| `tsconfig*.json`, `.oxlintrc.json`, `components.json` | TypeScript, Oxlint and shadcn configuration |

Root/web ignore rules exclude dependency installs, build output and local environment files. Generated directories are not part of this documentation change. [Design system](DESIGN_SYSTEM.md) lists the actual brand files without duplicating them.
