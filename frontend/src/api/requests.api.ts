/**
 * Requests API — backend base route: /api/requests
 *
 * Documented in:
 *   - backend/README.md §3 ("Request Approval — /api/requests")
 *   - backend/postman/PanelScan-Requests.postman_collection.json
 *
 * An internal MODERATOR → OWNER approval workflow — CUSTOMER has zero access
 * (403 on every route). No CUSTOMER-facing screen should call this file.
 * Not implemented yet.
 */
export {};
