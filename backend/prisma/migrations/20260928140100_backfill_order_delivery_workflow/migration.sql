-- Moves orders that are still in progress onto the order-driven delivery
-- workflow. A separate migration because CockroachDB cannot write to a
-- column in the same transaction that adds it.
--
-- Only unbooked deliveries change. Booked Lalamove deliveries, shipped or
-- delivered orders, and every payment row are left exactly as they are.
-- Orders paid before shipping was part of the order total keep their
-- product-only payment (orders.shipping_fee stays 0) and become "Ready to
-- book"; approved-but-unpaid orders now wait for a shipping quote.

-- 1. In-progress orders with no delivery record get one.
INSERT INTO "deliveries" ("order_id", "address", "approval_status", "requested_at", "delivery_status", "delivery_provider", "updated_at")
SELECT
  o."id",
  o."shipping_address",
  (CASE WHEN o."moderator_approved" THEN 'APPROVED' ELSE 'PENDING_APPROVAL' END)::"DeliveryApprovalStatus",
  o."created_at",
  CASE
    WHEN NOT o."moderator_approved" THEN 'AWAITING_ORDER_APPROVAL'
    WHEN p."status" = 'PAID' THEN 'READY_TO_BOOK'
    ELSE 'AWAITING_QUOTE'
  END,
  'LALAMOVE',
  now()
FROM "orders" o
LEFT JOIN "payments" p ON p."order_id" = o."id"
LEFT JOIN "deliveries" d ON d."order_id" = o."id"
WHERE d."id" IS NULL AND o."status" IN ('PENDING', 'PROCESSING');

-- 2. Unbooked deliveries of in-progress orders (old customer "request
-- delivery" states) move to the stage their order is actually at.
UPDATE "deliveries" AS d
SET
  "approval_status" = (CASE WHEN o."moderator_approved" THEN 'APPROVED' ELSE 'PENDING_APPROVAL' END)::"DeliveryApprovalStatus",
  "delivery_status" = CASE
    WHEN NOT o."moderator_approved" THEN 'AWAITING_ORDER_APPROVAL'
    WHEN p."status" = 'PAID' THEN 'READY_TO_BOOK'
    ELSE 'AWAITING_QUOTE'
  END,
  "updated_at" = now()
FROM "orders" o
LEFT JOIN "payments" p ON p."order_id" = o."id"
WHERE d."order_id" = o."id"
  AND d."lalamove_order_id" IS NULL
  AND o."status" IN ('PENDING', 'PROCESSING')
  AND (d."delivery_status" IS NULL OR d."delivery_status" IN ('NOT_REQUESTED', 'NOT_SCHEDULED', 'VEHICLE_SELECTED', 'BOOKING_FAILED', 'PREPARING'));

-- 3. Unbooked deliveries of cancelled orders are cancelled with them.
UPDATE "deliveries" AS d
SET "delivery_status" = 'CANCELED', "updated_at" = now()
FROM "orders" o
WHERE d."order_id" = o."id"
  AND d."lalamove_order_id" IS NULL
  AND o."status" = 'CANCELLED'
  AND (d."delivery_status" IS NULL OR d."delivery_status" IN ('NOT_REQUESTED', 'NOT_SCHEDULED', 'VEHICLE_SELECTED', 'BOOKING_FAILED', 'PREPARING'));
