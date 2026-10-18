-- 3D preview settings for each product (product.panel3d.ts). Three new nullable
-- columns: no existing table or column is changed.
-- AlterTable
ALTER TABLE "products" ADD COLUMN     "panel_profile" STRING;
ALTER TABLE "products" ADD COLUMN     "groove_count" INT4;
ALTER TABLE "products" ADD COLUMN     "surface_image_url" STRING;
