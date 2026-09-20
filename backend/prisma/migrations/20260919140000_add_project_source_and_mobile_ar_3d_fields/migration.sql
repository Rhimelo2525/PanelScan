-- CreateEnum
CREATE TYPE "ProjectSource" AS ENUM ('MANUAL', 'MOBILE_AR_3D');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "source" "ProjectSource" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "external_project_id" STRING;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "ar_data_url" STRING;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "ar_metadata" JSONB;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "three_d_model_url" STRING;
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "three_d_metadata" JSONB;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "projects_source_idx" ON "projects"("source");
CREATE INDEX IF NOT EXISTS "projects_external_project_id_idx" ON "projects"("external_project_id");
