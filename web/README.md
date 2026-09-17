# PanelScan web frontend

Custom-order developer: **`anxndd_`**  
Development company: **GreyStudio**  
Business presented by the application: **Disenyo Interior Solution**

Production: [panelscan-one.vercel.app](https://panelscan-one.vercel.app/).

The website is a React/TypeScript/Vite frontend. The separate repository backend and Expo app are not part of its Vercel deployment. Public catalogue fallback and explicit previews work without an API; authentication, real commerce and API-dependent services require separate integration.

## Documentation

Use the [root README](../README.md) as the current project overview:

- [Architecture and routes](../docs/ARCHITECTURE.md)
- [Development and exact scripts](../docs/DEVELOPMENT.md)
- [Vercel deployment](../docs/DEPLOYMENT.md)
- [Features](../docs/FEATURES.md)
- [Roles and implementation differences](../docs/ROLES_AND_PERMISSIONS.md)
- [Repository structure](../docs/PROJECT_STRUCTURE.md)
- [Design system and actual assets](../docs/DESIGN_SYSTEM.md)
- [Testing and validation limits](../docs/TESTING.md)
- [Contribution guidelines](../CONTRIBUTING.md) and [license](../LICENSE)

The existing [preview walkthrough](docs/research-preview.md) and [evaluation checklist](TESTING_CHECKLIST.md) complement these references; neither is a record of completed validation.

## Start locally

```sh
npm ci
npm run dev
```

Run from `web/`. Leave `VITE_API_BASE_URL` unset/empty for API-free mode. The optional `.env.example` selects a local API if copied unchanged.

## Preview scope

`/admin-preview` and `/moderator-preview` are interactive operational demonstrations, not read-only snapshots. Shared products, business rows, support messages and ratings last until document reload. Moderator-management rows also reset on component unmount. Use in-app links rather than opening a new tab when demonstrating shared changes.

Neither staff preview has a Customers directory. Moderator preview cannot submit or decide Change Requests; submission exists in the separate API-dependent `/admin/requests` screen. Owner moderator additions do not create accounts, and permission editing is informational only. Both customer project-result routes currently return samples, not mobile synchronization.
