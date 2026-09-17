import type { UserRole } from '../types/roles';

/** Display labels for each backend role (types/roles.ts) — UI-only, never sent to the API. */
export const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: 'Owner',
  MODERATOR: 'Moderator',
  CUSTOMER: 'Customer',
};
