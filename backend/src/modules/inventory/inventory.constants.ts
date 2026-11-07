/**
 * The reorder level a product gets unless one is chosen, matching the column
 * default in schema.prisma. It sets the stock tiers (web/src/lib/stock-status.ts):
 * 0 Out of Stock, 1-15 Critical, 16-30 Low Stock, 31+ In Stock.
 */
export const DEFAULT_REORDER_LEVEL = 30;
