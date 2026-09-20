-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "order_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "bookings_order_id_key" ON "bookings"("order_id");

-- CreateIndex
CREATE INDEX "bookings_order_id_idx" ON "bookings"("order_id");

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
