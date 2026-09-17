# Development

Run website commands in `web/`. There is no root npm package; `frontend/` is the mobile app.

## Prerequisites and setup

Use Git, npm, and Node compatible with locked Vite **8.2.1**: `^20.19.0 || >=22.12.0`. The lockfile resolves TypeScript **6.0.3** and uses lockfile format 3. No web `engines`, `packageManager`, or runtime-version file pins exact Node/npm versions. Backend CI's Node selection is not a web runtime pin.

```sh
cd web
npm ci
npm run dev
```

Use Vite's printed URL; default port is 5173 and configuration does not override it. No backend/database/mobile setup is needed for explicit previews.

## Environment

Leave `VITE_API_BASE_URL` absent/empty for API-free browsing. Copying `.env.example` unchanged selects `http://localhost:4000/api`; it is optional, not required. A configured but unavailable API produces errors, not silent fallback. Restart Vite after changing configuration.

POSIX-shell one-off API-free command:

```sh
VITE_API_BASE_URL= npm run dev
```

On other shells, configure an empty/unset value using that shell's syntax. Preview routes require no credentials.

## Exact scripts

| Command | Package script |
| --- | --- |
| `npm run dev` | `vite` |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm run lint` | `oxlint` |
| `npm run test:preview` | `node --test tests/preview.test.mjs` |
| `npm run build` | `tsc -b && vite build` |
| `npm run preview` | `vite preview` (serve an existing build locally) |

No web `test`, `test:watch`, `test:coverage`, or `format` script exists.

## Configuration

- `vite.config.ts`: React/Tailwind plugins, `@` alias to `src`, 1000 kB chunk warning threshold—not measured bundle size.
- `tsconfig.json`: app/config project references. App config uses ES2023/DOM, bundler resolution, React JSX, no emit, unused/fallthrough checks; it does not explicitly enable `strict`. Node config checks Vite configuration with NodeNext modules.
- `.oxlintrc.json`: React/TypeScript/Oxc plugins, hooks errors, component-export warnings.
- `components.json`: shadcn radix-nova, TSX, CSS variables, Lucide.
- Tailwind is CSS-first in `src/index.css`; no standalone Tailwind or web ESLint config is present.

## Troubleshooting

Missing scripts: enter `web/`. Engine errors: compare Node with the lockfile requirement. API errors: check whether an optional API URL is unintentionally set. Lost preview edits: reload/new tab resets shared memory; leaving moderator management resets its local rows. Missing new product: check Active status and category. Rejected image: use a nonempty, decodable JPEG/PNG/WebP at most 5 MiB. Deep-link refresh failures on another host: check SPA fallback.

See [testing](TESTING.md) and the [preview walkthrough](../web/docs/research-preview.md). Document mismatches rather than changing functionality to hide them.
