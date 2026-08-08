/**
 * Auth API — backend base route: /api/auth
 *
 * Endpoints, request/response shapes, and the full access-token/refresh-token
 * flow are documented in:
 *   - backend/README.md §3 ("Auth — /api/auth")
 *   - FRONTEND_HANDOFF.md §3 (the flow diagram + storage/retry guidance the
 *     frontend must follow)
 *   - backend/postman/PanelScan-Auth.postman_collection.json
 *
 * Not implemented yet. This is deliberately the most important file in api/ to
 * get right — when implementing, follow FRONTEND_HANDOFF.md §3 exactly (token
 * storage, refresh-on-401, single-use rotation) rather than a generic pattern.
 */
export {};
