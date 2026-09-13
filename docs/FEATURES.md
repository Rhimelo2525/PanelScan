# Features

Explicit previews are fictional and frontend-only. API-dependent interfaces below are implemented screens, not confirmed production-backed services. Source paths are under `web/src/`.

| Feature | Location / source | Behavior, access, and boundary |
| --- | --- | --- |
| Storefront | `/`; `pages/home-page.tsx`, `components/home/` | Public panel-line, ordering, installation, and business presentation with representative assets. |
| Catalogue | `/products`; `pages/products-page.tsx`, `api/products.ts` | Public search, wall/ceiling categories, newest/name sorting, loading/error/empty states. Local without API; successful API results receive managed-product overlays otherwise. |
| Product details | `/products/:id`; `pages/product-detail-page.tsx` | Gallery, stock, specs, related products, pricing, preview reviews. Category scope and non-PVC reference notices are distinct; samples are not verified client stock. |
| Product management | Staff preview `?view=products`; `ProductManagementPreview` | Moderator add/edit name, category, description, peso price, material, quantity, Active/Draft status. Owner reads the same listings. Active listings flow to storefront; drafts stay in management. |
| Images | Product editor; `preview/product-policy.ts`, `product-store.ts` | New products require decoded JPEG/PNG/WebP, nonempty and at most 5 MiB. Object URLs support selection/replacement/removal; no upload server. |
| Inventory | Staff preview `?view=inventory`; `BusinessManagementPreview` | Both staff roles add/edit/delete, search/filter items; SKU uniqueness, whole counts, prices, location, derived stock status/metrics. Separate from catalogue inventory fields. |
| Installers | Staff preview `?view=installers`; same component | Both staff roles add/edit/delete, search/filter name, contact, specialty, coverage, availability, job count. Verification checkbox is a sample assertion, not external verification. |
| Orders & sales | Staff preview `?view=sales` (`orders` alias); `AdminOperationalPreview` | Both roles update order statuses and open linked project updates. Payment text and summary metrics are illustrative; no transaction occurs. |
| Projects | Staff preview `?view=projects`; `preview/business-store.ts` | Both roles update status, required surface (up to 120 characters), notes (up to 500). Project status/surface also update linked sales. Customer fixtures are not changed. |
| Support | `/support-preview`, Moderator `?view=support`; `preview/support-store.ts` | Customer messages/replies share one document's conversation. Customer send → OPEN, Moderator reply → AWAITING_CUSTOMER; Moderator can resolve. Owner has no Support workspace. No cross-device chat. |
| Reviews | `/customer-preview`; `preview/rating-policy.ts`, `rating-store.ts` | A purchased product in a DELIVERED/COMPLETED fixture order accepts integer 1–5 stars, optional text up to 500 characters, once per order/product. Final for that preview; reload clears. |
| Review display | Product cards/details, Moderator Support & Feedback | Shared average/count and comments; unrated products have no invented score. Labeled preview ratings, not published customer reviews. |
| Owner workspace | `/admin-preview`; `AdminPreviewWorkspace` | Operational previews, read-only Products, request decisions, moderator-record management. No Customers tab or Support workspace. |
| Moderator workspace | `/moderator-preview` | Products, inventory, sales/projects, installers, support/reviews, request status view. No moderator management or request decisions. |
| Moderator records | Owner `?view=moderators`; `ModeratorManagementPreview` | Add/view/disable/remove local rows. Does not create logins/invitations. Edit permissions displays a notice only. Component unmount resets rows. |
| Change Requests | Staff preview `?view=requests` | Shared sample rows; Owner changes PENDING/APPROVED/REJECTED status; Moderator views outcomes. No preview submission, submitter-specific filtering, or underlying operation execution. |
| Customer orders | `/customer-preview`; `data/customer-order-preview.ts` | Filter fixed fictional purchases and rate eligible items. Not synchronized with Admin sales. |
| Project results | `/projects-preview`, guarded `/projects`; `projects/project-results-repository.ts` | Both return DEMO_FALLBACK measurements/estimates/thumbnails/status. No mobile synchronization, browser measurement, or interactive 3D renderer. |
| Account/commerce | `/login`, `/register`, `/dashboard`, cart/checkout/orders/payment routes | API-dependent account, cart, order and PayMongo handoff/confirmation interfaces. Managed local listings cannot enter real checkout. |
| Customer services | `/messages`, `/installation`, `/feedback`; `api/support.ts` | API-dependent messaging, installation requests/cancellation, and order-level feedback; not the preview product-review flow. |
| Authenticated Admin | `/admin/*`; `pages/admin/` | Separate API-dependent operations. Request submission exists here; permissions differ from preview. See the roles document. |
| Responsive UI | Layout components, `DataTable`, CSS | Mobile navigation, table cards below md, responsive sheets/forms and reduced-motion rules. Source implementation is not a browser certification. |
| Legal/about | `/about`, `/terms`, `/privacy` | Public content; legal text covers broader/future contexts and needs business/legal review. It does not prove those services are live. |

Dashboard/request metrics are static examples, and the operational Refresh button reports a toast rather than re-fetching business data. Inventory/installer metrics are derived from their current rows. Product imagery may be representative or a local selection, not approved photography.

See [architecture](ARCHITECTURE.md) for data separation and [roles](ROLES_AND_PERMISSIONS.md) for implementation gaps against business expectations.
