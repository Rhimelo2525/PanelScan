# Architecture

Source baseline: `42b5d040ad215658712f6ab670cc28c3c779edcc`. Source paths below are relative to `web/src/`.

## Frontend boundary

`main.tsx` mounts React with `createRoot` and `StrictMode`. `App.tsx` composes BrowserRouter, AuthProvider, CartProvider, lazy routes/Suspense fallbacks, and Sonner. Vite produces static browser assets, not SSR or backend functions. The repository's Express/Prisma backend and Expo mobile app are separate projects.

## Routing

`App.tsx` is authoritative:

| Group | Routes |
| --- | --- |
| Public | `/`, `/products`, `/products/:id`, `/about`, `/login`, `/register`, `/terms`, `/privacy` |
| Public previews | `/admin-preview`, `/moderator-preview`, `/customer-preview`, `/support-preview`, `/projects-preview` |
| Authenticated account | `/dashboard`; `/account` redirects there |
| Customer guard | `/cart`, `/checkout`, `/orders`, `/orders/:id`, `/messages`, `/feedback`, `/installation`, `/projects`, `/payment/success`, `/payment/cancel` |
| Admin guard | `/admin` and children `projects`, `inventory`, `sales`, `installers`, `chat`, `feedback`, `requests`, `team` |
| Retired | `/designer`, `/visualizer` redirect to `/products` |

Public pages use SiteLayout; previews have their own workspace. Preview sections use `?view=...`; `orders` normalizes to `sales`. Unknown sections fall back to Dashboard unless denied. Unknown public paths show 404; unknown Admin children redirect to `/admin`. There is no authenticated `/admin/products` route.

## State and flows

| Boundary | Implementation and lifetime |
| --- | --- |
| Auth | Context plus `sessionStorage` key `panelscan.session`; restoration calls the API |
| Cart | Context reflecting API responses; serialized mutations, per-product pending state, reset on user change |
| Products/business/support/ratings | Four module-memory stores in `preview/`, subscribed through `useSyncExternalStore` |
| Moderator records | Component-local `useState`; resets on section unmount |
| Customer orders/project results | Independent fixed sample datasets |

Shared preview memory survives same-document router navigation, not reload/new tab/device changes. It is not a database. Product and Inventory workspace quantities are separate, as are customer fixtures and Admin sales/projects.

Moderator saves update the product store; Active listings flow to browsing while drafts remain in management. Images are decoded object URLs, not server uploads. The editor releases abandoned URLs; the store owns saved URLs until replacement/disposal/document teardown.

`api/products.ts` uses local records without an API URL. With one configured, successful catalogue responses receive managed-product overlays; errors stay explicit. Managed details are checked locally first and cannot enter real cart checkout.

Business updates use shared rows. Project changes also update linked sales records; linkage can fall back to customer names and is only a demo association. Customer/Moderator chat shares messages and status. Ratings validate fixture purchases then feed product summaries and Moderator feedback. Request decisions update local status only; preview has no compose flow.

## Optional services and presentation

`api/client.ts` reads `VITE_API_BASE_URL`, uses native fetch, typed JSON envelopes, centralized errors, and session refresh/retry. Account/commerce/customer-service/Admin screens require the separate API. `projects/project-results-repository.ts` always returns `DEMO_FALLBACK`, even behind `/projects`.

Pages compose feature components; `components/ui/` supplies shared primitives; hooks manage titles/reveal behavior. Tailwind 4 CSS and Radix-based components share storefront/Admin tokens. See [design](DESIGN_SYSTEM.md), [roles](ROLES_AND_PERMISSIONS.md), and [deployment](DEPLOYMENT.md). Preview capabilities and authenticated navigation are distinct models, not interchangeable permissions.
