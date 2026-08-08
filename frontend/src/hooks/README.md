# hooks

App-wide reusable hooks that aren't specific to one feature (e.g. a future
`useAuth()` reading session state from `src/store/`, once that exists).
Feature-specific hooks (e.g. `useProductList`) belong in the owning
`features/<name>/hooks/` folder instead.
