# features/auth

Login/register/logout UI logic and session state, built on `api/auth.api.ts`.
This is the most important feature folder to get right — follow
`FRONTEND_HANDOFF.md` §3 exactly (token storage, refresh-on-401, single-use
rotation) once real implementation starts.

When this feature is actually built, break it out the way `features/products/`
is shown as the reference example in this repo's scaffolding task: `components/`,
`hooks/`, `types/`, `utils/` — added as they're actually needed, not pre-created
empty.
