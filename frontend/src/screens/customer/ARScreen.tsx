import { PlaceholderScreen } from '../../components/common/PlaceholderScreen';

/**
 * AR measurement capture + panel estimate — POST /api/ar/measurements then
 * POST /api/ar/estimate. The AR scanning itself is a mobile-SDK concern with no
 * backend code involved (backend/README.md §3, "AR Support").
 */
export default function ARScreen() {
  return <PlaceholderScreen title="AR Measurement" description="POST /api/ar/measurements, POST /api/ar/estimate" />;
}
