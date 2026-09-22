-- AlterTable: the real Lalamove order id, once a delivery is actually
-- booked with the provider. Nullable and unique - additive only, existing
-- rows and the currently deployed application keep working unchanged.
ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "lalamove_order_id" STRING;
CREATE UNIQUE INDEX IF NOT EXISTS "deliveries_lalamove_order_id_key" ON "deliveries"("lalamove_order_id");
