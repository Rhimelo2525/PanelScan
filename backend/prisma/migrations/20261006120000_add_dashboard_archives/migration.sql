-- 30-day dashboard archives (owner Archives page). A new standalone table:
-- no existing table or column is changed.
-- CreateTable
CREATE TABLE "dashboard_archives" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cycle_number" INT4 NOT NULL,
    "cycle_title" STRING NOT NULL,
    "metric_types_included" JSONB NOT NULL,
    "start_timestamp" TIMESTAMPTZ(3) NOT NULL,
    "end_timestamp" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "total_gross_revenue" DECIMAL(14,2) NOT NULL,
    "total_orders_count" INT4 NOT NULL,
    "revenue_over_time_data" JSONB NOT NULL,
    "product_demand_data" JSONB NOT NULL,
    "orders_by_status_data" JSONB NOT NULL,

    CONSTRAINT "dashboard_archives_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_archives_cycle_number_key" ON "dashboard_archives"("cycle_number");

-- CreateIndex
CREATE UNIQUE INDEX "dashboard_archives_start_timestamp_key" ON "dashboard_archives"("start_timestamp");

