# components/forms

Reusable form primitives (labeled inputs, form-level error display for
`ApiErrorResponse.errors` field-level messages — see `types/api.ts` and
FRONTEND_HANDOFF.md §4). Feature-specific forms (e.g. the checkout shipping-address
form) belong in the owning `features/<name>/` folder instead, built from these.
