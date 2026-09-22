-- AlterTable: customer profile details + email verification status.
-- Additive only: every new column is nullable or has a default, so existing
-- rows and the currently deployed application keep working unchanged.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "birthdate" DATE;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "address" STRING;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "email_verified" BOOL NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE IF NOT EXISTS "email_verification_codes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "code_hash" STRING NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INT4 NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "email_verification_codes_user_id_idx" ON "email_verification_codes"("user_id");

-- AddForeignKey
ALTER TABLE "email_verification_codes" ADD CONSTRAINT "email_verification_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
