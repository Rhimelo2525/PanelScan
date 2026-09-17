import { PlaceholderScreen } from '../../components/common/PlaceholderScreen';

/**
 * View-only oversight: GET /api/delivery, GET /:id — create/update/mark-delivered/
 * delete are MODERATOR-only (verified in delivery.routes.ts). Not in this task's
 * original screen list, added after cross-checking against the backend.
 */
export default function DeliveryScreen() {
  return <PlaceholderScreen title="Delivery" description="GET /api/delivery (view-only)" />;
}
