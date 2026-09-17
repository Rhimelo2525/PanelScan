-- AlterTable
ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN "google_id" STRING;

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");
