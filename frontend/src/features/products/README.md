# features/products

Product browsing/search/details (public) and OWNER/MODERATOR catalog management
UI, built on `api/products.api.ts`.

Reference breakdown for when this feature is actually implemented (the pattern
every other `features/<name>/` folder should follow "where useful," per this
repo's scaffolding task — not pre-created empty for every module):

```
features/products/
├── components/   UI pieces specific to product browsing/editing
├── hooks/        e.g. useProductList, useProductDetails
├── types/        response shapes as they're actually integrated (never guessed
│                 ahead of backend/README.md §3 — see FRONTEND_HANDOFF.md §4.2)
└── utils/        e.g. price formatting
```
