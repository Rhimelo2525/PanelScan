# Contributing

This private repository contains separate web, backend, and mobile projects. Obtain maintainer authorization and follow [LICENSE](LICENSE).

## Setup

```sh
git clone https://gitlab.com/grey-studio/panelscan.git
cd panelscan/web
npm ci
npm run dev
```

See [development](docs/DEVELOPMENT.md) for Node requirements and API-free setup.

## Changes and review

Use a focused branch from current `main` and a GitLab merge request targeting `main`. This is contribution guidance, not a claim that branch protections are configured. Do not force-push shared branches or rewrite published history.

Read source first. Preserve named components, type-only imports, `@/` aliases, existing error handling, shared primitives, and semantic CSS tokens. Most feature files use double quotes and no semicolons; match the file rather than reformatting unrelated code. There is no web formatting script; Oxlint is not a formatter.

Document actual behavior and distinguish previews from API integrations. Keep dependency/lockfile updates intentional. A documentation task must not redesign the UI, change application logic, add a backend, alter Android/mobile files, duplicate assets, or claim unimplemented capabilities.

## Verification

From `web/`:

```sh
npm run typecheck
npm run lint
npm run test:preview
npm run build
```

Follow [testing](docs/TESTING.md) for manual checks. From the repository root review `git status --short`, `git diff --stat`, and `git diff`; inspect untracked files separately and `git diff --cached` if staged. Exclude dependencies, build output, private configuration, and unrelated files.

The merge request should state scope, behavior changes (or none), actual validation results, blocked checks, and remaining questions. Include screenshots for UI changes. Never report unexecuted checks as passing. Security-policy and vulnerability work requires a separate maintainer-reviewed security workflow.
