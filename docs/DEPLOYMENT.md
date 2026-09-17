# Deployment

Current documented production URL: **[https://panelscan-one.vercel.app/](https://panelscan-one.vercel.app/)**. It matches the pre-existing web README and handoff address. The configuration does not encode a domain assignment; availability, exact deployed commit, and Vercel dashboard values were not independently checked.

## Recorded settings

| Setting | Value and evidence |
| --- | --- |
| Root Directory | `web`, recorded in existing deployment documentation; consistent with config/package placement, not a field in the JSON |
| Framework | Vite, confirmed by package/config; existing guidance names the Vite preset |
| Install | `npm ci` |
| Build | `npm run build` → `tsc -b && vite build` |
| Output | `dist` relative to `web` (`web/dist`) |
| SPA fallback | Source `/(.*)` → destination `/index.html` |

Install/build/output/rewrite settings come directly from [`web/vercel.json`](../web/vercel.json). The rewrite lets BrowserRouter handle direct application URLs. This deployment does not build the existing backend or Expo app. No exact web Node version is pinned; use locked Vite's supported range from [development](DEVELOPMENT.md).

## Configuration and verification

API-free mode needs no environment variables. Nonempty `VITE_API_BASE_URL` selects a separately hosted API; it does not provision that service. The loopback example is for local development, not a production backend address. Frontend variables are public build-time settings; changes require rebuilding assets.

From `web/`:

```sh
npm ci
npm run typecheck
npm run lint
npm run test:preview
npm run build
npm run preview
```

After deployment, check homepage, catalogue/details, legal pages, and all explicit previews. Open and refresh deep links to verify routing. Test same-document role switching separately from reload, which intentionally clears preview memory. These are instructions, not recorded successful results.

## Automation limits

`.github/workflows/backend-ci.yml` defines backend-only GitHub Actions checks. It neither validates nor deploys the website and does not establish a running GitLab pipeline. No `.gitlab-ci.yml` exists in the inspected root. The repository does not confirm automatic Vercel deploy-on-push, CLI deploy commands, hooks, release approvals, or rollback automation. No deployment credentials are included here.
