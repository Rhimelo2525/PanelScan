# store

App-wide client state — primarily the authenticated session (current user,
role, access/refresh tokens once `features/auth` is implemented) and anything
else that genuinely needs to be shared across screens (e.g. cart contents,
if not fetched fresh from `GET /api/cart` each time).

No state management library is installed yet (deliberately, per this repo's
scaffolding task — "do not install unnecessary libraries just because they
might be useful later"). Pick one (Context, Zustand, Redux Toolkit, etc.) when
`features/auth` is actually implemented and the real requirements are known.
