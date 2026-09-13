# Testing

The web package uses Node's built-in `node:test` and `node:assert/strict`, not Vitest/Jest/Playwright. Backend Vitest tests are a separate project.

## Commands

From `web/`:

```sh
npm ci
npm run typecheck
npm run lint
npm run test:preview
npm run build
npm run preview
```

`typecheck` runs `tsc -b --noEmit`; `lint` runs Oxlint; `test:preview` runs `node --test tests/preview.test.mjs`; `build` runs `tsc -b && vite build`. `preview` serves an existing build for manual review. No web coverage or general `test` script is configured.

## Automated scope

`web/tests/preview.test.mjs` transpiles actual TypeScript modules with `typescript.transpileModule`, substitutes module dependencies, and imports them for testing. It stubs React's `useSyncExternalStore` to return a snapshot; it does not render components or exercise subscription-driven browser updates.

The suite covers:

- Role capability/section visibility distinctions, including no Customers directory.
- Product validation, image type/size rules, Active/Draft visibility, shared catalogue overlays, and replaced object-URL cleanup.
- Support message validation, sample conversation ownership, replies, and statuses.
- Delivered/completed purchase eligibility, integer stars, text limits, duplicates, rating summaries, and store publication.
- Inventory validation, duplicate SKUs, stock thresholds, installer verification/contact/job counts.
- Exact peso/minor-unit formatting and line totals.
- Project validation, order-to-project resolution, both staff roles' updates, and linked sales synchronization.

There is no configured coverage threshold or measured coverage report. These tests do not establish browser rendering, image decoding, keyboard access, responsiveness, real network integration, or production availability.

## Manual preview checks

Use API-free mode and in-app links to preserve the same document:

1. Create/edit an Active and a Draft Moderator product. Verify Owner read-only views and storefront visibility; try replacing/removing/cancelling an image.
2. Add/edit/delete inventory and installers. Check validation, confirmation, search/filter, and derived metrics.
3. Update a project from both Projects and Orders & Sales. Verify linked status/surface updates; customer fixture orders remain independent.
4. Send a customer support message, switch to Moderator, reply/resolve, then return through the in-app link.
5. Rate an eligible fictional purchase with each star choice; check undelivered/duplicate lockout and product/Moderator review display.
6. Check Owner-only moderator rows and request decisions. Verify direct-query denial, no Customers tab, and no Moderator-preview request submission.
7. Reload to confirm shared-memory reset; leave moderator management to confirm its separate unmount reset.
8. Check 390px, 430px, tablet and desktop layouts, keyboard controls, focus, reduced motion, legal pages and direct route refresh.

API-dependent scenarios in [the existing evaluation checklist](../web/TESTING_CHECKLIST.md) require a separately configured compatible backend. Do not treat them as available in an API-free deployment or apply preview rules to authenticated screens.

## Validation evidence

During this documentation pass, source/scripts and remote diffs are inspected, but **typecheck, lint, tests, build, browser checks, and local Git commands are not executed** because no shell/browser execution tool is available. No passing result is claimed. Historical backend counts are not current web evidence.

Before release, record the tested commit, Node/npm versions, command exit codes/output, browser/viewports, and any blocked checks. Review `git status`, `git diff --stat`, `git diff`, untracked files, and staged changes if applicable. Documentation-only diffs should contain no application, dependency, generated-output, or mobile changes.
