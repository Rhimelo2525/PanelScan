-- AlterTable
ALTER TABLE "deliveries" ADD COLUMN     "delivery_provider" STRING DEFAULT 'LALAMOVE';
ALTER TABLE "deliveries" ADD COLUMN     "delivery_status" STRING DEFAULT 'NOT_REQUESTED';
ALTER TABLE "deliveries" ADD COLUMN     "provider_metadata" JSONB;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "delivery_location" JSONB;
