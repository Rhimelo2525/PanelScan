/**
 * Matches the backend's `UserRole` enum exactly (backend/prisma/schema.prisma).
 * There is no fourth role and no client-defined role — the backend is always the
 * final authority on what a given role can do (FRONTEND_HANDOFF.md §2 and §4.2).
 */
export type UserRole = 'OWNER' | 'MODERATOR' | 'CUSTOMER';
