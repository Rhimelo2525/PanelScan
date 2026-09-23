-- CreateTable
-- Charges the customer for the Lalamove delivery fee itself, separate from
-- "payments" (the product/order-total charge) - see prisma/schema.prisma's
-- DeliveryPayment model comment for why these are two different tables
-- rather than one.
CREATE TABLE "delivery_payments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "delivery_id" UUID NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "method" STRING NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "transaction_ref" STRING,
    "paid_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_payments_delivery_id_key" ON "delivery_payments"("delivery_id");

-- CreateIndex
CREATE UNIQUE INDEX "delivery_payments_transaction_ref_key" ON "delivery_payments"("transaction_ref");

-- CreateIndex
CREATE INDEX "delivery_payments_status_idx" ON "delivery_payments"("status");

-- AddForeignKey
ALTER TABLE "delivery_payments" ADD CONSTRAINT "delivery_payments_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
