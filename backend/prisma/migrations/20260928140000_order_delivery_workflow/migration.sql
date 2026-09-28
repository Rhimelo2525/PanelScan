-- Delivery is part of the order lifecycle: the moderator quotes the shipping
-- fee after approving the order, and the customer pays products + shipping
-- in one PayMongo payment. The estimate lives in the existing
-- orders.shipping_fee / orders.total_amount; this only records WHEN it was
-- quoted, so "not quoted yet" is never mistaken for a PHP 0.00 fee.
ALTER TABLE "deliveries" ADD COLUMN "quoted_at" TIMESTAMP(3);
