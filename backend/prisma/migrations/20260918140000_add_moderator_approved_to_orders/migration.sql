-- AlterTable
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "moderator_approved" BOOL NOT NULL DEFAULT false;
