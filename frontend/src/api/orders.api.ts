/**
 * Orders API — backend base route: /api/orders
 *
 * Documented in:
 *   - backend/README.md §3 ("Order — /api/orders")
 *   - backend/postman/PanelScan-Orders.postman_collection.json
 *
 * GET / is role-scoped (CUSTOMER sees only their own orders; MODERATOR/OWNER see
 * every order) — same endpoint, different results depending on the caller's role.
 * Not implemented yet.
 */
export {};
