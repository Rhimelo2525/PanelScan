-- CreateTable
-- A customer's saved shipping addresses (profile "Shipping Addresses" and the
-- checkout address picker). Orders never reference this table - checkout
-- copies the chosen address into orders.delivery_location as a snapshot - so
-- editing or deleting a saved address never changes an existing order.
CREATE TABLE "customer_addresses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" UUID NOT NULL,
    "label" STRING,
    "recipient_name" STRING NOT NULL,
    "recipient_phone" STRING NOT NULL,
    "address_line1" STRING NOT NULL,
    "region_code" STRING NOT NULL,
    "region_name" STRING NOT NULL,
    "province_code" STRING,
    "province_name" STRING,
    "city_municipality_code" STRING NOT NULL,
    "city_municipality_name" STRING NOT NULL,
    "barangay_code" STRING NOT NULL,
    "barangay_name" STRING NOT NULL,
    "postal_code" STRING NOT NULL,
    "formatted_address" STRING NOT NULL,
    "latitude" FLOAT8 NOT NULL,
    "longitude" FLOAT8 NOT NULL,
    "is_default" BOOL NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "customer_addresses_customer_id_idx" ON "customer_addresses"("customer_id");

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
