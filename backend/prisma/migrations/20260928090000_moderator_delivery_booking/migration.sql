-- Moderator-driven Lalamove booking: the moderator (not the customer) picks
-- the vehicle and books, and the fee Lalamove returns is shown to the
-- customer. These values used to live only inside provider_metadata.
ALTER TABLE "deliveries" ADD COLUMN "vehicle_type" STRING;
ALTER TABLE "deliveries" ADD COLUMN "shipping_fee" DECIMAL(12,2);
ALTER TABLE "deliveries" ADD COLUMN "tracking_url" STRING;
ALTER TABLE "deliveries" ADD COLUMN "booked_at" TIMESTAMP(3);
ALTER TABLE "deliveries" ADD COLUMN "booked_by_id" UUID;
ALTER TABLE "deliveries" ADD COLUMN "booking_error" STRING;
ALTER TABLE "deliveries" ADD COLUMN "booking_failed_at" TIMESTAMP(3);
