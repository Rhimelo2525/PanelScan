# Research-paper feature preview

Current references: [feature catalogue](../../docs/FEATURES.md), [roles](../../docs/ROLES_AND_PERMISSIONS.md), and [testing](../../docs/TESTING.md). Custom-order developer: `anxndd_`, **GreyStudio**.

Moderator preview can view shared sample Change Request statuses but cannot submit, approve, or reject requests. Submission exists only in API-dependent `/admin/requests`. Owner moderator additions create local rows, not accounts; those rows reset when the moderator-management component unmounts. Shared business/product/support/rating stores have the longer document lifetime described below.

## Routes and session scope

- `/moderator-preview?view=inventory`: add, edit, search, filter, and delete stock. Status follows quantity and reorder level. SKU uniqueness, whole quantities, and peso prices are validated.
- `/moderator-preview?view=installers`: add verified installers, edit contact details, specialty, coverage, availability, and job count; delete with confirmation.
- `/admin-preview`: Owner retains business operations and exclusive moderator management. Products are read-only. Support is absent from navigation and denied by direct query. Moderator account management remains exclusive to `/admin-preview?view=moderators`; the Moderator route denies that section even when requested directly.
- `/moderator-preview?view=products`: add/edit products using the existing catalogue schema, Active/Draft status, whole stock counts, exact peso prices, and a local image. Owner sees the same records and their origin/date/status. Active records appear in `/products` and detail pages during React Router navigation; drafts remain in the management overview only.
- `/support-preview`: send a fictional customer message. `/moderator-preview?view=support` uses the same conversation snapshot for replies/status and the authoritative rating store for customer reviews. Use in-app links to change preview roles without reloading.
- `/customer-preview`: fictional orders cover delivered, completed, pending, processing, preparing, shipped, and in-transit states. Only delivered/completed purchases can be rated. The footer links to this page, which links to the existing project preview.

Business records and ratings live in module memory. They survive React Router navigation and preview-role changes in the same page, but reset on a reload or a new tab. No new API, database, authentication, payment integration, external service, or browser storage is used. Existing authenticated routes and integrations are preserved.

Products and chat follow that same module-memory lifetime. Product images accept decoded JPEG/PNG/WebP files up to 5 MB; nothing is uploaded. Draft object URLs are released on replacement, removal, cancellation, or unmount. Saved image ownership transfers to the catalogue store until replacement/removal, hot-module disposal, or browser teardown. Never use sensitive images or personal information in demo messages.

In API-configured mode, locally managed products overlay a successful API catalogue and detail lookup checks local records first. API errors remain explicit; the preview never silently substitutes fixtures for a failed live API. Category slugs match local records even when API category IDs differ. Managed preview records show PHP prices but cannot enter real cart/checkout APIs. Unmodified live pricing and authenticated commerce are unchanged. For a fully backend-independent demonstration, use the existing API-free frontend deployment or the local command below.

## Ratings

Submission validates the fixture order and its purchased product, delivery status, integer stars from 1 through 5, review length, and the order/product duplicate key. A second delivered order for the same product may receive its own rating. Rating controls support native radio keyboard navigation. Submissions are final for the current preview; reloading clears them.

Product cards show the current average/count, and product details show feedback. These are explicitly labeled **preview ratings**, never represented as real customer reviews. An unrated product has no invented score. Current fictional purchases reference the catalog's PVC Ceiling Tile. This frontend preview does not publish ratings against authenticated backend orders.

## Currency

`src/lib/format-price.ts` owns PHP formatting for catalog/cart/order decimal strings, minor-unit totals, and numeric report/estimate values. Business previews display pesos. Amounts are not converted or multiplied when formatting; `90.00` displays as `₱90.00`. Existing sign-in requirements for live product pricing remain intact.

## Validation

Run `npm run test:preview`, `npm run typecheck`, `npm run lint`, and `npm run build` from `web`.

For local API-free preview testing without editing environment files, run `VITE_API_BASE_URL= npm run dev`. The default local configuration may point to a separately running backend.

Browser checklist: inventory and installer add/edit/delete/cancel; quantities and derived metrics; route-change continuity; Owner moderator creation; direct Moderator denial; every star choice and keyboard controls; undelivered lockout; duplicate lockout; rating propagation through product links; 390px, 430px, and desktop sheets/tables; storefront, projects, legal pages, and guarded-route navigation. Vercel continues using the existing `web` root and configuration.
