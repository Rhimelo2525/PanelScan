-- Staff inbox state for a support conversation (pinned / archived). Two new
-- nullable columns: no existing table or column is changed.
-- AlterTable
ALTER TABLE "chat_rooms" ADD COLUMN     "pinned_at" TIMESTAMP(3);
ALTER TABLE "chat_rooms" ADD COLUMN     "archived_at" TIMESTAMP(3);
