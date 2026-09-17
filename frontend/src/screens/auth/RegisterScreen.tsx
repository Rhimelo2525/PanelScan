import { PlaceholderScreen } from '../../components/common/PlaceholderScreen';

/**
 * POST /api/auth/register — always creates a CUSTOMER account (role cannot be
 * set by the client) and returns only an access token, no refresh token — see
 * FRONTEND_HANDOFF.md §3.5.
 */
export default function RegisterScreen() {
  return <PlaceholderScreen title="Register" description="POST /api/auth/register" />;
}
