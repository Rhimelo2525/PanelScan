-- AlterTable: customer profile picture reference (a relative storage path and
-- when it was uploaded - never image bytes). Both nullable, so existing rows
-- and the currently deployed application keep working unchanged.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "profile_picture_path" STRING;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "profile_picture_updated_at" TIMESTAMP(3);

-- CreateTable: append-only audit trail (who did what, from where).
CREATE TABLE IF NOT EXISTS "activity_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "action" STRING NOT NULL,
    "metadata" JSONB,
    "ip_address" STRING,
    "user_agent" STRING,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "activity_logs_user_id_created_at_idx" ON "activity_logs"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "activity_logs_action_idx" ON "activity_logs"("action");

-- AddForeignKey: SET NULL, not CASCADE - the trail must outlive the account.
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
