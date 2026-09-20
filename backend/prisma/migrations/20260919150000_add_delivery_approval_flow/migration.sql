-- CreateEnum
CREATE TYPE "DeliveryApprovalStatus" AS ENUM ('NOT_REQUESTED', 'PENDING_APPROVAL', 'APPROVED', 'DECLINED');

-- AlterTable
ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "approval_status" "DeliveryApprovalStatus" NOT NULL DEFAULT 'NOT_REQUESTED';
ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "requested_at" TIMESTAMP(3);
ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMP(3);
ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "approved_by_id" UUID;
ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "declined_at" TIMESTAMP(3);
ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "decline_reason" STRING;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "deliveries_approval_status_idx" ON "deliveries"("approval_status");
