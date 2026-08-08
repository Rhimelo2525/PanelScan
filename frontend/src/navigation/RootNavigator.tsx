import { NavigationContainer } from '@react-navigation/native';

import type { UserRole } from '../types/roles';
import AuthNavigator from './AuthNavigator';
import CustomerNavigator from './CustomerNavigator';
import ModeratorNavigator from './ModeratorNavigator';
import OwnerNavigator from './OwnerNavigator';

/**
 * Top-level navigator. Branches on the authenticated user's actual role — this
 * is a UX convenience only; the backend re-enforces every permission on every
 * request regardless of what this navigator shows (FRONTEND_HANDOFF.md §3.6, §4.2).
 * Never derive `currentRole` by decoding the JWT client-side — read it from the
 * `user.role` field returned by POST /api/auth/login (FRONTEND_HANDOFF.md §3.1).
 *
 * `currentRole` is a placeholder prop for this scaffolding pass. Once real auth
 * state exists (src/store/), this should read from that instead of being passed
 * in as a prop, and should default to `null` (→ AuthNavigator) until a stored
 * session is restored or the user logs in.
 */
export interface RootNavigatorProps {
  currentRole?: UserRole | null;
}

const renderNavigatorForRole = (role: UserRole | null) => {
  if (role === 'OWNER') return <OwnerNavigator />;
  if (role === 'MODERATOR') return <ModeratorNavigator />;
  if (role === 'CUSTOMER') return <CustomerNavigator />;
  return <AuthNavigator />;
};

export default function RootNavigator({ currentRole = null }: RootNavigatorProps) {
  return <NavigationContainer>{renderNavigatorForRole(currentRole)}</NavigationContainer>;
}
