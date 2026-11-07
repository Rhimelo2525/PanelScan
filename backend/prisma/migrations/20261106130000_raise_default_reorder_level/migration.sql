-- Stock tiers become 0 Out of Stock, 1-15 Critical, 16-30 Low Stock, 31+ In Stock.
-- The tiers come from the reorder level (Critical is half of it), so the default
-- moves from 10 to 30, along with the products still on the old default.
-- AlterTable
ALTER TABLE "inventory" ALTER COLUMN "reorder_level" SET DEFAULT 30;

-- Products on the old default only; a level someone chose by hand is left alone.
UPDATE "inventory" SET "reorder_level" = 30 WHERE "reorder_level" = 10;
