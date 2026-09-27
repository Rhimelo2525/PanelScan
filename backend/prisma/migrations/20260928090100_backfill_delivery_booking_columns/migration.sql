-- Copies the booking details already recorded inside provider_metadata into
-- the new typed columns for deliveries booked before they existed. A
-- separate migration because CockroachDB cannot write to a column in the
-- same transaction that adds it.
UPDATE "deliveries"
SET
  "vehicle_type" = COALESCE("vehicle_type", "provider_metadata"->>'vehicleType'),
  "tracking_url" = COALESCE("tracking_url", "provider_metadata"->>'trackingUrl'),
  "booked_at" = COALESCE("booked_at", ("provider_metadata"->>'bookedAt')::TIMESTAMP(3))
WHERE "lalamove_order_id" IS NOT NULL AND "provider_metadata" IS NOT NULL;
