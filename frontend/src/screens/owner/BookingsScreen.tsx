import { PlaceholderScreen } from '../../components/common/PlaceholderScreen';

/**
 * View-only oversight: GET /api/bookings/all, GET /:id — OWNER cannot approve a
 * booking or assign an installer (PATCH /:id/status and /:id/assign-installer
 * are MODERATOR-only, verified in booking.routes.ts).
 */
export default function BookingsScreen() {
  return <PlaceholderScreen title="Bookings" description="GET /api/bookings/all (view-only)" />;
}
