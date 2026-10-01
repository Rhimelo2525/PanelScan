-- Progressive login lockout state (see LoginThrottle in schema.prisma).

-- CreateTable
CREATE TABLE IF NOT EXISTS "login_throttles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "identifier_hash" STRING NOT NULL,
    "failed_attempts" INT4 NOT NULL DEFAULT 0,
    "lock_count" INT4 NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "last_failed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "login_throttles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "login_throttles_identifier_hash_key" ON "login_throttles"("identifier_hash");
