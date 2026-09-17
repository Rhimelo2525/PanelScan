import { PlaceholderScreen } from '../../components/common/PlaceholderScreen';

/**
 * Full catalog CRUD: POST/PATCH/DELETE /api/products and /api/categories both
 * require OWNER or MODERATOR — verified directly against product.routes.ts and
 * category.routes.ts. Not in this task's original screen list, added here after
 * cross-checking against the backend, per this task's own "verify permissions
 * against the backend" instruction.
 */
export default function ProductsScreen() {
  return <PlaceholderScreen title="Products" description="POST/PATCH/DELETE /api/products" />;
}
